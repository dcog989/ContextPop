// Optional host-permission granting, kept separate from the storage layer. Only the
// options page loads this module; it reads the shared `api` global from storage.js, so
// storage.js must load first. var (not const) so a re-injected content script does not
// throw on redeclaration.

var HOST_ORIGINS = Object.freeze(['http://*/*', 'https://*/*']);

// Host access is revocable: Firefox MV3 host permissions are opt-in, and Chrome
// can withhold required hosts. Both browsers only allow request() from inside a
// user-gesture handler, so callers must invoke this from a click/keypress.
var requestHostAccess = async () => {
  if (!api.permissions?.request) return true;
  // Call request() before any await: an async boundary consumes the user
  // gesture, and Firefox rejects a request made without one.
  try {
    if (await api.permissions.request({ origins: HOST_ORIGINS })) return true;
  } catch {
    // Request unavailable or gesture lost; fall through to a status check.
  }
  try {
    return Boolean(await api.permissions.contains?.({ origins: HOST_ORIGINS }));
  } catch {
    return false;
  }
};
