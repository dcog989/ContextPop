// Chrome loads only this file as a service worker; Firefox lists the scripts in the manifest.
if (typeof DEFAULT_ENGINES === 'undefined' && typeof importScripts === 'function') {
  importScripts('defaultEngines.js', 'storage.js');
}

const OPEN_METHODS = Object.freeze(['newTab', 'backgroundTab', 'currentTab', 'newWindow']);
const HTTP_URL_PATTERN = /^https?:\/\//i;
const ICON_CACHE_PREFIX = 'icon:';
const MAX_ICON_BYTES = 256 * 1024;
const BASE64_CHUNK_SIZE = 0x8000;
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;

const DISPOSITIONS = Object.freeze({
  newTab: 'NEW_TAB',
  backgroundTab: 'NEW_TAB',
  currentTab: 'CURRENT_TAB',
  newWindow: 'NEW_WINDOW',
});

const iconMemoryCache = new Map();

async function seedStorage() {
  const engines = await loadEngines();
  if (!engines.length) await saveEngines(defaultEngineList());

  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  if (!result[STORAGE_KEYS.settings]) await saveSettings(defaultSettings());
}

function resolveOpenMethod(method, sender) {
  let resolved = OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod;
  if (resolved === 'currentTab' && sender?.tab?.id == null) resolved = 'newTab';
  return resolved;
}

function dispositionFor(method) {
  return DISPOSITIONS[OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod];
}

async function openUrl(url, method, sender) {
  const openMethod = resolveOpenMethod(method, sender);
  const openerTabId = sender?.tab?.id;

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

async function openSearch({ engine, terms, method }, sender) {
  const query = String(terms ?? '');

  if (engine.source === 'browser') {
    if (typeof api.search?.search !== 'function') throw new Error('Browser engine search is unavailable');
    await api.search.search({
      engine: engine.browserEngineName,
      text: query,
      disposition: dispositionFor(method),
    });
    return;
  }

  if (!engine.template.includes('{searchTerms}')) throw new Error('Engine template is missing {searchTerms}');
  if (!HTTP_URL_PATTERN.test(engine.template)) throw new Error('Engine template must use http or https');

  const url = buildSearchUrl(engine.template, query);
  if (engine.resultView === 'popup') {
    await api.windows.create({ url, type: 'popup', width: POPUP_WIDTH, height: POPUP_HEIGHT });
    return;
  }
  await openUrl(url, method, sender);
}

async function openDefaultSearch({ terms, method }) {
  const text = String(terms ?? '');
  const disposition = dispositionFor(method);

  if (typeof api.search?.query === 'function') {
    await api.search.query({ text, disposition });
    return;
  }
  if (typeof api.search?.search === 'function') {
    await api.search.search({ text, disposition });
    return;
  }
  throw new Error('Browser search is unavailable');
}

async function openReference({ template, terms }) {
  const value = String(template ?? '');
  if (!value.includes('{searchTerms}')) throw new Error('Provider template is missing {searchTerms}');
  if (!HTTP_URL_PATTERN.test(value)) throw new Error('Provider template must use http or https');
  await api.windows.create({
    url: buildSearchUrl(value, String(terms ?? '')),
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  });
}

async function openLink({ url, method }, sender) {
  const value = String(url ?? '');
  if (!HTTP_URL_PATTERN.test(value)) throw new Error('Link must use http or https');
  await openUrl(value, method, sender);
}

async function hasClipboardPermission() {
  if (!api.permissions?.contains) return true;
  try {
    return await api.permissions.contains({ permissions: ['clipboardWrite'] });
  } catch {
    return true;
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

function templateHost(template) {
  try {
    return new URL(String(template).replace(/\{searchTerms\}/g, 'x')).host;
  } catch {
    return '';
  }
}

function engineIconSource(engine, settings) {
  if (engine.icon) return engine.icon;
  if (engine.source === 'browser') return '';
  const provider = settings?.faviconProvider || DEFAULT_SETTINGS.faviconProvider;
  if (provider === 'none') return '';
  const host = templateHost(engine.template);
  if (!host) return '';
  if (provider === 'duckduckgo') return `https://icons.duckduckgo.com/ip3/${host}.ico`;
  return `https://${host}/favicon.ico`;
}

async function loadIconMap(engines, settings) {
  const icons = {};
  await Promise.all(
    engines.map(async (engine) => {
      const source = engineIconSource(engine, settings);
      if (!source) return;
      const dataUrl = await resolveIcon(source);
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
    case 'getIcons': {
      const [engines, settings] = await Promise.all([loadEngines(), loadSettings()]);
      return loadIconMap(engines, settings);
    }
    case 'hasClipboard':
      return hasClipboardPermission();
    case 'search': {
      const engines = await loadEngines();
      const engine = engines.find((item) => item.id === message.engineId);
      if (!engine) throw new Error(`Unknown search engine: ${message.engineId}`);
      await openSearch({ engine, terms: message.terms, method: message.method }, sender);
      return { ok: true };
    }
    case 'searchBrowser':
      await openDefaultSearch({ terms: message.terms, method: message.method });
      return { ok: true };
    case 'openLink':
      await openLink({ url: message.url, method: message.method }, sender);
      return { ok: true };
    case 'openReference':
      await openReference({ template: message.template, terms: message.terms });
      return { ok: true };
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
