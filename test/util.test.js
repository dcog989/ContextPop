const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { loadScripts } = require('./helpers/loadScripts');

const context = loadScripts(['url.js', 'util.js']);
const { templateHasSearchTerms, templateProblem, TEMPLATE_PROBLEM, capitalize, errorMessage } = context;

test('templateHasSearchTerms requires the literal token', () => {
  assert.equal(templateHasSearchTerms('https://x/?q={searchTerms}'), true);
  assert.equal(templateHasSearchTerms('https://x/?q=hello'), false);
});

test('templateProblem classifies valid, missing-terms, and scheme failures', () => {
  assert.equal(templateProblem('https://x/?q={searchTerms}'), TEMPLATE_PROBLEM.ok);
  assert.equal(templateProblem('https://x/?q=hello'), TEMPLATE_PROBLEM.missingTerms);
  assert.equal(templateProblem('ftp://x/?q={searchTerms}'), TEMPLATE_PROBLEM.scheme);
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
