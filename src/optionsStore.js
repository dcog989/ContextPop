// Options-page state and persistence: the single source of truth for engines and settings,
// plus debounced saving and validation. Views mutate `state` and call markDirty() to
// schedule a save.

const state = {
  engines: [],
  settings: null,
  dirty: false,
};

let saveTimer = null;
let statusTimer = null;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

function clearStatusSoon() {
  clearTimeout(statusTimer);
  statusTimer = setTimeout(() => {
    if (!state.dirty) setStatus('');
  }, 1500);
}

function markDirty() {
  state.dirty = true;
  setStatus(msg('statusSaving'));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => save(), 400);
}

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
  clearTimeout(saveTimer);
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
    setStatus(msg('statusSaveFailed', error.message), true);
    return;
  }

  state.dirty = false;
  setStatus(msg('statusSaved'));
  clearStatusSoon();
}
