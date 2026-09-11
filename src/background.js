// Chrome loads only this file as a service worker; Firefox lists the scripts in the manifest.
if (typeof DEFAULT_ENGINES === 'undefined' && typeof importScripts === 'function') {
  importScripts('defaultEngines.js', 'storage.js');
}

const OPEN_METHODS = Object.freeze(['newTab', 'backgroundTab', 'currentTab', 'newWindow']);
const HTTP_URL_PATTERN = /^https?:\/\//i;
const ICON_CACHE_PREFIX = 'icon:';
const PENDING_ENGINE_PREFIX = 'pendingHost:';
const MAX_ICON_BYTES = 256 * 1024;
const MAX_MARKUP_BYTES = 512 * 1024;
const ICON_FETCH_TIMEOUT_MS = 4000;
const BASE64_CHUNK_SIZE = 0x8000;
const WELL_KNOWN_ICONS = [
  { path: '/favicon.svg', vector: true, size: 0 },
  { path: '/apple-touch-icon.png', vector: false, size: 180 },
  { path: '/favicon-32x32.png', vector: false, size: 32 },
  { path: '/favicon.ico', vector: false, size: 16 },
];
const ICON_RELATIONS = new Set(['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed']);
const LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
const ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
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
    await openBrowserSearch(engine, query, method, sender);
    return;
  }

  if (!engine.template.includes('{searchTerms}')) throw new Error('Engine template is missing {searchTerms}');
  if (!HTTP_URL_PATTERN.test(engine.template)) throw new Error('Engine template must use http or https');

  const url = buildSearchUrl(engine.template, query);
  await openUrl(url, method, sender);
}

const pendingEngineHost = new Map();
const pendingResolvers = new Map();
const PENDING_ENGINE_TTL_MS = 60000;
const ICON_DISCOVERY_TIMEOUT_MS = 8000;

function urlHost(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.hostname : '';
  } catch {
    return '';
  }
}

async function rememberPendingEngine(tabId, engineId) {
  const entry = { engineId, at: Date.now() };
  pendingEngineHost.set(tabId, entry);
  if (!api.storage.session) return;
  try {
    await api.storage.session.set({ [PENDING_ENGINE_PREFIX + tabId]: entry });
  } catch {
    // Non-fatal: the in-memory entry still works while the worker is alive.
  }
}

async function pendingEngineFor(tabId) {
  let entry = pendingEngineHost.get(tabId);
  if (!entry && api.storage.session) {
    try {
      const key = PENDING_ENGINE_PREFIX + tabId;
      const stored = await api.storage.session.get(key);
      entry = stored[key] || null;
    } catch {
      entry = null;
    }
  }
  if (!entry) return null;
  if (!entry.at || Date.now() - entry.at > PENDING_ENGINE_TTL_MS) {
    await clearPendingEngine(tabId);
    return null;
  }
  return entry;
}

async function clearPendingEngine(tabId) {
  pendingEngineHost.delete(tabId);
  if (!api.storage.session) return;
  try {
    await api.storage.session.remove(PENDING_ENGINE_PREFIX + tabId);
  } catch {
    // Non-fatal.
  }
}

async function openBrowserSearch(engine, query, method, sender) {
  if (typeof api.search?.search !== 'function') throw new Error('Browser engine search is unavailable');
  const resolved = resolveOpenMethod(method, sender);

  let tabId = null;
  if (resolved === 'currentTab') {
    tabId = sender?.tab?.id ?? null;
  } else if (resolved === 'newTab' || resolved === 'backgroundTab') {
    const tab = await api.tabs.create({ active: resolved === 'newTab', openerTabId: sender?.tab?.id });
    tabId = tab?.id ?? null;
  }

  if (tabId == null) {
    await api.search.search({ engine: engine.browserEngineName, query, disposition: dispositionFor(resolved) });
    return;
  }

  await rememberPendingEngine(tabId, engine.id);
  await api.search.search({ engine: engine.browserEngineName, query, tabId });
}

async function discoverEngineHost(engine) {
  if (typeof api.tabs?.create !== 'function') return '';
  let tabId = null;
  try {
    const tab = await api.tabs.create({ url: 'about:blank', active: false });
    tabId = tab?.id ?? null;
  } catch {
    return '';
  }
  if (tabId == null) return '';

  const hostPromise = new Promise((resolve) => pendingResolvers.set(tabId, resolve));
  try {
    await rememberPendingEngine(tabId, engine.id);
    await api.search.search({ engine: engine.browserEngineName, query: ' ', tabId });
    const host = await Promise.race([
      hostPromise,
      new Promise((resolve) => setTimeout(() => resolve(''), ICON_DISCOVERY_TIMEOUT_MS)),
    ]);
    return host || '';
  } catch {
    return '';
  } finally {
    pendingResolvers.delete(tabId);
    await clearPendingEngine(tabId);
    try {
      await api.tabs.remove(tabId);
    } catch {
      // Tab may already be closed.
    }
  }
}

async function discoverMissingHosts(engines) {
  if (typeof api.search?.search !== 'function') return false;
  let changed = false;
  for (const engine of engines) {
    if (!isBrowserLikeEngine(engine) || engine.iconHost) continue;
    if (!engine.browserEngineName || hostFromIconUrl(engine.icon)) continue;
    const host = await discoverEngineHost(engine);
    if (host) {
      engine.iconHost = host;
      changed = true;
    }
  }
  if (changed) await saveEngines(engines);
  return changed;
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

async function readIconCache(key) {
  if (iconMemoryCache.has(key)) return iconMemoryCache.get(key);
  try {
    const storageKey = ICON_CACHE_PREFIX + key;
    const stored = await api.storage.local.get(storageKey);
    if (stored[storageKey] !== undefined) {
      iconMemoryCache.set(key, stored[storageKey]);
      return stored[storageKey];
    }
  } catch {
    // Storage read failed; fall back to memory-only caching.
  }
  return undefined;
}

async function writeIconCache(key, dataUrl) {
  iconMemoryCache.set(key, dataUrl);
  try {
    await api.storage.local.set({ [ICON_CACHE_PREFIX + key]: dataUrl });
  } catch {
    // Non-fatal: the in-memory cache still holds the value for this worker lifetime.
  }
}

async function pruneIconCache(referencedKeys) {
  try {
    const all = await api.storage.local.get(null);
    const stale = Object.keys(all).filter(
      (key) => key.startsWith(ICON_CACHE_PREFIX) && !referencedKeys.has(key.slice(ICON_CACHE_PREFIX.length)),
    );
    if (stale.length) await api.storage.local.remove(stale);
  } catch {
    // Non-fatal: stale entries linger until the next prune.
  }
}

async function clearIconCache() {
  iconMemoryCache.clear();
  try {
    const all = await api.storage.local.get(null);
    const keys = Object.keys(all).filter((key) => key.startsWith(ICON_CACHE_PREFIX));
    if (keys.length) await api.storage.local.remove(keys);
  } catch {
    // Non-fatal: a failed clear just means the next fetch reuses a cached value.
  }
}

async function fetchImage(url) {
  if (!url) return { dataUrl: null, definitive: false };
  if (url.startsWith('data:')) return { dataUrl: url, definitive: true };
  if (!HTTP_URL_PATTERN.test(url)) return { dataUrl: null, definitive: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const declaredLength = Number(response.headers.get('content-length') || 0);
    const withinLimit = !declaredLength || declaredLength <= MAX_ICON_BYTES;
    if (response.ok && contentType.startsWith('image/') && withinLimit) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength <= MAX_ICON_BYTES) {
        return { dataUrl: arrayBufferToDataUrl(buffer, contentType), definitive: true };
      }
      return { dataUrl: null, definitive: true };
    }
    return { dataUrl: null, definitive: response.status >= 400 && response.status < 500 };
  } catch {
    return { dataUrl: null, definitive: false };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarkup(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) {
      return { markup: null, baseUrl: url, definitive: response.status >= 400 && response.status < 500 };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { markup: text.slice(0, MAX_MARKUP_BYTES), baseUrl: response.url || url, definitive: true };
    }
    const decoder = new TextDecoder();
    let received = 0;
    let markup = '';
    while (received < MAX_MARKUP_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      markup += decoder.decode(value, { stream: true });
      if (markup.includes('</head>')) break;
    }
    reader.cancel().catch(() => {});
    return { markup, baseUrl: response.url || url, definitive: true };
  } catch {
    return { markup: null, baseUrl: url, definitive: false };
  } finally {
    clearTimeout(timer);
  }
}

function parseAttributes(tag) {
  const attributes = {};
  ATTRIBUTE_PATTERN.lastIndex = 0;
  let match = ATTRIBUTE_PATTERN.exec(tag);
  while (match) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
    match = ATTRIBUTE_PATTERN.exec(tag);
  }
  return attributes;
}

function iconSize(attributes) {
  if ((attributes.sizes || '').trim().toLowerCase() === 'any') return Number.POSITIVE_INFINITY;
  let best = 0;
  for (const token of (attributes.sizes || '').split(/\s+/)) {
    const value = Number.parseInt(token.toLowerCase().split('x')[0], 10);
    if (Number.isFinite(value) && value > best) best = value;
  }
  if (!best && (attributes.rel || '').toLowerCase().includes('apple-touch-icon')) best = 180;
  return best;
}

function isVectorIcon(attributes, href) {
  return (attributes.type || '').toLowerCase() === 'image/svg+xml' || /\.svg($|[?#])/i.test(href);
}

function iconCandidates(markup, baseUrl) {
  const candidates = [];
  const seen = new Set();
  LINK_TAG_PATTERN.lastIndex = 0;
  let match = LINK_TAG_PATTERN.exec(markup);
  while (match) {
    const attributes = parseAttributes(match[0]);
    const relations = (attributes.rel || '').toLowerCase().split(/\s+/);
    if (attributes.href && relations.some((relation) => ICON_RELATIONS.has(relation))) {
      try {
        const url = new URL(attributes.href, baseUrl).href;
        if (!seen.has(url)) {
          seen.add(url);
          candidates.push({
            url,
            vector: isVectorIcon(attributes, attributes.href),
            size: iconSize(attributes),
          });
        }
      } catch {
        // Ignore icons with unresolvable hrefs.
      }
    }
    match = LINK_TAG_PATTERN.exec(markup);
  }
  return candidates;
}

function findManifestUrl(markup, baseUrl) {
  LINK_TAG_PATTERN.lastIndex = 0;
  let match = LINK_TAG_PATTERN.exec(markup);
  while (match) {
    const attributes = parseAttributes(match[0]);
    const relations = (attributes.rel || '').toLowerCase().split(/\s+/);
    if (attributes.href && relations.includes('manifest')) {
      try {
        return new URL(attributes.href, baseUrl).href;
      } catch {
        return '';
      }
    }
    match = LINK_TAG_PATTERN.exec(markup);
  }
  return '';
}

async function fetchManifestIcons(manifestUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(manifestUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const data = await response.json();
    const icons = Array.isArray(data?.icons) ? data.icons : [];
    const candidates = [];
    for (const icon of icons) {
      if (typeof icon?.src !== 'string' || !icon.src) continue;
      const purpose = String(icon.purpose || '').toLowerCase();
      if (purpose.includes('monochrome') || purpose.includes('maskable')) continue;
      try {
        candidates.push({
          url: new URL(icon.src, manifestUrl).href,
          vector: isVectorIcon(icon, icon.src),
          size: iconSize(icon),
        });
      } catch {
        // Ignore icons with unresolvable src.
      }
    }
    return candidates;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

function rankCandidates(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  unique.sort((a, b) => (a.vector === b.vector ? b.size - a.size : a.vector ? -1 : 1));
  return unique;
}

async function fetchBestIcon(homeUrl) {
  const { markup, baseUrl, definitive: markupDefinitive } = await fetchMarkup(homeUrl);
  const candidates = markup ? iconCandidates(markup, baseUrl) : [];

  if (markup && !candidates.some((candidate) => candidate.vector)) {
    const manifestUrl = findManifestUrl(markup, baseUrl) || new URL('/manifest.json', homeUrl).href;
    candidates.push(...(await fetchManifestIcons(manifestUrl)));
  }

  for (const icon of WELL_KNOWN_ICONS) {
    try {
      candidates.push({ url: new URL(icon.path, homeUrl).href, vector: icon.vector, size: icon.size });
    } catch {
      // Ignore malformed home URLs.
    }
  }

  let definitive = markupDefinitive;
  for (const candidate of rankCandidates(candidates)) {
    const result = await fetchImage(candidate.url);
    if (result.dataUrl) return result;
    if (!result.definitive) definitive = false;
  }
  return { dataUrl: null, definitive: definitive && candidates.length > 0 };
}

function templateHost(template) {
  try {
    return new URL(String(template).replace(/\{searchTerms\}/g, 'x')).host;
  } catch {
    return '';
  }
}

function hostFromIconUrl(icon) {
  if (typeof icon !== 'string' || !HTTP_URL_PATTERN.test(icon)) return '';
  try {
    return new URL(icon).host;
  } catch {
    return '';
  }
}

function isBrowserLikeEngine(engine) {
  return (
    engine.source === 'browser' || (typeof engine.icon === 'string' && engine.icon.startsWith('data:'))
  );
}

function faviconSourceForHost(host, provider) {
  if (provider === 'duckduckgo') return { key: `https://icons.duckduckgo.com/ip3/${host}.ico`, kind: 'image' };
  return { key: `https://${host}/`, kind: 'markup' };
}

function engineIconSource(engine, settings) {
  const provider = settings?.faviconProvider || DEFAULT_SETTINGS.faviconProvider;
  if (isBrowserLikeEngine(engine)) {
    if (provider === 'none') return null;
    const host = engine.iconHost || hostFromIconUrl(engine.icon);
    if (!host) return null;
    return faviconSourceForHost(host, provider);
  }
  if (engine.icon) return { key: engine.icon, kind: 'image' };
  if (provider === 'none') return null;
  const host = templateHost(engine.template);
  if (!host) return null;
  return faviconSourceForHost(host, provider);
}

async function resolveEngineIcon(engine, settings) {
  const source = engineIconSource(engine, settings);
  if (!source) return { dataUrl: null, fetched: false };
  if (source.key.startsWith('data:')) return { dataUrl: source.key, fetched: false };

  const cached = await readIconCache(source.key);
  if (cached !== undefined) return { dataUrl: cached, fetched: false };

  const result = source.kind === 'markup' ? await fetchBestIcon(source.key) : await fetchImage(source.key);
  if (result.dataUrl || result.definitive) await writeIconCache(source.key, result.dataUrl);
  else iconMemoryCache.set(source.key, null);
  return { dataUrl: result.dataUrl, fetched: true };
}

async function loadIconMap(engines, settings) {
  const icons = {};
  const referenced = new Set();
  for (const engine of engines) {
    const source = engineIconSource(engine, settings);
    if (source) referenced.add(source.key);
  }
  const outcomes = await Promise.all(
    engines.map(async (engine) => {
      const { dataUrl, fetched } = await resolveEngineIcon(engine, settings);
      if (dataUrl) icons[engine.id] = dataUrl;
      return fetched;
    }),
  );
  if (outcomes.some(Boolean)) await pruneIconCache(referenced);
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
    case 'refreshIcons': {
      const [engines, settings] = await Promise.all([loadEngines(), loadSettings()]);
      await clearIconCache();
      return loadIconMap(engines, settings);
    }
    case 'discoverHosts': {
      const engines = await loadEngines();
      await discoverMissingHosts(engines);
      return engines;
    }
    case 'hasClipboard':
      return hasClipboardPermission();
    case 'pageHost': {
      const tabId = sender?.tab?.id;
      if (tabId == null) return { ok: true };
      const host = urlHost(sender?.url);
      if (!host) return { ok: true };
      const pending = await pendingEngineFor(tabId);
      if (!pending) return { ok: true };
      await clearPendingEngine(tabId);
      const engines = await loadEngines();
      const engine = engines.find((item) => item.id === pending.engineId);
      if (engine && engine.iconHost !== host) {
        engine.iconHost = host;
        await saveEngines(engines);
      }
      const resolve = pendingResolvers.get(tabId);
      if (resolve) resolve(host);
      return { ok: true };
    }
    case 'search': {
      const engines = await loadEngines();
      const engine = engines.find((item) => item.id === message.engineId);
      if (!engine) throw new Error(`Unknown search engine: ${message.engineId}`);
      await openSearch({ engine, terms: message.terms, method: message.method }, sender);
      return { ok: true };
    }
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
