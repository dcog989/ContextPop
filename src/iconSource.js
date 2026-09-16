// Engine favicon source resolution: decide which page/markup an engine's icon should be
// fetched from. Pure - no storage, network, or DOM - and shared with the orchestrator in
// icons.js.

// var (not const) throughout the icon modules: top-level bindings are shared, bare-name
// globals across sibling content-script files, and must tolerate re-injection into the
// same document without throwing a SyntaxError on redeclaration.

// Best-effort mapping from browser search-engine display names to their
// host, used only to fetch a favicon for browser-native engines. Not
// exhaustive - engines not listed here (and not shaped like a domain) get
// no icon, just the fallback letter. Expect this to go stale as browsers
// add/rename default engines; update opportunistically, not proactively.
/** @type {Record<string, string>} */
var KNOWN_ENGINE_HOSTS = Object.freeze({
  google: 'www.google.com',
  duckduckgo: 'duckduckgo.com',
  bing: 'www.bing.com',
  wikipedia: 'en.wikipedia.org',
  wiktionary: 'en.wiktionary.org',
  amazon: 'www.amazon.com',
  ebay: 'www.ebay.com',
  ecosia: 'www.ecosia.org',
  qwant: 'www.qwant.com',
  startpage: 'www.startpage.com',
  brave: 'search.brave.com',
  'brave search': 'search.brave.com',
  yahoo: 'search.yahoo.com',
  yandex: 'yandex.com',
  baidu: 'www.baidu.com',
  mojeek: 'www.mojeek.com',
  searx: 'searx.be',
  youtube: 'www.youtube.com',
  'cambridge dictionary': 'dictionary.cambridge.org',
  cambridge: 'dictionary.cambridge.org',
  thesaurus: 'www.thesaurus.com',
  dictionary: 'www.dictionary.com',
  'merriam-webster': 'www.merriam-webster.com',
  'merriam webster': 'www.merriam-webster.com',
  imdb: 'www.imdb.com',
  github: 'github.com',
  reddit: 'www.reddit.com',
  stackoverflow: 'stackoverflow.com',
  'stack overflow': 'stackoverflow.com',
});

var DOMAIN_ENGINE_NAME_PATTERN = /^[a-z0-9-]+(\.[a-z0-9-]+)+$/;

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
function normalizeEngineName(name) {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * @param {string | null | undefined} name
 * @returns {string}
 */
function browserEngineHost(name) {
  const raw = String(name ?? '').trim();
  const wikipedia = raw.match(/^wikipedia\s*\(([a-z-]+)\)/i);
  if (wikipedia) return `${wikipedia[1].toLowerCase()}.wikipedia.org`;
  const normalized = normalizeEngineName(raw);
  if (DOMAIN_ENGINE_NAME_PATTERN.test(normalized)) return normalized;
  return KNOWN_ENGINE_HOSTS[normalized] || '';
}

/**
 * @param {string} template
 * @returns {string}
 */
function templateHost(template) {
  try {
    return new URL(String(template).replace(/\{searchTerms\}/g, 'x')).host;
  } catch {
    return '';
  }
}

/**
 * @param {Engine} engine
 * @returns {IconSource | null}
 */
function engineIconSource(engine) {
  const hasIcon = typeof engine.icon === 'string' && engine.icon.length > 0;
  if (engine.source === 'browser') {
    if (hasIcon && HTTP_URL_PATTERN.test(engine.icon)) return { key: engine.icon, kind: 'image' };
    const host = browserEngineHost(engine.name);
    if (host) return { key: `https://${host}/`, kind: 'markup' };
    if (hasIcon) return { key: engine.icon, kind: 'image' };
    return null;
  }
  if (hasIcon) return { key: engine.icon, kind: 'image' };
  const host = templateHost(engine.template);
  if (!host) return null;
  return { key: `https://${host}/`, kind: 'markup' };
}
