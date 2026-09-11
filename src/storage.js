const api = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEYS = Object.freeze({
  engines: 'engines',
  settings: 'settings',
});

const CONTEXTS = Object.freeze(['text', 'word', 'link', 'image', 'page']);
const ENGINE_SOURCES = Object.freeze(['template', 'browser']);
const FAVICON_PROVIDERS = Object.freeze(['site', 'duckduckgo', 'none']);
const ACTIONS_POSITIONS = Object.freeze(['before', 'after']);
const ICON_SIZES = Object.freeze(['small', 'medium', 'large']);

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

const BUILTIN_ACTION_DEFS = Object.freeze([
  { id: 'copyRich', location: 'content', contexts: ['text', 'word'] },
  { id: 'copyPlain', location: 'content', contexts: ['text', 'word'] },
  { id: 'openLink', location: 'background', contexts: ['link'] },
  { id: 'openLinkBackground', location: 'background', contexts: ['link'] },
  {
    id: 'define',
    location: 'background',
    resultView: 'popup',
    contexts: ['word'],
    template: 'https://en.wiktionary.org/wiki/{searchTerms}',
  },
  {
    id: 'thesaurus',
    location: 'background',
    resultView: 'popup',
    contexts: ['word'],
    template: 'https://www.powerthesaurus.org/{searchTerms}/synonyms',
  },
]);

const LEGACY_ACTION_TEMPLATES = Object.freeze({
  'https://www.merriam-webster.com/dictionary/{searchTerms}': 'https://en.wiktionary.org/wiki/{searchTerms}',
  'https://www.merriam-webster.com/thesaurus/{searchTerms}': 'https://www.powerthesaurus.org/{searchTerms}/synonyms',
  'https://en.wiktionary.org/wiki/Thesaurus:{searchTerms}': 'https://www.powerthesaurus.org/{searchTerms}/synonyms',
});

const DEFAULT_SETTINGS = Object.freeze({
  trigger: 'mouseup',
  openMethod: 'newTab',
  columns: 6,
  theme: 'auto',
  showLabels: false,
  faviconProvider: 'site',
  actionsPosition: 'before',
  iconSize: 'medium',
});

function defaultSettings() {
  return {
    ...DEFAULT_SETTINGS,
    builtinActions: Object.fromEntries(
      BUILTIN_ACTION_DEFS.map((def) => [
        def.id,
        {
          enabled: true,
          ...(def.template ? { template: def.template } : {}),
        },
      ]),
    ),
    actionOrder: BUILTIN_ACTION_DEFS.map((def) => def.id),
  };
}

function generateId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeContexts(contexts, fallback) {
  if (Array.isArray(contexts)) return contexts.filter((context) => CONTEXTS.includes(context));
  return [...(Array.isArray(fallback) ? fallback : CONTEXTS)];
}

function normalizeEngine(engine) {
  const source = ENGINE_SOURCES.includes(engine?.source) ? engine.source : 'template';
  return {
    id: engine?.id || generateId(),
    name: String(engine?.name ?? ''),
    source,
    template: String(engine?.template ?? ''),
    browserEngineName: String(engine?.browserEngineName ?? ''),
    icon: typeof engine?.icon === 'string' ? engine.icon : '',
    iconHost: typeof engine?.iconHost === 'string' ? engine.iconHost : '',
    contexts: normalizeContexts(engine?.contexts, CONTEXTS),
  };
}

function normalizeBuiltinActions(stored, base) {
  const source = Array.isArray(stored)
    ? Object.fromEntries(stored.map((item) => [item?.id, item]))
    : stored && typeof stored === 'object'
      ? stored
      : {};

  return Object.fromEntries(
    BUILTIN_ACTION_DEFS.map((def) => {
      const fallback = base[def.id];
      const value = source[def.id] || {};
      const entry = {
        enabled: value.enabled !== false,
      };
      if (def.template) {
        const stored = value.template;
        const template = typeof stored === 'string' ? stored : String(fallback.template ?? def.template);
        entry.template = LEGACY_ACTION_TEMPLATES[template] ?? template;
      }
      return [def.id, entry];
    }),
  );
}

function normalizeActionOrder(order) {
  const ids = BUILTIN_ACTION_DEFS.map((def) => def.id);
  const seen = new Set();
  const result = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (ids.includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

function normalizeSettings(stored) {
  const base = defaultSettings();
  const settings = { ...base, ...(stored && typeof stored === 'object' ? stored : {}) };
  settings.builtinActions = normalizeBuiltinActions(settings.builtinActions, base.builtinActions);
  settings.actionOrder = normalizeActionOrder(settings.actionOrder);
  if (!FAVICON_PROVIDERS.includes(settings.faviconProvider)) {
    settings.faviconProvider = DEFAULT_SETTINGS.faviconProvider;
  }
  if (!ACTIONS_POSITIONS.includes(settings.actionsPosition)) {
    settings.actionsPosition = DEFAULT_SETTINGS.actionsPosition;
  }
  if (!ICON_SIZES.includes(settings.iconSize)) {
    settings.iconSize = DEFAULT_SETTINGS.iconSize;
  }
  return settings;
}

function builtinActionList(settings) {
  const normalized = normalizeSettings(settings || {});
  const byId = new Map(BUILTIN_ACTION_DEFS.map((def) => [def.id, def]));
  return normalized.actionOrder
    .map((id) => byId.get(id))
    .filter(Boolean)
    .map((def) => {
      const value = normalized.builtinActions[def.id];
      return {
        id: def.id,
        kind: 'builtin',
        location: def.location,
        resultView: def.resultView || 'tab',
        template: value.template ?? def.template ?? '',
        enabled: value.enabled,
        contexts: [...def.contexts],
      };
    });
}

function matchesContext(item, context) {
  const contexts = Array.isArray(item?.contexts) ? item.contexts : CONTEXTS;
  return contexts.includes(context);
}

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

function svgColorIsMonochrome(value) {
  const color = String(value).trim().toLowerCase();
  if (MONOCHROME_SVG_COLORS.has(color)) return true;
  let red;
  let green;
  let blue;
  let match = color.match(/^#([0-9a-f]{3})$/);
  if (match) {
    red = Number.parseInt(match[1][0] + match[1][0], 16);
    green = Number.parseInt(match[1][1] + match[1][1], 16);
    blue = Number.parseInt(match[1][2] + match[1][2], 16);
  } else if ((match = color.match(/^#([0-9a-f]{6})$/))) {
    red = Number.parseInt(match[1].slice(0, 2), 16);
    green = Number.parseInt(match[1].slice(2, 4), 16);
    blue = Number.parseInt(match[1].slice(4, 6), 16);
  } else if ((match = color.match(/^rgba?\(([^)]+)\)$/))) {
    [red, green, blue] = match[1].split(',').map((part) => Number.parseFloat(part));
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

function buildSearchUrl(template, terms) {
  return String(template).replace(/\{searchTerms\}/g, encodeURIComponent(terms));
}

function defaultEngineList() {
  return DEFAULT_ENGINES.map((engine) => normalizeEngine(engine));
}

async function loadEngines() {
  const result = await api.storage.local.get(STORAGE_KEYS.engines);
  const engines = result[STORAGE_KEYS.engines];
  return Array.isArray(engines) ? engines.map(normalizeEngine) : [];
}

async function saveEngines(engines) {
  await api.storage.local.set({ [STORAGE_KEYS.engines]: engines });
}

async function loadSettings() {
  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(result[STORAGE_KEYS.settings]);
}

async function saveSettings(settings) {
  await api.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}
