// Favicon candidate discovery from fetched HTML markup. The background service worker
// has no document/DOMParser, so <link> tags are scanned with these regexes rather than a
// real HTML parser (unusual attribute quoting or malformed tags can be missed). DOM
// rendering lives in iconRender.js, which does run where a document exists.

var WELL_KNOWN_ICONS = [
  { path: '/favicon.svg', vector: true, size: 0 },
  { path: '/apple-touch-icon.png', vector: false, size: 180 },
  { path: '/favicon-32x32.png', vector: false, size: 32 },
  { path: '/favicon.ico', vector: false, size: 16 },
];
var ICON_RELATIONS = new Set(['icon', 'apple-touch-icon', 'apple-touch-icon-precomposed']);
var LINK_TAG_PATTERN = /<link\b[^>]*>/gi;
var ATTRIBUTE_PATTERN = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;

/**
 * @param {string} tag
 * @returns {Record<string, string>}
 */
function parseAttributes(tag) {
  /** @type {Record<string, string>} */
  const attributes = {};
  for (const match of tag.matchAll(ATTRIBUTE_PATTERN)) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return attributes;
}

/**
 * @param {Record<string, string>} attributes
 * @returns {number}
 */
function iconSize(attributes) {
  if ((attributes.sizes || '').trim().toLowerCase() === 'any') return Number.POSITIVE_INFINITY;
  let best = 0;
  for (const token of (attributes.sizes || '').split(/\s+/)) {
    const value = Number.parseInt(token.toLowerCase().split('x')[0], 10);
    if (Number.isFinite(value) && value > best) best = value;
  }
  if (!best && (attributes.rel || '').toLowerCase().includes('apple-touch-icon')) best = 180;
  return best;
}

/**
 * @param {Record<string, string>} attributes
 * @param {string} href
 * @returns {boolean}
 */
function isVectorIcon(attributes, href) {
  return (attributes.type || '').toLowerCase() === 'image/svg+xml' || /\.svg($|[?#])/i.test(href);
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
  for (const match of markup.matchAll(LINK_TAG_PATTERN)) {
    const attributes = parseAttributes(match[0]);
    const relations = (attributes.rel || '').toLowerCase().split(/\s+/);
    if (attributes.href && relations.some((relation) => ICON_RELATIONS.has(relation))) {
      try {
        const url = new URL(attributes.href, baseUrl).href;
        if (!seen.has(url)) {
          seen.add(url);
          candidates.push({
            url,
            vector: isVectorIcon(attributes, attributes.href),
            size: iconSize(attributes),
          });
        }
      } catch {
        // Ignore icons with unresolvable hrefs.
      }
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
  for (const match of markup.matchAll(LINK_TAG_PATTERN)) {
    const attributes = parseAttributes(match[0]);
    const relations = (attributes.rel || '').toLowerCase().split(/\s+/);
    if (attributes.href && relations.includes('manifest')) {
      try {
        return new URL(attributes.href, baseUrl).href;
      } catch {
        return '';
      }
    }
  }
  return '';
}
