// Client-side runtime messaging: sends a message to the background and unwraps the
// `{ data } | { error }` envelope so callers only handle the success payload. Unwrapped
// bare globals shared with sibling content-script files.

/**
 * Sends a message and unwraps the `{ data } | { error }` envelope, throwing on failure.
 * Non-generic so the typed wrappers below never make a nested generic call, which defeats
 * `K` inference from `Message & { type: K }`.
 * @param {Message} message
 * @returns {Promise<any>}
 */
function requestData(message) {
  const runtime = globalThis.browser;
  return runtime.runtime.sendMessage(message).then(
    /** @param {MessageResponse<any>} [response] */ (response) => {
      if (response && 'error' in response) throw new Error(response.error);
      return response?.data;
    },
  );
}

/**
 * Sends a background message, throwing on failure so callers only handle the success
 * payload.
 * @template {MessageType} K
 * @param {Message & { type: K }} message
 * @returns {Promise<MessageResultMap[K]>}
 */
function sendMessage(message) {
  return requestData(message);
}

/**
 * Like `sendMessage`, but normalizes a missing payload to `{}` instead of `undefined`.
 * @template {MessageType} K
 * @param {Message & { type: K }} message
 * @returns {Promise<MessageResultMap[K]>}
 */
function sendMessageOrEmpty(message) {
  return requestData(message).then(
    /** @param {MessageResultMap[K]} data */
    (data) => data || /** @type {MessageResultMap[K]} */ ({}),
  );
}
