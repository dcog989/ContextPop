// Options-page state and persistence: the single source of truth for engines and settings,
// plus debounced saving and validation. Views mutate `state` and call markDirty() to
// schedule a save.

/** @type {{ engines: Engine[], settings: Settings, dirty: boolean }} */
const state = {
  engines: [],
  settings: defaultSettings(),
  dirty: false,
};

/** @type {ReturnType<typeof setTimeout> | null} */
let saveTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let statusTimer = null;

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * @param {string} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

function clearStatusSoon() {
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (!state.dirty) setStatus('');
  }, 1500);
}

function markDirty() {
  state.dirty = true;
  setStatus(msg('statusSaving'));
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 400);
}

/**
 * @returns {string | null}
 */
function validate() {
  for (const engine of state.engines) {
    if (engine.enabled === false) continue;
    if (!engine.name.trim()) return msg('errorNameRequired');
    if (engine.source === 'browser') continue;
    if (!engine.template.includes('{searchTerms}')) return msg('errorTemplateTerms', engine.name);
    if (!HTTP_URL_PATTERN.test(engine.template)) return msg('errorTemplateScheme', engine.name);
  }
  for (const def of BUILTIN_ACTION_DEFS) {
    if (!def.template) continue;
    const value = state.settings.builtinActions[def.id];
    if (!value?.enabled) continue;
    const template = String(value.template ?? '');
    const name = (msg(`action${capitalize(def.id)}`) || capitalize(def.id)).trim();
    if (!template.includes('{searchTerms}')) return msg('errorTemplateTerms', name);
    if (!HTTP_URL_PATTERN.test(template)) return msg('errorTemplateScheme', name);
  }
  return null;
}

/**
 * @param {Record<string, BuiltinActionValue>} target
 * @param {Record<string, BuiltinActionValue>} source
 * @returns {Record<string, BuiltinActionValue>}
 */
function syncBuiltinActions(target, source) {
  for (const key of Object.keys(target)) {
    if (!(key in source)) delete target[key];
  }
  for (const [id, entry] of Object.entries(source)) {
    const current = target[id];
    if (current) Object.assign(current, entry);
    else target[id] = { ...entry };
  }
  return target;
}

/**
 * @param {string[]} target
 * @param {string[]} source
 * @returns {string[]}
 */
function syncStringList(target, source) {
  target.splice(0, target.length, ...source);
  return target;
}

/**
 * Normalizes settings onto the existing object so closures that captured
 * `state.settings` and its nested action entries keep working.
 * @param {Settings} settings
 * @returns {Settings}
 */
function normalizeSettingsInPlace(settings) {
  const normalized = normalizeSettings(settings);
  const { builtinActions, actionOrder, ...rest } = normalized;
  Object.assign(settings, rest);
  settings.builtinActions = syncBuiltinActions(settings.builtinActions, builtinActions);
  settings.actionOrder = syncStringList(settings.actionOrder, actionOrder);
  return settings;
}

async function save() {
  if (saveTimer) clearTimeout(saveTimer);
  const problem = validate();
  if (problem) {
    setStatus(problem, true);
    return;
  }

  state.engines.forEach((engine) => Object.assign(engine, normalizeEngine(engine)));
  normalizeSettingsInPlace(state.settings);

  try {
    await Promise.all([saveEngines(state.engines), saveSettings(state.settings)]);
  } catch (error) {
    setStatus(msg('statusSaveFailed', errorMessage(error)), true);
    return;
  }

  state.dirty = false;
  setStatus(msg('statusSaved'));
  clearStatusSoon();
}
