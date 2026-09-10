// Chrome loads only this file as a service worker; Firefox lists the scripts in the manifest.
if (typeof DEFAULT_ENGINES === 'undefined' && typeof importScripts === 'function') {
  importScripts('defaultEngines.js', 'storage.js');
}

const OPEN_METHODS = Object.freeze(['newTab', 'backgroundTab', 'currentTab', 'newWindow']);
const HTTP_URL_PATTERN = /^https?:\/\//i;
const ICON_CACHE_PREFIX = 'icon:';
const MAX_ICON_BYTES = 256 * 1024;
const BASE64_CHUNK_SIZE = 0x8000;

const iconMemoryCache = new Map();

async function seedStorage() {
  const engines = await loadEngines();
  if (!engines.length) await saveEngines(defaultEngineList());

  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  if (!result[STORAGE_KEYS.settings]) await saveSettings({ ...DEFAULT_SETTINGS });
}

async function openSearch({ engine, terms, method }, sender) {
  const url = buildSearchUrl(engine, terms);
  const openerTabId = sender?.tab?.id;
  let openMethod = OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod;
  if (openMethod === 'currentTab' && openerTabId == null) openMethod = 'newTab';

  switch (openMethod) {
    case 'currentTab':
      await api.tabs.update(openerTabId, { url });
      break;
    case 'backgroundTab':
      await api.tabs.create({ url, active: false, openerTabId });
      break;
    case 'newWindow':
      await api.windows.create({ url });
      break;
    default:
      await api.tabs.create({ url, active: true, openerTabId });
      break;
  }
}

function arrayBufferToDataUrl(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function readIconCache(url) {
  if (iconMemoryCache.has(url)) return iconMemoryCache.get(url);
  if (!api.storage.session) return undefined;
  try {
    const key = ICON_CACHE_PREFIX + url;
    const stored = await api.storage.session.get(key);
    if (stored[key] !== undefined) {
      iconMemoryCache.set(url, stored[key]);
      return stored[key];
    }
  } catch {
    // Session storage unavailable or over quota; fall back to memory-only caching.
  }
  return undefined;
}

async function writeIconCache(url, dataUrl) {
  iconMemoryCache.set(url, dataUrl);
  if (!api.storage.session) return;
  try {
    await api.storage.session.set({ [ICON_CACHE_PREFIX + url]: dataUrl });
  } catch {
    // Non-fatal: the in-memory cache still holds the value for this worker lifetime.
  }
}

async function resolveIcon(url) {
  if (!url) return null;
  if (url.startsWith('data:')) return url;
  if (!HTTP_URL_PATTERN.test(url)) return null;

  const cached = await readIconCache(url);
  if (cached !== undefined) return cached;

  let dataUrl = null;
  try {
    const response = await fetch(url, { credentials: 'omit', referrerPolicy: 'no-referrer' });
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const declaredLength = Number(response.headers.get('content-length') || 0);
    const withinLimit = !declaredLength || declaredLength <= MAX_ICON_BYTES;
    if (response.ok && contentType.startsWith('image/') && withinLimit) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength <= MAX_ICON_BYTES) dataUrl = arrayBufferToDataUrl(buffer, contentType);
    }
  } catch {
    dataUrl = null;
  }

  await writeIconCache(url, dataUrl);
  return dataUrl;
}

async function loadIconMap() {
  const engines = await loadEngines();
  const icons = {};
  await Promise.all(
    engines.map(async (engine) => {
      if (!engine.icon) return;
      const dataUrl = await resolveIcon(engine.icon);
      if (dataUrl) icons[engine.id] = dataUrl;
    }),
  );
  return icons;
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case 'getEngines': {
      let engines = await loadEngines();
      if (!engines.length) {
        engines = defaultEngineList();
        await saveEngines(engines);
      }
      return engines;
    }
    case 'getSettings':
      return loadSettings();
    case 'getIcons':
      return loadIconMap();
    case 'search': {
      const engines = await loadEngines();
      const engine = engines.find((item) => item.id === message.engineId);
      if (!engine) throw new Error(`Unknown search engine: ${message.engineId}`);
      if (!engine.template.includes('{searchTerms}')) {
        throw new Error('Engine template is missing {searchTerms}');
      }
      if (!HTTP_URL_PATTERN.test(engine.template)) {
        throw new Error('Engine template must use http or https');
      }
      await openSearch({ engine, terms: String(message.terms ?? ''), method: message.method }, sender);
      return { ok: true };
    }
    case 'openOptions':
      await api.runtime.openOptionsPage();
      return { ok: true };
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

api.runtime.onInstalled.addListener(() => {
  seedStorage().catch((error) => console.error('Context Smart: seed failed', error));
});

api.action.onClicked.addListener(() => {
  api.runtime.openOptionsPage();
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => sendResponse({ data }))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
