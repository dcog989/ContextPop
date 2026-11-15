const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/loadScripts');

// opener.js is background-only, but these helpers are pure; the other modules only supply
// the constants and template helpers it references at load time.
const FILES = [
  'url.js',
  'util.js',
  'iconParse.js',
  'actionIcons.js',
  'actions.js',
  'defaultEngines.js',
  'storage.js',
  'engineSource.js',
  'opener.js',
];
const { normalizeTerms, resolveOpenMethod, dispositionFor, MAX_QUERY_CHARS } = loadScripts(FILES, { browser: {} });

test('normalizeTerms trims the selection and bounds the query', () => {
  assert.equal(normalizeTerms('  a b  '), 'a b');
  assert.equal(normalizeTerms(undefined), '');
  assert.equal(normalizeTerms('x'.repeat(MAX_QUERY_CHARS + 10)).length, MAX_QUERY_CHARS);
});

test('resolveOpenMethod falls back to a new tab without a sender tab or for unknown methods', () => {
  assert.equal(resolveOpenMethod('currentTab', {}), 'newTab');
  assert.equal(resolveOpenMethod('currentTab', { tab: { id: 7 } }), 'currentTab');
  assert.equal(resolveOpenMethod('bogus', { tab: { id: 7 } }), 'newTab');
  assert.equal(resolveOpenMethod('newWindow', {}), 'newWindow');
});

test('dispositionFor maps open methods and defaults to a new tab', () => {
  assert.equal(dispositionFor('newTab'), 'NEW_TAB');
  assert.equal(dispositionFor('currentTab'), 'CURRENT_TAB');
  assert.equal(dispositionFor('newWindow'), 'NEW_WINDOW');
  assert.equal(dispositionFor('backgroundTab'), 'NEW_TAB');
});
