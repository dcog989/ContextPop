const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/loadScripts');

const context = loadScripts(['url.js']);
const { buildSearchUrl, isHttpUrl, looksLikeUrl, normalizeHttpUrl } = context;

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

test('looksLikeUrl does not treat file names with ambiguous TLDs as URLs', () => {
  assert.equal(looksLikeUrl('main.py'), false);
  assert.equal(looksLikeUrl('lib.rs'), false);
  assert.equal(looksLikeUrl('script.pl'), false);
  assert.equal(looksLikeUrl('index.js'), false);
  assert.equal(looksLikeUrl('readme.md'), false);
  assert.equal(looksLikeUrl('www.donkeys.ai'), true);
  assert.equal(looksLikeUrl('donkeys.ai/path'), true);
});

test('normalizeHttpUrl defaults scheme-less URLs to https and passes through http(s)', () => {
  assert.equal(normalizeHttpUrl('donkeys.org'), 'https://donkeys.org');
  assert.equal(normalizeHttpUrl('fishing.net/trout'), 'https://fishing.net/trout');
  assert.equal(normalizeHttpUrl('http://example.com'), 'http://example.com');
  assert.equal(normalizeHttpUrl('not a url'), '');
});
