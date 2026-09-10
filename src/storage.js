const api = globalThis.browser ?? globalThis.chrome;

const STORAGE_KEYS = Object.freeze({
  engines: 'engines',
  settings: 'settings',
});

const DEFAULT_SETTINGS = Object.freeze({
  trigger: 'mouseup',
  openMethod: 'newTab',
  columns: 6,
  theme: 'auto',
  showLabels: false,
});

function generateId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function buildSearchUrl(engine, terms) {
  return engine.template.replace(/\{searchTerms\}/g, encodeURIComponent(terms));
}

function defaultEngineList() {
  return DEFAULT_ENGINES.map((engine) => ({ ...engine }));
}

async function loadEngines() {
  const result = await api.storage.local.get(STORAGE_KEYS.engines);
  const engines = result[STORAGE_KEYS.engines];
  return Array.isArray(engines) ? engines : [];
}

async function saveEngines(engines) {
  await api.storage.local.set({ [STORAGE_KEYS.engines]: engines });
}

async function loadSettings() {
  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  return { ...DEFAULT_SETTINGS, ...(result[STORAGE_KEYS.settings] || {}) };
}

async function saveSettings(settings) {
  await api.storage.local.set({ [STORAGE_KEYS.settings]: settings });
}
