// var (not const) throughout this file: top-level bindings are shared, bare-name globals
// across sibling content-script files, and must tolerate re-injection into the same
// document without throwing a SyntaxError on redeclaration.

function generateId() {
  return globalThis.crypto.randomUUID();
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * @param {string} value
 * @returns {string}
 */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Rounds `value` to an integer and clamps it to [min, max], returning `fallback` when it
 * is not a finite number.
 * @param {unknown} value
 * @param {number} min
 * @param {number} max
 * @param {number} fallback
 * @returns {number}
 */
function clampInt(value, min, max, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? clamp(Math.round(number), min, max) : fallback;
}

/**
 * Returns `value` when it is one of `allowed`, otherwise `fallback`.
 * @template T
 * @param {unknown} value
 * @param {readonly T[]} allowed
 * @param {T} fallback
 * @returns {T}
 */
function pickEnum(value, allowed, fallback) {
  return allowed.includes(/** @type {T} */ (value)) ? /** @type {T} */ (value) : fallback;
}

/**
 * Freezes a named-value lookup into a runtime enum. Pairs with `pickEnum` for
 * validation; the caller's JSDoc annotation narrows the returned property types.
 * @template {Record<string, string>} T
 * @param {T} values
 * @returns {Readonly<T>}
 */
function defineEnum(values) {
  return Object.freeze(values);
}

/**
 * Template-validation failure codes, shared by the options page and the background.
 * @type {Readonly<{ ok: string, missingTerms: string, scheme: string }>}
 */
var TEMPLATE_PROBLEM = defineEnum({ ok: 'ok', missingTerms: 'missingTerms', scheme: 'scheme' });

/**
 * Classifies a search URL template. Returns `TEMPLATE_PROBLEM.ok` when valid,
 * otherwise the first failing code: a missing `{searchTerms}` token or a non-http(s) scheme.
 * @param {string} template
 * @returns {string}
 */
function templateProblem(template) {
  if (!templateHasSearchTerms(template)) return TEMPLATE_PROBLEM.missingTerms;
  if (!isHttpUrl(template)) return TEMPLATE_PROBLEM.scheme;
  return TEMPLATE_PROBLEM.ok;
}

/**
 * @param {string} template
 * @returns {boolean}
 */
function templateHasSearchTerms(template) {
  return template.includes('{searchTerms}');
}
