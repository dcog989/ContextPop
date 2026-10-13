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
 * @returns {MessageSpec | null}
 */
function validate() {
  for (const engine of state.engines) {
    if (engine.enabled === false) continue;
    const problem = engineStrategy(engine).validate(engine);
    if (problem) return problem;
  }
  for (const def of BUILTIN_ACTION_DEFS) {
    if (!def.template) continue;
    const value = state.settings.builtinActions[def.id];
    if (!value?.enabled) continue;
    const name = (msg(actionMessageKey(def.id)) || capitalize(def.id)).trim();
    const problem = templateProblemMessage(String(value.template ?? ''), name);
    if (problem) return problem;
  }
  return null;
}

extendEngineSource(ENGINE_SOURCE.template, {
  validate: (engine) =>
    engine.name.trim() ? templateProblemMessage(engine.template, engine.name) : { key: 'errorNameRequired' },
});

extendEngineSource(ENGINE_SOURCE.browser, {
  validate: (engine) => (engine.name.trim() ? null : { key: 'errorNameRequired' }),
});

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

  for (const key of Object.keys(settings.builtinActions)) {
    if (!(key in builtinActions)) delete settings.builtinActions[key];
  }
  for (const [id, entry] of Object.entries(builtinActions)) {
    const current = settings.builtinActions[id];
    if (current) Object.assign(current, entry);
    else settings.builtinActions[id] = { ...entry };
  }
  settings.actionOrder.splice(0, settings.actionOrder.length, ...actionOrder);
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
  // Take the pending keys before the await: a change made while the write is in flight
  // re-adds its key to a fresh set and schedules its own save, so this one cannot drop it.
  const pending = state.dirtyKeys;
  state.dirtyKeys = new Set();

  /** @type {Promise<void>[]} */
  const writes = [];
  if (pending.has(STORAGE_KEYS.engines)) writes.push(saveEngines(state.engines));
  if (pending.has(STORAGE_KEYS.settings)) writes.push(saveSettings(state.settings));

  try {
    await Promise.all(writes);
  } catch (error) {
    for (const key of pending) state.dirtyKeys.add(key);
    setStatus({ key: 'statusSaveFailed', args: errorMessage(error) }, true);
    return;
  }

  if (state.dirtyKeys.size === 0) {
    state.dirty = false;
    setStatus({ key: 'statusSaved' });
    clearStatusSoon();
  }
}
