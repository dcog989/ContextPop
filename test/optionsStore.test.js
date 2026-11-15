const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/loadScripts');

const FILES = [
  'url.js',
  'util.js',
  'actionIcons.js',
  'actions.js',
  'defaultEngines.js',
  'storage.js',
  'engineSource.js',
  'optionsStore.js',
];

// A save writes the touched collections through a held promise, so a change can be made
// while the write is in flight - the case that used to drop it.
function createHarness() {
  const store = {};
  const writes = [];
  const releases = [];
  const browser = {
    storage: {
      local: {
        async get(key) {
          return { [key]: store[key] };
        },
        set(values) {
          writes.push(Object.keys(values));
          return new Promise((resolve) =>
            releases.push(() => {
              Object.assign(store, values);
              resolve();
            }),
          );
        },
      },
    },
  };
  const elements = { status: { textContent: '', classList: { toggle() {} } } };
  const context = loadScripts(FILES, { browser, elements, msg: (key) => key });
  return { context, writes, releases };
}

test('a change made during an in-flight save is not dropped', async () => {
  const { context, writes, releases } = createHarness();
  const { markDirty, markLoaded, save, STORAGE_KEYS } = context;

  markLoaded();
  markDirty(STORAGE_KEYS.engines);
  const firstSave = save();
  assert.equal(writes.length, 1);

  markDirty(STORAGE_KEYS.engines); // lands while the first write is still pending
  releases[0]();
  await firstSave;
  assert.equal(writes.length, 1);

  const secondSave = save();
  assert.equal(writes.length, 2); // the second change produced its own write
  releases[1]();
  await secondSave;
});
