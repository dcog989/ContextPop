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
    template: 'https://www.merriam-webster.com/dictionary/{searchTerms}',
  },
  {
    id: 'thesaurus',
    location: 'background',
    resultView: 'popup',
    contexts: ['word'],
    template: 'https://www.merriam-webster.com/thesaurus/{searchTerms}',
  },
]);

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
      if (def.template) entry.template = String(value.template ?? fallback.template ?? def.template);
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
