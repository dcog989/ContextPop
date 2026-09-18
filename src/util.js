// var (not const) throughout this file: top-level bindings are shared, bare-name globals
// across sibling content-script files, and must tolerate re-injection into the same
// document without throwing a SyntaxError on redeclaration.

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
 * @param {string} template
 * @returns {boolean}
 */
function templateHasSearchTerms(template) {
  return template.includes('{searchTerms}');
}
