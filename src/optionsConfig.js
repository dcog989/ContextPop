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
      setStatus({ key: 'statusImportFailed', args: errorMessage(error) }, true);
      return;
    }
    // Only our own export is accepted: importing anything else replaces every engine and
    // setting with whatever the file happens to contain.
    if (!parsed || typeof parsed !== 'object' || parsed.app !== 'contextpop' || !Array.isArray(parsed.engines)) {
      setStatus({ key: 'errorConfigInvalid' }, true);
      return;
    }
    apply(parsed, parsed.engines);
  };
  reader.onerror = () => setStatus({ key: 'statusImportReadFailed' }, true);
  reader.readAsText(file);
}

/**
 * @param {File} file
 */
function importConfig(file) {
  readConfigFile(file, (parsed, incoming) => {
    const seen = new Set();
    state.engines = incoming.map((entry) => {
      const engine = normalizeEngine(entry);
      if (seen.has(engine.id)) engine.id = generateId();
      seen.add(engine.id);
      return engine;
    });
    state.settings = normalizeSettings({ ...state.settings, ...(parsed.settings || {}) });
    renderActions();
    renderEngines();
    renderSettings();
    markDirty(STORAGE_KEYS.engines);
    markDirty(STORAGE_KEYS.settings);
    setStatus({ key: 'statusConfigImported' });
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
