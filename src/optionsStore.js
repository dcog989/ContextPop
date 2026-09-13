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
    if (!/^https?:\/\//i.test(engine.template)) return msg('errorTemplateScheme', engine.name);
  }
  for (const def of BUILTIN_ACTION_DEFS) {
    if (!def.template) continue;
    const value = state.settings.builtinActions[def.id];
    if (!value?.enabled) continue;
    const template = String(value.template ?? '');
    const name = (msg(`action${capitalize(def.id)}`) || capitalize(def.id)).trim();
    if (!template.includes('{searchTerms}')) return msg('errorTemplateTerms', name);
    if (!/^https?:\/\//i.test(template)) return msg('errorTemplateScheme', name);
  }
  return null;
}

async function save() {
  if (saveTimer) clearTimeout(saveTimer);
  const problem = validate();
  if (problem) {
    setStatus(problem, true);
    return;
  }

  const engines = state.engines.map((engine) => normalizeEngine(engine));
  const settings = normalizeSettings(state.settings);
  settings.columns = clamp(Number(settings.columns) || DEFAULT_SETTINGS.columns, 1, 12);

  try {
    await Promise.all([saveEngines(engines), saveSettings(settings)]);
  } catch (error) {
    setStatus(msg('statusSaveFailed', errorMessage(error)), true);
    return;
  }

  state.dirty = false;
  setStatus(msg('statusSaved'));
  clearStatusSoon();
}
