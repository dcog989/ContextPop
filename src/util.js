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

function generateId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return `engine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * @param {unknown} error
 * @returns {string}
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Sends a background message and unwraps the `{ data } | { error }` envelope,
 * throwing on failure so callers only handle the success payload.
 * @template {MessageType} K
 * @param {Message & { type: K }} message
 * @returns {Promise<MessageResultMap[K]>}
 */
function sendMessage(message) {
  const runtime = globalThis.browser ?? globalThis.chrome;
  return runtime.runtime.sendMessage(message).then(
    /** @param {MessageResponse<MessageResultMap[K]>} [response] */ (response) => {
      if (response && 'error' in response) throw new Error(response.error);
      return /** @type {MessageResultMap[K]} */ (response?.data);
    },
  );
}

/**
 * @param {string} value
 * @returns {string}
 */
function capitalize(value) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  return KNOWN_TLDS.has(tld);
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
