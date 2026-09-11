// Shared favicon logic: engine host resolution, retrieval + caching, and rendering.

const HTTP_URL_PATTERN = /^https?:\/\//i;
const ICON_CACHE_PREFIX = 'icon:';
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

const KNOWN_ENGINE_HOSTS = Object.freeze({
  google: 'www.google.com',
  duckduckgo: 'duckduckgo.com',
  bing: 'www.bing.com',
  wikipedia: 'en.wikipedia.org',
  wiktionary: 'en.wiktionary.org',
  amazon: 'www.amazon.com',
  ebay: 'www.ebay.com',
  ecosia: 'www.ecosia.org',
  qwant: 'www.qwant.com',
  startpage: 'www.startpage.com',
  brave: 'search.brave.com',
  'brave search': 'search.brave.com',
  yahoo: 'search.yahoo.com',
  yandex: 'yandex.com',
  baidu: 'www.baidu.com',
  mojeek: 'www.mojeek.com',
  searx: 'searx.be',
  youtube: 'www.youtube.com',
  'cambridge dictionary': 'dictionary.cambridge.org',
  cambridge: 'dictionary.cambridge.org',
  thesaurus: 'www.thesaurus.com',
  dictionary: 'www.dictionary.com',
  'merriam-webster': 'www.merriam-webster.com',
  'merriam webster': 'www.merriam-webster.com',
  imdb: 'www.imdb.com',
  github: 'github.com',
  reddit: 'www.reddit.com',
  stackoverflow: 'stackoverflow.com',
  'stack overflow': 'stackoverflow.com',
});

const DOMAIN_ENGINE_NAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

const SVG_COLOR_PATTERN = /\b(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*([^"';\s>)]+)/gi;
const MONOCHROME_SVG_COLORS = new Set([
  'none',
  'transparent',
  'currentcolor',
  'inherit',
  'context-fill',
  'context-stroke',
  'black',
  'white',
  'gray',
  'grey',
]);

const iconMemoryCache = new Map();

function normalizeEngineName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function browserEngineHost(name) {
  const raw = String(name ?? '').trim();
  const wikipedia = raw.match(/^wikipedia\s*\(([a-z-]+)\)/i);
  if (wikipedia) return `${wikipedia[1].toLowerCase()}.wikipedia.org`;
  const normalized = normalizeEngineName(raw);
  if (DOMAIN_ENGINE_NAME_PATTERN.test(normalized)) return normalized;
  return KNOWN_ENGINE_HOSTS[normalized] || '';
}

function svgColorIsMonochrome(value) {
  const color = String(value).trim().toLowerCase();
  if (MONOCHROME_SVG_COLORS.has(color)) return true;
  let red;
  let green;
  let blue;
  const shortHex = color.match(/^#([0-9a-f]{3})$/);
  const longHex = color.match(/^#([0-9a-f]{6})$/);
  const rgb = color.match(/^rgba?\(([^)]+)\)$/);
  if (shortHex) {
    red = Number.parseInt(shortHex[1][0] + shortHex[1][0], 16);
    green = Number.parseInt(shortHex[1][1] + shortHex[1][1], 16);
    blue = Number.parseInt(shortHex[1][2] + shortHex[1][2], 16);
  } else if (longHex) {
    red = Number.parseInt(longHex[1].slice(0, 2), 16);
    green = Number.parseInt(longHex[1].slice(2, 4), 16);
    blue = Number.parseInt(longHex[1].slice(4, 6), 16);
  } else if (rgb) {
    [red, green, blue] = rgb[1].split(',').map((part) => Number.parseFloat(part));
  } else {
    return false;
  }
  if (![red, green, blue].every(Number.isFinite)) return false;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 510;
  const saturation = max === min ? 0 : (max - min) / (lightness < 0.5 ? max + min : 510 - max - min);
  return saturation < 0.25 && (lightness < 0.3 || lightness > 0.7);
}

function isMonochromeSvgText(text) {
  SVG_COLOR_PATTERN.lastIndex = 0;
  let match = SVG_COLOR_PATTERN.exec(text);
  while (match) {
    if (!svgColorIsMonochrome(match[1])) return false;
    match = SVG_COLOR_PATTERN.exec(text);
  }
  return true;
}

function svgDataUrlIsMonochrome(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/svg+xml')) return false;
  try {
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(0, comma);
    const payload = dataUrl.slice(comma + 1);
    const text = /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
    return isMonochromeSvgText(text);
  } catch {
    return false;
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

function engineIconSource(engine) {
  const hasIcon = typeof engine.icon === 'string' && engine.icon.length > 0;
  if (engine.source === 'browser') {
    if (hasIcon && HTTP_URL_PATTERN.test(engine.icon)) return { key: engine.icon, kind: 'image' };
    const host = browserEngineHost(engine.name);
    if (host) return { key: `https://${host}/`, kind: 'markup' };
    if (hasIcon) return { key: engine.icon, kind: 'image' };
    return null;
  }
  if (hasIcon) return { key: engine.icon, kind: 'image' };
  const host = templateHost(engine.template);
  if (!host) return null;
  return { key: `https://${host}/`, kind: 'markup' };
}

async function resolveEngineIcon(engine) {
  const source = engineIconSource(engine);
  if (!source) return { dataUrl: null, fetched: false };
  if (source.key.startsWith('data:')) return { dataUrl: source.key, fetched: false };

  const cached = await readIconCache(source.key);
  if (cached !== undefined) return { dataUrl: cached, fetched: false };

  const result = source.kind === 'markup' ? await fetchBestIcon(source.key) : await fetchImage(source.key);
  if (result.dataUrl || result.definitive) await writeIconCache(source.key, result.dataUrl);
  else iconMemoryCache.set(source.key, null);
  return { dataUrl: result.dataUrl, fetched: true };
}

async function loadIconMap(engines) {
  const icons = {};
  const referenced = new Set();
  for (const engine of engines) {
    const source = engineIconSource(engine);
    if (source) referenced.add(source.key);
  }
  const outcomes = await Promise.all(
    engines.map(async (engine) => {
      const { dataUrl, fetched } = await resolveEngineIcon(engine);
      if (dataUrl) icons[engine.id] = dataUrl;
      return fetched;
    }),
  );
  if (outcomes.some(Boolean)) await pruneIconCache(referenced);
  return icons;
}

function createFaviconIcon({ prefix, label }) {
  const wrapper = document.createElement('span');
  const mask = document.createElement('span');
  mask.className = `${prefix}-mask`;
  mask.hidden = true;
  const fallback = document.createElement('span');
  fallback.className = `${prefix}-letter`;
  fallback.textContent = label;
  const img = document.createElement('img');
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.hidden = true;
  img.addEventListener('error', () => {
    img.hidden = true;
    fallback.hidden = false;
  });

  const setSource = (source) => {
    if (!source || !wrapper.isConnected) return;
    if (svgDataUrlIsMonochrome(source)) {
      mask.style.webkitMaskImage = `url("${source}")`;
      mask.style.maskImage = `url("${source}")`;
      mask.hidden = false;
      img.hidden = true;
    } else {
      img.src = source;
      img.hidden = false;
      mask.hidden = true;
    }
    fallback.hidden = true;
  };

  wrapper.append(img, mask, fallback);
  return { element: wrapper, setSource };
}
