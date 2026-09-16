// Options page entry point: the DOM lookup table, top-level event wiring, and bootstrap.
// Loaded last; the sibling options* modules reference `elements` only when their functions
// run, which happens after this file has initialized it.

const elements = {
  actionList: /** @type {HTMLElement} */ (document.getElementById('action-list')),
  actionRowTemplate: /** @type {HTMLTemplateElement} */ (document.getElementById('action-row-template')),
  list: /** @type {HTMLElement} */ (document.getElementById('engine-list')),
  status: /** @type {HTMLElement} */ (document.getElementById('status')),
  importConfigFile: /** @type {HTMLInputElement} */ (document.getElementById('import-config-file')),
  importBrowser: /** @type {HTMLButtonElement} */ (document.getElementById('import-browser-engines')),
  browserNote: /** @type {HTMLElement} */ (document.getElementById('browser-import-note')),
  rowTemplate: /** @type {HTMLTemplateElement} */ (document.getElementById('engine-row-template')),
  actionsPosition: /** @type {HTMLSelectElement} */ (document.getElementById('setting-actions-position')),
  trigger: /** @type {HTMLSelectElement} */ (document.getElementById('setting-trigger')),
  openMethod: /** @type {HTMLSelectElement} */ (document.getElementById('setting-open-method')),
  columns: /** @type {HTMLInputElement} */ (document.getElementById('setting-columns')),
  theme: /** @type {HTMLSelectElement} */ (document.getElementById('setting-theme')),
  labels: /** @type {HTMLInputElement} */ (document.getElementById('setting-labels')),
  accentBorder: /** @type {HTMLInputElement} */ (document.getElementById('setting-accent-border')),
  refreshIcons: /** @type {HTMLButtonElement} */ (document.getElementById('refresh-icons')),
  popupSize: /** @type {HTMLSelectElement} */ (document.getElementById('setting-popup-size')),
  popupPosition: /** @type {HTMLSelectElement} */ (document.getElementById('setting-popup-position')),
  popupAnimation: /** @type {HTMLInputElement} */ (document.getElementById('setting-popup-animation')),
  popupOpacity: /** @type {HTMLInputElement} */ (document.getElementById('setting-popup-opacity')),
  popupOpacityValue: /** @type {HTMLElement} */ (document.getElementById('setting-popup-opacity-value')),
  version: /** @type {HTMLElement} */ (document.getElementById('version')),
  onboarding: /** @type {HTMLElement} */ (document.getElementById('onboarding')),
  onboardingDismiss: /** @type {HTMLButtonElement} */ (document.getElementById('onboarding-dismiss')),
};

/**
 * @param {string} id
 * @returns {HTMLElement}
 */
function byId(id) {
  return /** @type {HTMLElement} */ (document.getElementById(id));
}

function configureBrowserImport() {
  const available = typeof api.search?.get === 'function';
  elements.importBrowser.hidden = !available;
  elements.browserNote.hidden = available;
}

function bindActions() {
  byId('add-engine').addEventListener('click', addEngine);
  byId('restore-defaults').addEventListener('click', restoreDefaults);
  byId('restore-action-defaults').addEventListener('click', restoreActionDefaults);
  elements.refreshIcons.addEventListener('click', handleRefreshIcons);
  elements.importBrowser.addEventListener('click', importBrowserEngines);
  byId('export-config').addEventListener('click', exportConfig);
  byId('import-config').addEventListener('click', () => elements.importConfigFile.click());
  elements.importConfigFile.addEventListener('change', () => {
    const file = elements.importConfigFile.files?.[0];
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
  loadEngineIcons();
  await revealOnboarding();
}

globalThis.__contextPopTheme?.applyTokens(document.documentElement);
localize();
elements.version.textContent = `v${api.runtime.getManifest().version}`;
bindSettings();
bindActions();
bindOnboarding();
load();
