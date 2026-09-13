// Favicon orchestration: turn a list of engines into an {engineId: dataUrl} map, choosing
// between cached entries, custom icon URLs, and site-declared icons. Depends on the
// iconSource/iconParse/iconFetch/iconCache modules, which must be loaded before this file.

function rankCandidates(candidates) {
  const seen = new Set();
  const unique = [];
  for (const candidate of candidates) {
    if (!candidate.url || seen.has(candidate.url)) continue;
    seen.add(candidate.url);
    unique.push(candidate);
  }
  unique.sort((a, b) => (a.vector === b.vector ? b.size - a.size : a.vector ? -1 : 1));
  return unique;
}

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

async function resolveEngineIcon(engine) {
  const source = engineIconSource(engine);
  if (!source) return { dataUrl: null, fetched: false };
  if (source.key.startsWith('data:')) return { dataUrl: source.key, fetched: false };

  const cached = await readIconCache(source.key);
  if (cached !== undefined) return { dataUrl: cached, fetched: false };

  const result = source.kind === 'markup' ? await fetchBestIcon(source.key) : await fetchImage(source.key);
  if (result.dataUrl || result.definitive) await writeIconCache(source.key, result.dataUrl);
  else markIconUnavailable(source.key);
  return { dataUrl: result.dataUrl, fetched: true };
}

async function loadIconMap(engines) {
  const icons = {};
  const referenced = new Set();
  for (const engine of engines) {
    const source = engineIconSource(engine);
    if (source) referenced.add(source.key);
  }
  const outcomes = await Promise.all(
    engines.map(async (engine) => {
      const { dataUrl, fetched } = await resolveEngineIcon(engine);
      if (dataUrl) icons[engine.id] = dataUrl;
      return fetched;
    }),
  );
  if (outcomes.some(Boolean)) await pruneIconCache(referenced);
  return icons;
}
