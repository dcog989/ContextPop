const state = {
  engines: [],
  settings: { ...DEFAULT_SETTINGS },
  dirty: false,
};

const elements = {
  list: document.getElementById('engine-list'),
  status: document.getElementById('status'),
  importFile: document.getElementById('import-file'),
  rowTemplate: document.getElementById('engine-row-template'),
  trigger: document.getElementById('setting-trigger'),
  openMethod: document.getElementById('setting-open-method'),
  columns: document.getElementById('setting-columns'),
  theme: document.getElementById('setting-theme'),
  labels: document.getElementById('setting-labels'),
};

function msg(name, substitutions) {
  return api.i18n.getMessage(name, substitutions);
}

function localize() {
  const attributeBindings = [
    {
      selector: '[data-i18n-placeholder]',
      key: 'i18nPlaceholder',
      apply: (element, value) => (element.placeholder = value),
    },
    {
      selector: '[data-i18n-aria-label]',
      key: 'i18nAriaLabel',
      apply: (element, value) => element.setAttribute('aria-label', value),
    },
    { selector: '[data-i18n-title]', key: 'i18nTitle', apply: (element, value) => (element.title = value) },
  ];

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const value = msg(element.dataset.i18n);
    if (value) element.textContent = value;
  }

  const roots = [document, elements.rowTemplate?.content].filter(Boolean);
  for (const root of roots) {
    for (const { selector, key, apply } of attributeBindings) {
      for (const element of root.querySelectorAll(selector)) {
        const value = msg(element.dataset[key]);
        if (value) apply(element, value);
      }
    }
  }

  document.title = msg('optionsPageTitle');
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status.classList.toggle('error', isError);
}

function markDirty() {
  state.dirty = true;
  setStatus(msg('statusUnsaved'));
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function createRow(engine, index) {
  const fragment = elements.rowTemplate.content.cloneNode(true);

  fragment.querySelector('.engine-icon').textContent = (engine.name || '?').trim().charAt(0).toUpperCase();

  const name = fragment.querySelector('.engine-name');
  name.value = engine.name;
  name.addEventListener('input', () => {
    engine.name = name.value;
    markDirty();
  });

  const template = fragment.querySelector('.engine-template');
  template.value = engine.template;
  template.addEventListener('input', () => {
    engine.template = template.value;
    markDirty();
  });

  const iconUrl = fragment.querySelector('.engine-icon-url');
  iconUrl.value = engine.icon || '';
  iconUrl.addEventListener('input', () => {
    engine.icon = iconUrl.value.trim();
    markDirty();
  });

  fragment.querySelector('.move-up').addEventListener('click', () => moveEngine(index, -1));
  fragment.querySelector('.move-down').addEventListener('click', () => moveEngine(index, 1));
  fragment.querySelector('.delete').addEventListener('click', () => deleteEngine(index));

  return fragment;
}

function renderEngines() {
  elements.list.replaceChildren();
  state.engines.forEach((engine, index) => {
    elements.list.appendChild(createRow(engine, index));
  });
}

function renderSettings() {
  elements.trigger.value = state.settings.trigger;
  elements.openMethod.value = state.settings.openMethod;
  elements.columns.value = state.settings.columns;
  elements.theme.value = state.settings.theme;
  elements.labels.checked = Boolean(state.settings.showLabels);
}

function moveEngine(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= state.engines.length) return;
  const [engine] = state.engines.splice(index, 1);
  state.engines.splice(target, 0, engine);
  renderEngines();
  markDirty();
}

function deleteEngine(index) {
  state.engines.splice(index, 1);
  renderEngines();
  markDirty();
}

function addEngine() {
  state.engines.push({ id: generateId(), name: '', template: '', icon: '' });
  renderEngines();
  markDirty();
}

function restoreDefaults() {
  state.engines = defaultEngineList();
  renderEngines();
  markDirty();
  setStatus(msg('statusDefaultsRestored'));
}

function importEngines(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(String(reader.result));
      const incoming = Array.isArray(parsed) ? parsed : parsed.engines;
      if (!Array.isArray(incoming)) throw new Error('No engine array found');
      state.engines = incoming.map((engine) => ({
        id: engine.id || generateId(),
        name: String(engine.name ?? ''),
        template: String(engine.template ?? ''),
        icon: engine.icon || '',
      }));
      renderEngines();
      markDirty();
      setStatus(msg('statusImported', String(state.engines.length)));
    } catch (error) {
      setStatus(msg('statusImportFailed', error.message), true);
    }
  };
  reader.onerror = () => setStatus(msg('statusImportReadFailed'), true);
  reader.readAsText(file);
}

function exportEngines() {
  const blob = new Blob([JSON.stringify({ engines: state.engines }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'context-smart-engines.json';
  link.click();
  URL.revokeObjectURL(url);
}

function validate() {
  for (const engine of state.engines) {
    if (!engine.name.trim()) return msg('errorNameRequired');
    if (!engine.template.includes('{searchTerms}')) {
      return msg('errorTemplateTerms', engine.name);
    }
  }
  return null;
}

function collectIconOrigins(engines) {
  const origins = new Set();
  for (const engine of engines) {
    if (!engine.icon || engine.icon.startsWith('data:')) continue;
    try {
      const url = new URL(engine.icon);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        origins.add(`${url.protocol}//${url.host}/*`);
      }
    } catch {
      // Malformed icon URLs are ignored here; the icon falls back to a letter.
    }
  }
  return [...origins];
}

async function ensureIconPermission(engines) {
  const origins = collectIconOrigins(engines);
  if (!origins.length || !api.permissions?.request) return true;
  try {
    return await api.permissions.request({ origins });
  } catch {
    return false;
  }
}

async function save() {
  const problem = validate();
  if (problem) {
    setStatus(problem, true);
    return;
  }

  state.engines = state.engines.map((engine) => ({
    id: engine.id || generateId(),
    name: engine.name.trim(),
    template: engine.template.trim(),
    icon: engine.icon || '',
  }));
  state.settings.columns = clamp(Number(state.settings.columns) || DEFAULT_SETTINGS.columns, 1, 12);

  const iconAccess = await ensureIconPermission(state.engines);

  try {
    await Promise.all([saveEngines(state.engines), saveSettings(state.settings)]);
  } catch (error) {
    setStatus(msg('statusSaveFailed', error.message), true);
    return;
  }

  state.dirty = false;
  renderEngines();
  renderSettings();
  setStatus(iconAccess ? msg('statusSaved') : msg('statusIconPermission'));
  setTimeout(() => {
    if (!state.dirty) setStatus('');
  }, 1500);
}

function bindSettings() {
  elements.trigger.addEventListener('change', () => {
    state.settings.trigger = elements.trigger.value;
    markDirty();
  });
  elements.openMethod.addEventListener('change', () => {
    state.settings.openMethod = elements.openMethod.value;
    markDirty();
  });
  elements.columns.addEventListener('change', () => {
    state.settings.columns = Number(elements.columns.value);
    markDirty();
  });
  elements.theme.addEventListener('change', () => {
    state.settings.theme = elements.theme.value;
    markDirty();
  });
  elements.labels.addEventListener('change', () => {
    state.settings.showLabels = elements.labels.checked;
    markDirty();
  });
}

function bindActions() {
  document.getElementById('add-engine').addEventListener('click', addEngine);
  document.getElementById('restore-defaults').addEventListener('click', restoreDefaults);
  document.getElementById('export-engines').addEventListener('click', exportEngines);
  document.getElementById('import-engines').addEventListener('click', () => elements.importFile.click());
  document.getElementById('save').addEventListener('click', save);
  elements.importFile.addEventListener('change', () => {
    const [file] = elements.importFile.files;
    elements.importFile.value = '';
    if (file) importEngines(file);
  });

  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault();
      save();
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (!state.dirty) return;
    event.preventDefault();
  });
}

async function load() {
  [state.engines, state.settings] = await Promise.all([loadEngines(), loadSettings()]);
  renderEngines();
  renderSettings();
}

localize();
bindSettings();
bindActions();
load();
