// Engine favicon cache: an in-memory Map backed by api.storage.local, so resolved icons
// survive the background worker being suspended. Storage failures are non-fatal - the
// in-memory layer keeps working for the current worker lifetime.

var ICON_CACHE_PREFIX = 'icon:';
/** @type {Map<string, string | null>} */
var iconMemoryCache = new Map();

/**
 * @param {string} key
 * @returns {Promise<string | null | undefined>}
 */
async function readIconCache(key) {
  if (iconMemoryCache.has(key)) return iconMemoryCache.get(key);
  try {
    const storageKey = ICON_CACHE_PREFIX + key;
    const stored = await api.storage.local.get(storageKey);
    if (stored[storageKey] !== undefined) {
      iconMemoryCache.set(key, stored[storageKey]);
      return stored[storageKey];
    }
  } catch {
    // Storage read failed; fall back to memory-only caching.
  }
  return undefined;
}

/**
 * @param {string} key
 * @param {string | null} dataUrl
 * @returns {Promise<void>}
 */
async function writeIconCache(key, dataUrl) {
  iconMemoryCache.set(key, dataUrl);
  try {
    await api.storage.local.set({ [ICON_CACHE_PREFIX + key]: dataUrl });
  } catch {
    // Non-fatal: the in-memory cache still holds the value for this worker lifetime.
  }
}

/**
 * @param {string} key
 */
function markIconUnavailable(key) {
  iconMemoryCache.set(key, null);
}

/**
 * @returns {Promise<string[]>}
 */
async function iconCacheKeys() {
  const area = api.storage.local;
  if (typeof area.getKeys === 'function') {
    return /** @type {string[]} */ (await area.getKeys()).filter((key) => key.startsWith(ICON_CACHE_PREFIX));
  }
  const all = await area.get(null);
  return Object.keys(all).filter((key) => key.startsWith(ICON_CACHE_PREFIX));
}

/**
 * @param {Set<string>} referencedKeys
 * @returns {Promise<void>}
 */
async function pruneIconCache(referencedKeys) {
  try {
    const keys = await iconCacheKeys();
    const stale = keys.filter((key) => !referencedKeys.has(key.slice(ICON_CACHE_PREFIX.length)));
    if (stale.length) await api.storage.local.remove(stale);
  } catch {
    // Non-fatal: stale entries linger until the next prune.
  }
}

async function clearIconCache() {
  iconMemoryCache.clear();
  try {
    const keys = await iconCacheKeys();
    if (keys.length) await api.storage.local.remove(keys);
  } catch {
    // Non-fatal: a failed clear just means the next fetch reuses a cached value.
  }
}
