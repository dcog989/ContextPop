const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadScripts } = require('./helpers/loadScripts');

const context = loadScripts(['util.js']);
const { buildSearchUrl, isHttpUrl, templateHasSearchTerms, capitalize, errorMessage } = context;

test('buildSearchUrl substitutes and encodes every occurrence', () => {
  assert.equal(
    buildSearchUrl('https://x/?q={searchTerms}&again={searchTerms}', 'a b&c'),
    'https://x/?q=a%20b%26c&again=a%20b%26c',
  );
  assert.equal(buildSearchUrl('https://x/?q={searchTerms}', ''), 'https://x/?q=');
});

test('isHttpUrl accepts only http and https', () => {
  assert.equal(isHttpUrl('https://example.com/path'), true);
  assert.equal(isHttpUrl('http://example.com'), true);
  assert.equal(isHttpUrl('ftp://example.com'), false);
  assert.equal(isHttpUrl('javascript:alert(1)'), false);
  assert.equal(isHttpUrl('not a url'), false);
});

test('templateHasSearchTerms requires the literal token', () => {
  assert.equal(templateHasSearchTerms('https://x/?q={searchTerms}'), true);
  assert.equal(templateHasSearchTerms('https://x/?q=hello'), false);
});

test('capitalize upper-cases the first character only', () => {
  assert.equal(capitalize('copyPlain'), 'CopyPlain');
  assert.equal(capitalize(''), '');
});

test('errorMessage unwraps Error instances and stringifies anything else', () => {
  assert.equal(errorMessage(vm.runInContext('new Error("boom")', context)), 'boom');
  assert.equal(errorMessage('plain'), 'plain');
  assert.equal(errorMessage(42), '42');
});
