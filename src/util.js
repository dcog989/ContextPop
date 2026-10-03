// var (not const) throughout this file: top-level bindings are shared, bare-name globals
// across sibling content-script files, and must tolerate re-injection into the same
// document without throwing a SyntaxError on redeclaration.

// Final-label TLDs accepted for scheme-less selections (e.g. "donkeys.org"). Curated
// common generic and country-code names, not the full IANA registry.
var KNOWN_TLDS = new Set([
  'com',
  'org',
  'net',
  'edu',
  'gov',
  'mil',
  'int',
  'info',
  'biz',
  'name',
  'pro',
  'io',
  'ai',
  'app',
  'dev',
  'co',
  'me',
  'tv',
  'cc',
  'xyz',
  'online',
  'site',
  'store',
  'shop',
  'tech',
  'cloud',
  'blog',
  'wiki',
  'news',
  'media',
  'digital',
  'design',
  'email',
  'live',
  'life',
  'world',
  'today',
  'space',
  'fun',
  'website',
  'press',
  'studio',
  'agency',
  'group',
  'network',
  'solutions',
  'services',
  'software',
  'systems',
  'academy',
  'school',
  'institute',
  'foundation',
  'health',
  'care',
  'finance',
  'legal',
  'marketing',
  'social',
  'video',
  'photo',
  'art',
  'music',
  'games',
  'club',
  'team',
  'company',
  'uk',
  'us',
  'ca',
  'au',
  'nz',
  'ie',
  'de',
  'fr',
  'es',
  'pt',
  'it',
  'nl',
  'be',
  'lu',
  'ch',
  'at',
  'dk',
  'se',
  'no',
  'fi',
  'is',
  'pl',
  'cz',
  'sk',
  'hu',
  'ro',
  'bg',
  'gr',
  'hr',
  'rs',
  'si',
  'ee',
  'lv',
  'lt',
  'ua',
  'ru',
  'by',
  'tr',
  'il',
  'ae',
  'sa',
  'za',
  'ng',
  'ke',
  'eg',
  'ma',
  'in',
  'pk',
  'bd',
  'lk',
  'th',
  'vn',
  'sg',
  'my',
  'id',
  'ph',
  'tw',
  'hk',
  'cn',
  'jp',
  'kr',
  'br',
  'ar',
  'cl',
  'pe',
  'mx',
  've',
  'uy',
  'py',
  'bo',
  'ec',
  'cr',
  'pa',
]);

// Scheme-less URL shape: dotted host labels, optional port and path/query/fragment,
// with no whitespace or userinfo.
var BARE_URL_PATTERN = /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}(?::\d{1,5})?(?:[/?#]\S*)?$/i;

// TLDs that double as common file extensions or words ("main.py", "lib.rs",
// "script.pl", "index.js", "readme.md"). For these, require an explicit scheme or a
// "www." prefix so file names are not mistaken for URLs.
var AMBIGUOUS_TLDS = new Set(['py', 'rs', 'pl', 'cc', 'ai', 'is', 'in', 'md', 'sh', 'js', 'ts']);

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
 * @param {string} terms
 * @returns {string}
 */
function buildSearchUrl(template, terms) {
  return String(template).replace(/\{searchTerms\}/g, encodeURIComponent(terms));
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

/**
 * @param {string} value
 * @returns {boolean}
 */
function looksLikeUrl(value) {
  const candidate = String(value).trim();
  if (!candidate || /\s/.test(candidate) || candidate.includes('@')) return false;
  if (!BARE_URL_PATTERN.test(candidate)) return false;
  const host = candidate.split(/[/?#]/, 1)[0].split(':')[0];
  const tld = host.slice(host.lastIndexOf('.') + 1).toLowerCase();
  if (!KNOWN_TLDS.has(tld)) return false;
  if (AMBIGUOUS_TLDS.has(tld) && !/^www\./i.test(host)) return false;
  return true;
}

/**
 * Defaults a scheme-less URL to https, returning an empty string for anything
 * that does not resolve to a usable http(s) URL.
 * @param {string} value
 * @returns {string}
 */
function normalizeHttpUrl(value) {
  const candidate = String(value).trim();
  if (isHttpUrl(candidate)) return candidate;
  if (!looksLikeUrl(candidate)) return '';
  const withScheme = `https://${candidate}`;
  return isHttpUrl(withScheme) ? withScheme : '';
}

/**
 * @param {string} template
 * @returns {boolean}
 */
function templateHasSearchTerms(template) {
  return template.includes('{searchTerms}');
}
