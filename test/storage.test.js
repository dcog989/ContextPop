const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/loadScripts');

const FILES = ['util.js', 'actions.js', 'defaultEngines.js', 'storage.js'];

function createBrowser(extra = {}) {
  const store = {};
  const service = {
    storage: {
      local: {
        async get(key) {
          return { [key]: store[key] };
        },
        async set(values) {
          Object.assign(store, values);
        },
      },
    },
    ...extra,
  };
  return { store, service };
}

test('normalizeEngine fills defaults and coerces invalid fields', () => {
  const { normalizeEngine } = loadScripts(FILES, { browser: {} });
  const engine = normalizeEngine({});
  assert.equal(engine.source, 'template');
  assert.equal(engine.enabled, true);
  assert.equal(engine.name, '');
  assert.equal(engine.template, '');
  assert.equal(engine.browserEngineName, '');
  assert.equal(engine.icon, '');
  assert.equal(typeof engine.id, 'string');
  assert.ok(engine.id.length > 0);
});

test('normalizeEngine keeps a valid source and explicit disabled flag', () => {
  const { normalizeEngine } = loadScripts(FILES, { browser: {} });
  assert.equal(normalizeEngine({ source: 'weird' }).source, 'template');
  assert.equal(normalizeEngine({ source: 'browser' }).source, 'browser');
  assert.equal(normalizeEngine({ enabled: false }).enabled, false);
  assert.equal(normalizeEngine({ icon: 5 }).icon, '');
});

test('normalizeSettings clamps and rounds columns', () => {
  const { normalizeSettings } = loadScripts(FILES, { browser: {} });
  assert.equal(normalizeSettings({ columns: 99 }).columns, 12);
  assert.equal(normalizeSettings({ columns: 0 }).columns, 1);
  assert.equal(normalizeSettings({ columns: -4 }).columns, 1);
  assert.equal(normalizeSettings({ columns: 3.6 }).columns, 4);
  assert.equal(normalizeSettings({ columns: 'abc' }).columns, 6);
});

test('normalizeSettings clamps opacity and validates enums and booleans', () => {
  const { normalizeSettings } = loadScripts(FILES, { browser: {} });
  assert.equal(normalizeSettings({ popupOpacity: -5 }).popupOpacity, 0);
  assert.equal(normalizeSettings({ popupOpacity: 150 }).popupOpacity, 100);
  assert.equal(normalizeSettings({ popupOpacity: 42.7 }).popupOpacity, 43);
  assert.equal(normalizeSettings({ popupOpacity: 'x' }).popupOpacity, 100);
  assert.equal(normalizeSettings({ popupSize: 'huge' }).popupSize, 'standard');
  assert.equal(normalizeSettings({ popupSize: 'large' }).popupSize, 'large');
  assert.equal(normalizeSettings({ actionsPosition: 'middle' }).actionsPosition, 'before');
  assert.equal(normalizeSettings({ popupPosition: 'left' }).popupPosition, 'below');
  assert.equal(normalizeSettings({ popupAnimation: 1 }).popupAnimation, false);
  assert.equal(normalizeSettings({ popupAnimation: true }).popupAnimation, true);
});

test('normalizeSettings rebuilds the built-in action list and order', () => {
  const { normalizeSettings } = loadScripts(FILES, { browser: {} });
  const settings = normalizeSettings({ actionOrder: ['bogus', 'thesaurus', 'thesaurus'] });
  assert.equal(settings.actionOrder[0], 'thesaurus');
  assert.equal(settings.actionOrder.length, 7);
  assert.deepStrictEqual(Object.keys(settings.builtinActions).sort(), [
    'copyLink',
    'copyPlain',
    'copyRich',
    'define',
    'openLink',
    'thesaurus',
    'translate',
  ]);
});

test('filterUsableEngines drops browser engines only when search is unavailable', () => {
  const engines = [
    { id: 't', source: 'template' },
    { id: 'b', source: 'browser' },
  ];
  const unsupported = loadScripts(FILES, { browser: {} });
  const kept = unsupported.filterUsableEngines(engines);
  assert.equal(kept.length, 1);
  assert.equal(kept[0].id, 't');

  const supported = loadScripts(FILES, { browser: { search: { search() {} } } });
  assert.equal(supported.filterUsableEngines(engines).length, 2);
});

test('loadEngines seeds defaults and persists them when storage is empty', async () => {
  const { store, service } = createBrowser();
  const { loadEngines } = loadScripts(FILES, { browser: service });
  const engines = await loadEngines();
  assert.equal(engines.length, 4);
  assert.equal(store.engines.length, 4);
  assert.equal(store.engines[0].name, 'DuckDuckGo');
});

test('loadEngines returns every stored engine, including unsupported browser engines', async () => {
  const { store, service } = createBrowser();
  store.engines = [
    { id: 'b', name: 'Bing', source: 'browser', browserEngineName: 'Bing', template: '', icon: '' },
    { id: 't', name: 'DDG', source: 'template', template: 'https://x/?q={searchTerms}', icon: '' },
  ];
  const { loadEngines } = loadScripts(FILES, { browser: service });
  const engines = await loadEngines();
  assert.equal(engines.length, 2);
  assert.equal(
    engines.some((engine) => engine.source === 'browser'),
    true,
  );
  assert.equal(engines[1].enabled, true);
});
