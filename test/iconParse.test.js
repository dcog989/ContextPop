const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/loadScripts');

const { iconSize, isVectorIcon } = loadScripts(['iconParse.js']);

test('iconSize takes the largest declared size and treats "any" as unbounded', () => {
  assert.equal(iconSize('32x32'), 32);
  assert.equal(iconSize('16x16 32x32'), 32);
  assert.equal(iconSize('any'), Infinity);
  assert.equal(iconSize(null), 0);
  assert.equal(iconSize('', 'icon'), 0);
});

test('iconSize falls back to 180 for apple-touch-icon without a size', () => {
  assert.equal(iconSize('', 'apple-touch-icon'), 180);
  assert.equal(iconSize('', 'apple-touch-icon-precomposed'), 180);
});

test('isVectorIcon detects SVG by declared type or file extension', () => {
  assert.equal(isVectorIcon('image/svg+xml', '/a.png'), true);
  assert.equal(isVectorIcon(null, '/a.svg'), true);
  assert.equal(isVectorIcon(null, '/a.svg?v=1'), true);
  assert.equal(isVectorIcon('image/png', '/a.ico'), false);
  assert.equal(isVectorIcon(null, '/a-svg.png'), false);
});
