// Favicon orchestration: turn a list of engines into an {engineId: dataUrl} map, choosing
// between cached entries, custom icon URLs, and site-declared icons. Depends on the
// iconSource/iconParse/iconFetch/iconCache modules, which must be loaded before this file.

/**
 * @param {IconCandidate[]} candidates
 * @returns {IconCandidate[]}
 */
function rankCandidates(candidates) {
  const seen = new Set();
  /** @type {IconCandidate[]} */
  const unique = [];
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  unique.sort((a, b) => (a.vector === b.vector ? b.size - a.size : a.vector ? -1 : 1));
  return unique;
}

/**
 * @param {string} homeUrl
 * @returns {Promise<FetchResult>}
 */
async function fetchBestIcon(homeUrl) {
  const { markup, baseUrl, definitive: markupDefinitive } = await fetchMarkup(homeUrl);
  const candidates = markup ? iconCandidates(markup, baseUrl) : [];

  if (markup && !candidates.some((candidate) => candidate.vector)) {
    const manifestUrl = findManifestUrl(markup, baseUrl) || new URL('/manifest.json', homeUrl).href;
    candidates.push(...(await fetchManifestIcons(manifestUrl)));
  }

  for (const icon of WELL_KNOWN_ICONS) {
    try {
      candidates.push({ url: new URL(icon.path, homeUrl).href, vector: icon.vector, size: icon.size });
    } catch {
      // Ignore malformed home URLs.
    }
  }

  let definitive = markupDefinitive;
  for (const candidate of rankCandidates(candidates)) {
    const result = await fetchImage(candidate.url);
    if (result.dataUrl) return result;
    if (!result.definitive) definitive = false;
  }
  return { dataUrl: null, definitive: definitive && candidates.length > 0 };
}

/** @type {Map<string, Promise<{ dataUrl: string | null, fetched: boolean }>>} */
var iconInflight = new Map();

/**
 * @param {IconSource} source
 * @returns {Promise<{ dataUrl: string | null, fetched: boolean }>}
 */
async function resolveEngineIconBySource(source) {
  if (source.key.startsWith('data:')) return { dataUrl: source.key, fetched: false };

  const cached = await readIconCache(source.key);
  if (cached !== undefined) return { dataUrl: cached, fetched: false };

  const result = source.kind === 'markup' ? await fetchBestIcon(source.key) : await fetchImage(source.key);
  if (result.dataUrl || result.definitive) await writeIconCache(source.key, result.dataUrl);
  else markIconUnavailable(source.key);
  return { dataUrl: result.dataUrl, fetched: true };
}

/**
 * Resolves one icon source, sharing the in-flight promise across concurrent callers so a
 * given host is never fetched twice (e.g. menu open racing the background warm-up).
 * @param {IconSource} source
 * @returns {Promise<{ dataUrl: string | null, fetched: boolean }>}
 */
function resolveEngineIcon(source) {
  const inflight = iconInflight.get(source.key);
  if (inflight) return inflight;
  const pending = resolveEngineIconBySource(source).finally(() => {
    if (iconInflight.get(source.key) === pending) iconInflight.delete(source.key);
  });
  iconInflight.set(source.key, pending);
  return pending;
}

/**
 * Cache-only icon map for rendering paths that must stay instant. Never touches the
 * network; unresolved engines simply fall back to their letter tile.
 * @param {Engine[]} engines
 * @returns {Promise<Record<string, string>>}
 */
async function cachedIconMap(engines) {
  /** @type {Record<string, string>} */
  const icons = {};
  await Promise.all(
    engines.map(async (engine) => {
      const source = engineIconSource(engine);
      if (!source) return;
      if (source.key.startsWith('data:')) {
        icons[engine.id] = source.key;
        return;
      }
      const cached = await readIconCache(source.key);
      if (typeof cached === 'string' && cached) icons[engine.id] = cached;
    }),
  );
  return icons;
}

/**
 * Resolves every engine's icon over the network, writing results (including definitive
 * misses) to the cache, then prunes entries no longer referenced.
 * @param {Engine[]} engines
 * @returns {Promise<Record<string, string>>}
 */
async function resolveIconMap(engines) {
  /** @type {Record<string, string>} */
  const icons = {};
  /** @type {Set<string>} */
  const referenced = new Set();
  for (const engine of engines) {
    const source = engineIconSource(engine);
    if (source) referenced.add(source.key);
  }
  await Promise.all(
    engines.map(async (engine) => {
      const source = engineIconSource(engine);
      if (!source) return;
      const { dataUrl } = await resolveEngineIcon(source);
      if (dataUrl) icons[engine.id] = dataUrl;
    }),
  );
  await pruneIconCache(referenced);
  return icons;
}
