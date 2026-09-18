// Storage layer: the WebExtension API handle, the URL-scheme pattern, storage keys,
// settings/engine normalization, and the load/save helpers. The action catalog lives in
// actions.js and the string/URL helpers in util.js, which must load before the functions
// here run. var (not const) throughout: top-level bindings are shared, bare-name globals
// across sibling content-script files, and must tolerate re-injection into the same
// document without throwing a SyntaxError on redeclaration.
var api = globalThis.browser ?? globalThis.chrome;

var HTTP_URL_PATTERN = /^https?:\/\//i;

var STORAGE_KEYS = Object.freeze({
  engines: 'engines',
  settings: 'settings',
  onboarding: 'onboarding',
});

var HOST_ORIGINS = Object.freeze(['http://*/*', 'https://*/*']);

// Host access is revocable: Firefox MV3 host permissions are opt-in, and Chrome
// can withhold required hosts. Both browsers only allow request() from inside a
// user-gesture handler, so callers must invoke this from a click/keypress.
var requestHostAccess = async () => {
  if (!api.permissions?.request) return true;
  // Call request() before any await: an async boundary consumes the user
  // gesture, and Firefox rejects a request made without one.
  try {
    if (await api.permissions.request({ origins: HOST_ORIGINS })) return true;
  } catch {
    // Request unavailable or gesture lost; fall through to a status check.
  }
  try {
    return Boolean(await api.permissions.contains?.({ origins: HOST_ORIGINS }));
  } catch {
    return false;
  }
};

var ENGINE_SOURCES = Object.freeze(['template', 'browser']);
var ACTIONS_POSITIONS = Object.freeze(['before', 'after']);
var POPUP_SIZES = Object.freeze(['compact', 'standard', 'large', 'luxury']);
var POPUP_POSITIONS = Object.freeze(['below', 'under']);
var MIN_COLUMNS = 1;
var MAX_COLUMNS = 12;

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
  return engines.filter((engine) => engine.source !== 'browser' || supportsBrowserEngineSearch());
}

/**
 * @returns {Promise<Engine[]>}
 */
async function loadEngines() {
  const result = await api.storage.local.get(STORAGE_KEYS.engines);
  const stored = result[STORAGE_KEYS.engines];
  if (!Array.isArray(stored)) {
    const engines = defaultEngineList();
    await saveEngines(engines);
    return engines;
  }
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
