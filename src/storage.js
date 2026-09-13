// var (not const) throughout this file: top-level bindings are shared, bare-name globals
// across sibling content-script files, and must tolerate re-injection into the same
// document without throwing a SyntaxError on redeclaration.
var api = globalThis.browser ?? globalThis.chrome;

var STORAGE_KEYS = Object.freeze({
  engines: 'engines',
  settings: 'settings',
});

var HOST_ORIGINS = Object.freeze(['http://*/*', 'https://*/*']);

// Host access is revocable: Firefox MV3 host permissions are opt-in, and Chrome
// can withhold required hosts. Both browsers only allow request() from inside a
// user-gesture handler, so callers must invoke this from a click/keypress.
var requestHostAccess = async () => {
  if (!api.permissions?.request) return true;
  try {
    if (api.permissions.contains && (await api.permissions.contains({ origins: HOST_ORIGINS }))) {
      return true;
    }
    return await api.permissions.request({ origins: HOST_ORIGINS });
  } catch {
    return false;
  }
};

var CONTEXTS = Object.freeze(['text', 'word', 'link']);
var ENGINE_SOURCES = Object.freeze(['template', 'browser']);
var ACTIONS_POSITIONS = Object.freeze(['before', 'after']);
var POPUP_SIZES = Object.freeze(['compact', 'standard', 'large', 'luxury']);
var POPUP_POSITIONS = Object.freeze(['below', 'under']);

var THESAURUS_TEMPLATE = 'https://dictionary.cambridge.org/thesaurus/{searchTerms}';

var ACTION_ICONS = Object.freeze({
  copyRich:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
  copyPlain:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><line x1="12" x2="18" y1="18" y2="12"/><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>',
  openLink:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>',
  define:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M11 22H5.5a1 1 0 0 1 0-5h4.501"/><path d="m21 22-1.879-1.878"/><path d="M3 19.5v-15A2.5 2.5 0 0 1 5.5 2H18a1 1 0 0 1 1 1v8"/><circle cx="17" cy="18" r="3"/></svg>',
  thesaurus:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m16 6 4 14"/><path d="M12 6v14"/><path d="M8 8v12"/><path d="M4 4v16"/></svg>',
  translate:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="m5 8 6 6"/><path d="m4 14 6-6 2-3"/><path d="M2 5h12"/><path d="M7 2h1"/><path d="m22 22-5-10-5 10"/><path d="M14 18h6"/></svg>',
  copyLink:
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
});

/** @type {ReadonlyArray<BuiltinAction>} */
var BUILTIN_ACTION_DEFS = Object.freeze([
  { id: 'copyPlain', contexts: ['text', 'word', 'link'], icon: ACTION_ICONS.copyPlain },
  { id: 'copyLink', contexts: ['link'], icon: ACTION_ICONS.copyLink },
  { id: 'copyRich', contexts: ['text', 'word', 'link'], icon: ACTION_ICONS.copyRich },
  {
    id: 'define',
    contexts: ['word'],
    template: 'https://en.wiktionary.org/wiki/{searchTerms}',
    icon: ACTION_ICONS.define,
  },
  { id: 'openLink', contexts: ['link'], icon: ACTION_ICONS.openLink },
  {
    id: 'thesaurus',
    contexts: ['word'],
    template: THESAURUS_TEMPLATE,
    icon: ACTION_ICONS.thesaurus,
  },
  {
    id: 'translate',
    contexts: ['text', 'word'],
    template: 'https://translate.google.com/?sl=auto&tl=en&text={searchTerms}&op=translate',
    icon: ACTION_ICONS.translate,
  },
]);

var DEFAULT_SETTINGS = Object.freeze({
  trigger: 'mouseup',
  openMethod: 'newTab',
  columns: 6,
  theme: 'auto',
  showLabels: false,
  actionsPosition: 'before',
  popupSize: 'standard',
  popupPosition: 'below',
  popupAnimation: false,
  popupOpacity: 100,
  accentBorder: false,
});

/**
 * @returns {Settings}
 */
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

/**
 * @param {any} engine
 * @returns {Engine}
 */
function normalizeEngine(engine) {
  const source = ENGINE_SOURCES.includes(engine?.source) ? engine.source : 'template';
  return {
    id: engine?.id || generateId(),
    name: String(engine?.name ?? ''),
    source,
    enabled: engine?.enabled !== false,
    template: String(engine?.template ?? ''),
    browserEngineName: String(engine?.browserEngineName ?? ''),
    icon: typeof engine?.icon === 'string' ? engine.icon : '',
  };
}

/**
 * @param {any} stored
 * @param {Record<string, BuiltinActionValue>} base
 * @returns {Record<string, BuiltinActionValue>}
 */
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
      /** @type {BuiltinActionValue} */
      const entry = {
        enabled: value.enabled !== false,
      };
      if (def.template) {
        const storedTemplate = value.template;
        entry.template =
          typeof storedTemplate === 'string' ? storedTemplate : String(fallback.template ?? def.template);
      }
      return [def.id, entry];
    }),
  );
}

/**
 * @param {any} order
 * @returns {string[]}
 */
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

/**
 * @param {any} stored
 * @returns {Settings}
 */
function normalizeSettings(stored) {
  const base = defaultSettings();
  const input = stored && typeof stored === 'object' ? stored : {};
  const settings = { ...base, ...input };
  settings.popupSize = POPUP_SIZES.includes(input.popupSize) ? input.popupSize : DEFAULT_SETTINGS.popupSize;
  settings.builtinActions = normalizeBuiltinActions(settings.builtinActions, base.builtinActions);
  settings.actionOrder = normalizeActionOrder(settings.actionOrder);
  if (!ACTIONS_POSITIONS.includes(settings.actionsPosition)) {
    settings.actionsPosition = DEFAULT_SETTINGS.actionsPosition;
  }
  if (!POPUP_POSITIONS.includes(settings.popupPosition)) {
    settings.popupPosition = DEFAULT_SETTINGS.popupPosition;
  }
  settings.popupAnimation = settings.popupAnimation === true;
  const opacity = Number(input.popupOpacity);
  settings.popupOpacity = Number.isFinite(opacity)
    ? Math.min(100, Math.max(0, Math.round(opacity)))
    : DEFAULT_SETTINGS.popupOpacity;
  return settings;
}

/**
 * @param {Settings} settings
 * @returns {ActionItem[]}
 */
function builtinActionList(settings) {
  const normalized = normalizeSettings(settings || {});
  const byId = new Map(BUILTIN_ACTION_DEFS.map((def) => [def.id, def]));
  return normalized.actionOrder
    .map((id) => byId.get(id))
    .filter((def) => def !== undefined)
    .map((def) => {
      const value = normalized.builtinActions[def.id];
      return {
        id: def.id,
        template: value.template ?? def.template ?? '',
        enabled: value.enabled,
        contexts: [...def.contexts],
        icon: def.icon || '',
      };
    });
}

/**
 * @param {any} item
 * @param {string} context
 * @returns {boolean}
 */
function matchesContext(item, context) {
  const contexts = Array.isArray(item?.contexts) ? item.contexts : CONTEXTS;
  return contexts.includes(context);
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string} value
 * @returns {string}
 */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * @param {string} template
 * @param {string} terms
 * @returns {string}
 */
function buildSearchUrl(template, terms) {
  return String(template).replace(/\{searchTerms\}/g, encodeURIComponent(terms));
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @returns {Engine[]}
 */
function defaultEngineList() {
  return DEFAULT_ENGINES.map((engine) => normalizeEngine(engine));
}

/**
 * @returns {boolean}
 */
function supportsBrowserEngineSearch() {
  return typeof api.search?.search === 'function';
}

/**
 * @returns {Promise<Engine[]>}
 */
async function loadEngines() {
  const result = await api.storage.local.get(STORAGE_KEYS.engines);
  const stored = result[STORAGE_KEYS.engines];
  if (stored === undefined) {
    const engines = defaultEngineList();
    await saveEngines(engines);
    return engines;
  }
  if (!Array.isArray(stored)) return [];
  return stored.map(normalizeEngine).filter((engine) => engine.source !== 'browser' || supportsBrowserEngineSearch());
}

/**
 * @param {Engine[]} engines
 */
async function saveEngines(engines) {
  await api.storage.local.set({ [STORAGE_KEYS.engines]: engines });
}

/**
 * @returns {Promise<Settings>}
 */
async function loadSettings() {
  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  return normalizeSettings(result[STORAGE_KEYS.settings]);
}

/**
 * @param {Settings} settings
 */
async function saveSettings(settings) {
  await api.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}
