// Configuration transfer: serialize engines/settings to a JSON download and read an
// exported file back into `state`, then re-render the affected views.

/**
 * @param {string} filename
 * @param {any} data
 */
function downloadJson(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

/**
 * @param {File} file
 * @param {(parsed: any, incoming: any[]) => void} apply
 */
function readConfigFile(file, apply) {
  const reader = new FileReader();
  reader.onload = () => {
    let parsed;
    try {
      parsed = JSON.parse(String(reader.result));
    } catch (error) {
      setStatus(msg('statusImportFailed', errorMessage(error)), true);
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

/**
 * @param {File} file
 */
function importConfig(file) {
  readConfigFile(file, (parsed, incoming) => {
    state.engines = filterUsableEngines(incoming.map(normalizeEngine));
    state.settings = normalizeSettings({ ...state.settings, ...(parsed.settings || {}) });
    renderActions();
    renderEngines();
    renderSettings();
    markDirty();
    setStatus(msg('statusConfigImported'));
  });
}

function exportConfig() {
  downloadJson('contextpop-settings.json', {
    app: 'contextpop',
    schema: 1,
    engines: state.engines,
    settings: state.settings,
  });
}
