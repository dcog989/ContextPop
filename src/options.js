// Options page entry point: the DOM lookup table, top-level event wiring, and bootstrap.
// Loaded last; the sibling options* modules reference `elements` only when their functions
// run, which happens after this file has initialized it.

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
  accentBorder: document.getElementById('setting-accent-border'),
  refreshIcons: document.getElementById('refresh-icons'),
  popupSize: document.getElementById('setting-popup-size'),
  popupPosition: document.getElementById('setting-popup-position'),
  popupAnimation: document.getElementById('setting-popup-animation'),
  popupOpacity: document.getElementById('setting-popup-opacity'),
  popupOpacityValue: document.getElementById('setting-popup-opacity-value'),
  version: document.getElementById('version'),
};

function configureBrowserImport() {
  const available = typeof api.search?.get === 'function';
  elements.importBrowser.hidden = !available;
  elements.browserNote.hidden = available;
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

globalThis.__contextPopTheme?.applyTokens(document.documentElement);
localize();
elements.version.textContent = `v${api.runtime.getManifest().version}`;
bindSettings();
bindActions();
load();
