const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadScripts } = require('./helpers/loadScripts');

const context = loadScripts(['util.js']);
const { buildSearchUrl, isHttpUrl, looksLikeUrl, normalizeHttpUrl, templateHasSearchTerms, capitalize, errorMessage } =
  context;

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

test('looksLikeUrl recognizes scheme-less hosts with a known TLD', () => {
  assert.equal(looksLikeUrl('donkeys.org'), true);
  assert.equal(looksLikeUrl('fishing.net/trout'), true);
  assert.equal(looksLikeUrl('www.example.co.uk/path?q=1'), true);
  assert.equal(looksLikeUrl('example.com:8080'), true);
});

test('looksLikeUrl rejects non-URLs and unknown TLDs', () => {
  assert.equal(looksLikeUrl(''), false);
  assert.equal(looksLikeUrl('not a url'), false);
  assert.equal(looksLikeUrl('file.txt'), false);
  assert.equal(looksLikeUrl('user@example.com'), false);
  assert.equal(looksLikeUrl('https://example.com'), false);
});

test('normalizeHttpUrl defaults scheme-less URLs to https and passes through http(s)', () => {
  assert.equal(normalizeHttpUrl('donkeys.org'), 'https://donkeys.org');
  assert.equal(normalizeHttpUrl('fishing.net/trout'), 'https://fishing.net/trout');
  assert.equal(normalizeHttpUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeHttpUrl('not a url'), '');
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
