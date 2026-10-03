// Favicon candidate discovery from fetched HTML markup. The Firefox MV3 background runs as
// an event page with a real DOM, so <link> tags are parsed with DOMParser — correct quoting
// and case-insensitive relation matching — instead of hand-rolled regexes. DOM rendering
// lives in iconRender.js, which runs where a document exists.

var WELL_KNOWN_ICONS = [
  { path: '/favicon.svg', vector: true, size: 0 },
  { path: '/apple-touch-icon.png', vector: false, size: 180 },
  { path: '/favicon-32x32.png', vector: false, size: 32 },
  { path: '/favicon.ico', vector: false, size: 16 },
];
var ICON_LINK_SELECTOR = 'link[rel~="icon" i], link[rel~="apple-touch-icon" i], link[rel~="apple-touch-icon-precomposed" i]';
var MANIFEST_LINK_SELECTOR = 'link[rel~="manifest" i]';

/**
 * @param {string | null} sizes
 * @param {string | null} [rel]
 * @returns {number}
 */
function iconSize(sizes, rel) {
  const value = (sizes || '').trim().toLowerCase();
  if (value === 'any') return Number.POSITIVE_INFINITY;
  let best = 0;
  for (const token of value.split(/\s+/)) {
    const parsed = Number.parseInt(token.split('x')[0], 10);
    if (Number.isFinite(parsed) && parsed > best) best = parsed;
  }
  if (!best && (rel || '').toLowerCase().includes('apple-touch-icon')) best = 180;
  return best;
}

/**
 * @param {string | null} type
 * @param {string} href
 * @returns {boolean}
 */
function isVectorIcon(type, href) {
  return (type || '').toLowerCase() === 'image/svg+xml' || /\.svg($|[?#])/i.test(href);
}

/**
 * @param {string} markup
 * @returns {Document}
 */
function parseIconDocument(markup) {
  return new DOMParser().parseFromString(markup, 'text/html');
}

/**
 * @param {string} markup
 * @param {string} baseUrl
 * @returns {IconCandidate[]}
 */
function iconCandidates(markup, baseUrl) {
  /** @type {IconCandidate[]} */
  const candidates = [];
  const seen = new Set();
  for (const link of parseIconDocument(markup).querySelectorAll(ICON_LINK_SELECTOR)) {
    const href = link.getAttribute('href');
    if (!href) continue;
    try {
      const url = new URL(href, baseUrl).href;
      if (seen.has(url)) continue;
      seen.add(url);
      candidates.push({
        url,
        vector: isVectorIcon(link.getAttribute('type'), href),
        size: iconSize(link.getAttribute('sizes'), link.getAttribute('rel')),
      });
    } catch {
      // Ignore icons with unresolvable hrefs.
    }
  }
  return candidates;
}

/**
 * @param {string} markup
 * @param {string} baseUrl
 * @returns {string}
 */
function findManifestUrl(markup, baseUrl) {
  for (const link of parseIconDocument(markup).querySelectorAll(MANIFEST_LINK_SELECTOR)) {
    const href = link.getAttribute('href');
    if (!href) continue;
    try {
      return new URL(href, baseUrl).href;
    } catch {
      return '';
    }
  }
  return '';
}
