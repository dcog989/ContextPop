// Storage layer: the WebExtension API handle, the URL-scheme pattern, storage keys,
// settings/engine normalization, and the load/save helpers. The action catalog lives in
// actions.js and the string/URL helpers in util.js, which must load before the functions
// here run. var (not const) throughout: top-level bindings are shared, bare-name globals
// across sibling content-script files, and must tolerate re-injection into the same
// document without throwing a SyntaxError on redeclaration.
var api = globalThis.browser;

var HTTP_URL_PATTERN = /^https?:\/\//i;

var STORAGE_KEYS = Object.freeze({
  engines: 'engines',
  settings: 'settings',
  onboarding: 'onboarding',
});

// Storage-key prefix for cached engine favicons. The cache module (iconCache.js) owns the
// values; the prefix lives here so both the background and content scripts can recognize
// icon:* changes.
var ICON_CACHE_PREFIX = 'icon:';

// Each enum is a frozen named lookup; the mutating `defineEnum` result is coerced to the
// readonly shape the domain typedefs expect, so the annotation (not the call) bounds the
// property type.
/** @type {Readonly<{ template: string, browser: string }>} */
var ENGINE_SOURCE = defineEnum({ template: 'template', browser: 'browser' });
/** @type {Readonly<{ before: string, after: string }>} */
var ACTIONS_POSITION = defineEnum({ before: 'before', after: 'after' });
/** @type {Readonly<{ compact: string, standard: string, large: string, luxury: string }>} */
var POPUP_SIZE = defineEnum({ compact: 'compact', standard: 'standard', large: 'large', luxury: 'luxury' });
/** @type {Readonly<{ below: string, under: string }>} */
var POPUP_POSITION = defineEnum({ below: 'below', under: 'under' });
/** @type {Readonly<{ mouseup: string, alt: string, ctrl: string, shift: string }>} */
var TRIGGER = defineEnum({ mouseup: 'mouseup', alt: 'alt', ctrl: 'ctrl', shift: 'shift' });
/** @type {Readonly<{ newTab: string, backgroundTab: string, currentTab: string, newWindow: string }>} */
var OPEN_METHOD = defineEnum({
  newTab: 'newTab',
  backgroundTab: 'backgroundTab',
  currentTab: 'currentTab',
  newWindow: 'newWindow',
});
/** @type {Readonly<{ auto: string, light: string, dark: string }>} */
var THEME = defineEnum({ auto: 'auto', light: 'light', dark: 'dark' });

/** @type {ReadonlyArray<string>} */
var ENGINE_SOURCES = Object.freeze(Object.values(ENGINE_SOURCE));
/** @type {ReadonlyArray<string>} */
var ACTIONS_POSITIONS = Object.freeze(Object.values(ACTIONS_POSITION));
/** @type {ReadonlyArray<string>} */
var POPUP_SIZES = Object.freeze(Object.values(POPUP_SIZE));
/** @type {ReadonlyArray<string>} */
var POPUP_POSITIONS = Object.freeze(Object.values(POPUP_POSITION));
/** @type {ReadonlyArray<string>} */
var TRIGGERS = Object.freeze(Object.values(TRIGGER));
/** @type {ReadonlyArray<string>} */
var OPEN_METHODS = Object.freeze(Object.values(OPEN_METHOD));
/** @type {ReadonlyArray<string>} */
var THEMES = Object.freeze(Object.values(THEME));

// Browser search dispositions per open method; openBrowserSearch special-cases backgroundTab.
/** @type {Record<string, string>} */
var OPEN_METHOD_DISPOSITIONS = Object.freeze({
  [OPEN_METHOD.newTab]: 'NEW_TAB',
  [OPEN_METHOD.currentTab]: 'CURRENT_TAB',
  [OPEN_METHOD.newWindow]: 'NEW_WINDOW',
});

var MIN_COLUMNS = 1;
var MAX_COLUMNS = 12;

var DEFAULT_SETTINGS = Object.freeze({
  trigger: TRIGGER.mouseup,
  openMethod: OPEN_METHOD.newTab,
  columns: 6,
  theme: THEME.auto,
  showLabels: false,
  actionsPosition: ACTIONS_POSITION.before,
  popupSize: POPUP_SIZE.standard,
  popupPosition: POPUP_POSITION.below,
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

/**
 * @param {any} engine
 * @returns {Engine}
 */
function normalizeEngine(engine) {
  const source = pickEnum(engine?.source, ENGINE_SOURCES, ENGINE_SOURCE.template);
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
 * @returns {Settings}
 */
function normalizeSettings(stored) {
  const base = defaultSettings();
  const input = stored && typeof stored === 'object' ? stored : {};
  const settings = { ...base, ...input };
  const columns = Number(input.columns);
  settings.columns = Number.isFinite(columns)
    ? Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, Math.round(columns)))
    : DEFAULT_SETTINGS.columns;
  settings.popupSize = pickEnum(input.popupSize, POPUP_SIZES, DEFAULT_SETTINGS.popupSize);
  settings.trigger = pickEnum(input.trigger, TRIGGERS, DEFAULT_SETTINGS.trigger);
  settings.openMethod = pickEnum(input.openMethod, OPEN_METHODS, DEFAULT_SETTINGS.openMethod);
  settings.theme = pickEnum(input.theme, THEMES, DEFAULT_SETTINGS.theme);
  settings.builtinActions = normalizeBuiltinActions(settings.builtinActions, base.builtinActions);
  settings.actionOrder = normalizeActionOrder(settings.actionOrder);
  settings.actionsPosition = pickEnum(settings.actionsPosition, ACTIONS_POSITIONS, DEFAULT_SETTINGS.actionsPosition);
  settings.popupPosition = pickEnum(settings.popupPosition, POPUP_POSITIONS, DEFAULT_SETTINGS.popupPosition);
  settings.popupAnimation = settings.popupAnimation === true;
  const opacity = Number(input.popupOpacity);
  settings.popupOpacity = Number.isFinite(opacity)
    ? Math.min(100, Math.max(0, Math.round(opacity)))
    : DEFAULT_SETTINGS.popupOpacity;
  return settings;
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
 * Drops engines this context cannot search. Kept out of loadEngines() so a
 * capability-filtered list never flows back into saveEngines().
 * @param {Engine[]} engines
 * @returns {Engine[]}
 */
function filterUsableEngines(engines) {
  return engines.filter((engine) => engine.source !== ENGINE_SOURCE.browser || supportsBrowserEngineSearch());
}

/**
 * @returns {Promise<Engine[]>}
 */
async function loadEngines() {
  const result = await api.storage.local.get(STORAGE_KEYS.engines);
  const stored = result[STORAGE_KEYS.engines];
  if (!Array.isArray(stored)) return defaultEngineList();
  return stored.map(normalizeEngine);
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

/**
 * @returns {Promise<boolean>}
 */
async function loadOnboardingComplete() {
  const result = await api.storage.local.get(STORAGE_KEYS.onboarding);
  return result[STORAGE_KEYS.onboarding] === true;
}

/**
 * @returns {Promise<void>}
 */
async function saveOnboardingComplete() {
  await api.storage.local.set({ [STORAGE_KEYS.onboarding]: true });
}
