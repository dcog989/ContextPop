// Options-page state and persistence: the single source of truth for engines and settings,
// plus debounced saving and validation. Views mutate `state` and call markDirty(key) with
// the storage key they changed to schedule a save of just that key.

/** @type {{ engines: Engine[], settings: Settings, dirty: boolean, dirtyKeys: Set<string> }} */
const state = {
  engines: [],
  settings: defaultSettings(),
  dirty: false,
  dirtyKeys: new Set(),
};

/** @type {ReturnType<typeof setTimeout> | null} */
let saveTimer = null;
/** @type {ReturnType<typeof setTimeout> | null} */
let statusTimer = null;

/**
 * @param {MessageSpec | null} message
 * @param {boolean} [isError]
 */
function setStatus(message, isError = false) {
  elements.status.textContent = message ? msg(message.key, message.args) : '';
  elements.status.classList.toggle('error', isError);
}

function clearStatusSoon() {
  if (statusTimer) clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (!state.dirty) setStatus(null);
  }, 1500);
}

/**
 * @param {string} key
 */
function markDirty(key) {
  state.dirty = true;
  state.dirtyKeys.add(key);
  setStatus({ key: 'statusSaving' });
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 400);
}

/**
 * @param {string} name
 * @param {string} template
 * @returns {MessageSpec | null}
 */
function templateError(name, template) {
  const problem = templateProblem(template);
  if (problem === TEMPLATE_PROBLEM.missingTerms) return { key: 'errorTemplateTerms', args: name };
  if (problem === TEMPLATE_PROBLEM.scheme) return { key: 'errorTemplateScheme', args: name };
  return null;
}

/**
 * @returns {MessageSpec | null}
 */
function validate() {
  for (const engine of state.engines) {
    if (engine.enabled === false) continue;
    if (!engine.name.trim()) return { key: 'errorNameRequired' };
    if (engine.source === ENGINE_SOURCE.browser) continue;
    const problem = templateError(engine.name, engine.template);
    if (problem) return problem;
  }
  for (const def of BUILTIN_ACTION_DEFS) {
    if (!def.template) continue;
    const value = state.settings.builtinActions[def.id];
    if (!value?.enabled) continue;
    const name = (msg(actionMessageKey(def.id)) || capitalize(def.id)).trim();
    const problem = templateError(name, String(value.template ?? ''));
    if (problem) return problem;
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

  for (const engine of state.engines) Object.assign(engine, normalizeEngine(engine));
  normalizeSettingsInPlace(state.settings);

  // Persist only the collections the user actually touched, so an engine edit does not
  // rewrite settings (and wake every frame's storage.onChanged listener), and vice versa.
  /** @type {Promise<void>[]} */
  const writes = [];
  if (state.dirtyKeys.has(STORAGE_KEYS.engines)) writes.push(saveEngines(state.engines));
  if (state.dirtyKeys.has(STORAGE_KEYS.settings)) writes.push(saveSettings(state.settings));

  try {
    await Promise.all(writes);
  } catch (error) {
    setStatus({ key: 'statusSaveFailed', args: errorMessage(error) }, true);
    return;
  }

  state.dirtyKeys.clear();
  state.dirty = false;
  setStatus({ key: 'statusSaved' });
  clearStatusSoon();
}
