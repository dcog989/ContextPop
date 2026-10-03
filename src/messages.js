// Client-side runtime messaging: sends a message to the background and unwraps the
// `{ data } | { error }` envelope so callers only handle the success payload. Unwrapped
// bare globals shared with sibling content-script files.

/**
 * Sends a background message and unwraps the `{ data } | { error }` envelope,
 * throwing on failure so callers only handle the success payload.
 * @template {MessageType} K
 * @param {MessageMap[K]} message
 * @returns {Promise<MessageResultMap[K]>}
 */
function sendMessage(message) {
  const runtime = globalThis.browser;
  return runtime.runtime.sendMessage(message).then(
    /** @param {MessageResponse<MessageResultMap[K]>} [response] */ (response) => {
      if (response && 'error' in response) throw new Error(response.error);
      return /** @type {MessageResultMap[K]} */ (response?.data);
    },
  );
}

/**
 * Like `sendMessage`, but normalizes a missing payload to `{}` instead of `undefined`.
 * @template {MessageType} K
 * @param {MessageMap[K]} message
 * @returns {Promise<MessageResultMap[K]>}
 */
function sendMessageOrEmpty(message) {
  return sendMessage(message).then(
    /** @param {MessageResultMap[K]} data */
    (data) => data || /** @type {MessageResultMap[K]} */ ({}),
  );
}
