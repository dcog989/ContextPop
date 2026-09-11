const state = {
  engines: [],
  settings: null,
  dirty: false,
};

let saveTimer = null;
let statusTimer = null;
let iconSetters = new Map();

const elements = {
  actionList: document.getElementById('action-list'),
  actionRowTemplate: document.getElementById('action-row-template'),
  list: document.getElementById('engine-list'),
  status: document.getElementById('status'),
  importConfigFile: document.getElementById('import-config-file'),
  importBrowser: document.getElementById('import-browser-engines'),
  browserNote: document.getElementById('browser-import-note'),
  rowTemplate: document.getElementById('engine-row-template'),
  actionsPosition: document.getElementById('setting-actions-position'),
  trigger: document.getElementById('setting-trigger'),
  openMethod: document.getElementById('setting-open-method'),
  columns: document.getElementById('setting-columns'),
  theme: document.getElementById('setting-theme'),
  labels: document.getElementById('setting-labels'),
  faviconProvider: document.getElementById('setting-favicon-provider'),
  refreshIcons: document.getElementById('refresh-icons'),
  iconSize: document.getElementById('setting-icon-size'),
};

function msg(name, substitutions) {
  return api.i18n.getMessage(name, substitutions);
}

function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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

  const roots = [document, elements.rowTemplate?.content, elements.actionRowTemplate?.content].filter(Boolean);
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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function buildContextChips(contexts, onChange) {
  const container = document.createElement('div');
  for (const context of CONTEXTS) {
    const label = document.createElement('label');
    label.className = 'chip';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = contexts.includes(context);
    input.addEventListener('change', () => onChange(context, input.checked));

    const span = document.createElement('span');
    span.textContent = msg(`context${capitalize(context)}`);

    label.append(input, span);
    container.appendChild(label);
  }
  return container;
}

function createActionRow(actionId, index) {
  const def = BUILTIN_ACTION_DEFS.find((item) => item.id === actionId);
  const value = state.settings.builtinActions[actionId];
  const fragment = elements.actionRowTemplate.content.cloneNode(true);
  fragment.querySelector('.action-row').dataset.rowId = actionId;

  const enabled = fragment.querySelector('.action-enabled');
  enabled.checked = value.enabled;
  enabled.addEventListener('change', () => {
    value.enabled = enabled.checked;
    markDirty();
  });

  fragment.querySelector('.action-name').textContent = msg(`action${capitalize(actionId)}`);

  const templateField = fragment.querySelector('.action-template-field');
  if (def?.template) {
    templateField.hidden = false;
    const templateInput = fragment.querySelector('.action-template');
    templateInput.value = value.template || def.template;
    templateInput.addEventListener('input', () => {
      value.template = templateInput.value;
      markDirty();
    });
  }

  fragment.querySelector('.move-up').addEventListener('click', () => moveAction(index, -1));
  fragment.querySelector('.move-down').addEventListener('click', () => moveAction(index, 1));
  return fragment;
}

function renderActions() {
  elements.actionList.replaceChildren();
  state.settings.actionOrder.forEach((actionId, index) => {
    elements.actionList.appendChild(createActionRow(actionId, index));
  });
}

function captureRowPositions(container) {
  return new Map([...container.children].map((el) => [el.dataset.rowId, el.getBoundingClientRect().top]));
}

function playRowReorder(container, first) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of container.children) {
    const oldTop = first.get(el.dataset.rowId);
    if (oldTop === undefined) continue;
    const delta = oldTop - el.getBoundingClientRect().top;
    if (delta === 0) continue;
    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease';
        el.style.transform = '';
      });
    });
    el.addEventListener(
      'transitionend',
      () => {
        el.style.transition = '';
        el.style.transform = '';
      },
      { once: true },
    );
  }
}

function moveAction(index, offset) {
  const target = index + offset;
  const order = state.settings.actionOrder;
  if (target < 0 || target >= order.length) return;
  const first = captureRowPositions(elements.actionList);
  const [id] = order.splice(index, 1);
  order.splice(target, 0, id);
  renderActions();
  playRowReorder(elements.actionList, first);
  markDirty();
}

function createEngineIcon(engine) {
  const { element, setSource } = createFaviconIcon({
    prefix: 'engine',
    label: (engine.name || '?').trim().charAt(0).toUpperCase(),
  });
  element.className = 'engine-icon';
  return { element, setSource };
}

function createRow(engine, index) {
  const fragment = elements.rowTemplate.content.cloneNode(true);
  fragment.querySelector('.engine-row').dataset.rowId = engine.id;

  const icon = createEngineIcon(engine);
  fragment.querySelector('.engine-icon').replaceWith(icon.element);

  const name = fragment.querySelector('.engine-name');
  name.value = engine.name;
  name.addEventListener('input', () => {
    engine.name = name.value;
    markDirty();
  });

  const template = fragment.querySelector('.engine-template');
  template.value = engine.template;
  template.disabled = engine.source === 'browser';
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

  if (engine.source === 'browser') fragment.querySelector('.engine-badge').hidden = false;

  const contextHost = fragment.querySelector('.engine-contexts');
  contextHost.replaceChildren(
    buildContextChips(engine.contexts, (context, checked) => {
      engine.contexts = CONTEXTS.filter((item) => (item === context ? checked : engine.contexts.includes(item)));
      markDirty();
    }),
  );

  fragment.querySelector('.move-up').addEventListener('click', () => moveEngine(index, -1));
  fragment.querySelector('.move-down').addEventListener('click', () => moveEngine(index, 1));
  fragment.querySelector('.delete').addEventListener('click', () => deleteEngine(index));

  return { fragment, setIcon: icon.setSource };
}

async function upgradeIcons(iconSetters) {
  let icons = {};
  try {
    const response = await api.runtime.sendMessage({ type: 'getIcons' });
    if (response?.error) throw new Error(response.error);
    icons = response?.data || {};
  } catch {
    icons = {};
  }
  for (const engine of state.engines) {
    const setIcon = iconSetters.get(engine.id);
    if (setIcon) setIcon(icons[engine.id] || engine.icon);
  }
}

function renderEngines() {
  elements.list.replaceChildren();
  iconSetters = new Map();
  state.engines.forEach((engine, index) => {
    const { fragment, setIcon } = createRow(engine, index);
    elements.list.appendChild(fragment);
    iconSetters.set(engine.id, setIcon);
  });
  upgradeIcons(iconSetters);
}

function renderSettings() {
  elements.actionsPosition.value = state.settings.actionsPosition;
  elements.trigger.value = state.settings.trigger;
  elements.openMethod.value = state.settings.openMethod;
  elements.columns.value = state.settings.columns;
  elements.theme.value = state.settings.theme;
  elements.labels.checked = Boolean(state.settings.showLabels);
  elements.faviconProvider.value = state.settings.faviconProvider;
  elements.iconSize.value = state.settings.iconSize;
}

function moveEngine(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= state.engines.length) return;
  const first = captureRowPositions(elements.list);
  const [engine] = state.engines.splice(index, 1);
  state.engines.splice(target, 0, engine);
  renderEngines();
  playRowReorder(elements.list, first);
  markDirty();
}

function removeEngine(index) {
  state.engines.splice(index, 1);
  renderEngines();
  markDirty();
}

function deleteEngine(index) {
  const row = elements.list.children[index];
  if (!row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    removeEngine(index);
    return;
  }

  const first = captureRowPositions(elements.list);
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    removeEngine(index);
    playRowReorder(elements.list, first);
  };

  row.classList.add('row-removing');
  row.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 400);
}

function addEngine() {
  state.engines.push(normalizeEngine({ id: generateId(), name: '', source: 'template', template: '', icon: '' }));
  renderEngines();
  markDirty();
}

function restoreDefaults() {
  state.engines = defaultEngineList();
  renderEngines();
  markDirty();
  setStatus(msg('statusDefaultsRestored'));
}

async function importBrowserEngines() {
  if (typeof api.search?.get !== 'function') return;

  let installed = [];
  try {
    installed = await api.search.get();
  } catch (error) {
    setStatus(msg('statusImportFailed', error.message), true);
    return;
  }

  const existing = new Set(state.engines.map((engine) => engine.browserEngineName).filter(Boolean));
  let added = 0;
  for (const item of installed) {
    if (!item?.name || existing.has(item.name)) continue;
    state.engines.push(
      normalizeEngine({
        id: generateId(),
        name: item.name,
        source: 'browser',
        browserEngineName: item.name,
        icon: item.favIconUrl || '',
      }),
    );
    existing.add(item.name);
    added += 1;
  }

  renderEngines();
  markDirty();
  setStatus(msg('statusBrowserImported', String(added)));
}

function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function readConfigFile(file, apply) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (error) {
      setStatus(msg('statusImportFailed', error.message), true);
      return;
    }
    const incoming = Array.isArray(parsed) ? parsed : parsed.engines;
    if (!Array.isArray(incoming)) {
      setStatus(msg('errorConfigInvalid'), true);
      return;
    }
    apply(parsed, incoming);
  };
  reader.onerror = () => setStatus(msg('statusImportReadFailed'), true);
  reader.readAsText(file);
}

function importConfig(file) {
  readConfigFile(file, (parsed, incoming) => {
    state.engines = incoming.map(normalizeEngine);
    state.settings = normalizeSettings({ ...state.settings, ...(parsed.settings || {}) });
    renderActions();
    renderEngines();
    renderSettings();
    markDirty();
    setStatus(msg('statusConfigImported'));
  });
}

function exportConfig() {
  downloadJson('context-smart-settings.json', {
    app: 'context-smart',
    schema: 1,
    engines: state.engines,
    settings: state.settings,
  });
}

function validate() {
  for (const engine of state.engines) {
    if (!engine.name.trim()) return msg('errorNameRequired');
    if (engine.source === 'browser') continue;
    if (!engine.template.includes('{searchTerms}')) return msg('errorTemplateTerms', engine.name);
    if (!/^https?:\/\//i.test(engine.template)) return msg('errorTemplateScheme', engine.name);
  }
  return null;
}

function addOrigin(origins, value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'http:' || url.protocol === 'https:') origins.add(`${url.protocol}//${url.host}/*`);
  } catch {
    // Malformed URLs are ignored; the icon falls back to a letter.
  }
}

function collectIconOrigins(engines, settings) {
  const origins = new Set();
  const provider = settings.faviconProvider;
  for (const engine of engines) {
    if (engine.icon && !engine.icon.startsWith('data:')) addOrigin(origins, engine.icon);
    if (provider === 'none') continue;

    const embedded = typeof engine.icon === 'string' && engine.icon.startsWith('data:');
    const browserLike = engine.source === 'browser' || embedded;
    if (browserLike) {
      if (provider === 'duckduckgo') {
        origins.add('https://icons.duckduckgo.com/*');
        continue;
      }
      const host = browserEngineHost(engine.name);
      if (!host) continue;
      origins.add(`https://${host}/*`);
      if (!host.startsWith('www.')) origins.add(`https://www.${host}/*`);
      continue;
    }

    if (engine.icon) continue;
    if (provider === 'duckduckgo') {
      origins.add('https://icons.duckduckgo.com/*');
      continue;
    }
    try {
      const url = new URL(engine.template.replace(/\{searchTerms\}/g, 'x'));
      origins.add(`${url.protocol}//${url.host}/*`);
    } catch {
      // Skip engines with unparseable templates.
    }
  }
  return [...origins];
}

async function ensureIconPermission(engines, settings) {
  const origins = collectIconOrigins(engines, settings);
  if (!origins.length || !api.permissions?.request) return true;
  try {
    return await api.permissions.request({ origins });
  } catch {
    return false;
  }
}

async function save() {
  clearTimeout(saveTimer);
  const problem = validate();
  if (problem) {
    setStatus(problem, true);
    return;
  }

  state.engines = state.engines.map((engine) => normalizeEngine(engine));
  state.settings = normalizeSettings(state.settings);
  state.settings.columns = clamp(Number(state.settings.columns) || DEFAULT_SETTINGS.columns, 1, 12);

  const iconAccess = await ensureIconPermission(state.engines, state.settings);

  try {
    await Promise.all([saveEngines(state.engines), saveSettings(state.settings)]);
  } catch (error) {
    setStatus(msg('statusSaveFailed', error.message), true);
    return;
  }

  state.dirty = false;
  setStatus(iconAccess ? msg('statusSaved') : msg('statusIconPermission'));
  clearStatusSoon();
}

function configureBrowserImport() {
  const available = typeof api.search?.get === 'function';
  elements.importBrowser.hidden = !available;
  elements.browserNote.hidden = available;
}

function reloadIcons() {
  upgradeIcons(iconSetters);
}

async function handleRefreshIcons() {
  if (state.dirty) {
    setStatus(msg('statusSaveFirst'), true);
    return;
  }
  elements.refreshIcons.disabled = true;
  elements.refreshIcons.classList.add('is-loading');
  try {
    await ensureIconPermission(state.engines, state.settings);

    const response = await api.runtime.sendMessage({ type: 'refreshIcons' });
    if (response?.error) throw new Error(response.error);
    const icons = response?.data || {};
    for (const engine of state.engines) {
      const setIcon = iconSetters.get(engine.id);
      if (setIcon) setIcon(icons[engine.id] || engine.icon);
    }
    setStatus(msg('statusIconsRefreshed'));
    clearStatusSoon();
  } catch (error) {
    setStatus(msg('statusRefreshFailed', error.message), true);
  } finally {
    elements.refreshIcons.disabled = false;
    elements.refreshIcons.classList.remove('is-loading');
  }
}

function bindSettings() {
  elements.actionsPosition.addEventListener('change', () => {
    state.settings.actionsPosition = elements.actionsPosition.value;
    markDirty();
  });
  elements.trigger.addEventListener('change', () => {
    state.settings.trigger = elements.trigger.value;
    markDirty();
  });
  elements.openMethod.addEventListener('change', () => {
    state.settings.openMethod = elements.openMethod.value;
    markDirty();
  });
  elements.columns.addEventListener('change', () => {
    state.settings.columns = clamp(Number(elements.columns.value) || DEFAULT_SETTINGS.columns, 1, 12);
    elements.columns.value = state.settings.columns;
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
  elements.faviconProvider.addEventListener('change', () => {
    state.settings.faviconProvider = elements.faviconProvider.value;
    markDirty();
    reloadIcons();
  });
  elements.iconSize.addEventListener('change', () => {
    state.settings.iconSize = elements.iconSize.value;
    markDirty();
  });
}

function bindActions() {
  document.getElementById('add-engine').addEventListener('click', addEngine);
  document.getElementById('restore-defaults').addEventListener('click', restoreDefaults);
  elements.refreshIcons.addEventListener('click', handleRefreshIcons);
  elements.importBrowser.addEventListener('click', importBrowserEngines);
  document.getElementById('export-config').addEventListener('click', exportConfig);
  document.getElementById('import-config').addEventListener('click', () => elements.importConfigFile.click());
  elements.importConfigFile.addEventListener('change', () => {
    const [file] = elements.importConfigFile.files;
    elements.importConfigFile.value = '';
    if (file) importConfig(file);
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
  renderActions();
  renderEngines();
  renderSettings();
  configureBrowserImport();
}

globalThis.__contextSmartTheme?.applyTokens(document.documentElement);
localize();
bindSettings();
bindActions();
load();
