// Background entry: message routing and lifecycle listeners. The tab/window/search
// opening logic lives in opener.js, which loads first.

/**
 * @param {Message} message
 * @param {any} sender
 * @returns {Promise<MessageResultMap[MessageType]>}
 */
async function handleMessage(message, sender) {
  switch (message.type) {
    case 'getEngines':
      return filterUsableEngines(await loadEngines());
    case 'getSettings':
      return loadSettings();
    case 'getIcons': {
      const engines = await loadEngines();
      const icons = await cachedIconMap(engines);
      // Warm the cache off the response path so a slow or offline host never delays
      // rendering; de-duped, so concurrent opens share the same fetches.
      resolveIconMap(engines).catch((error) => console.error('ContextPop: icon warm-up failed', error));
      return icons;
    }
    case 'resolveIcons': {
      const engines = await loadEngines();
      return resolveIconMap(engines);
    }
    case 'refreshIcons': {
      const engines = await loadEngines();
      await clearIconCache();
      return resolveIconMap(engines);
    }
    case 'search': {
      const engines = await loadEngines();
      const engine = engines.find((item) => item.id === message.engineId);
      if (!engine) throw new Error(`Unknown search engine: ${message.engineId}`);
      await openSearch({ engine, terms: message.terms, method: message.method }, sender);
      return { ok: true };
    }
    case 'openLink':
      await openLink({ url: message.url, method: message.method }, sender);
      return { ok: true };
    case 'openReference':
      await openReference({ actionId: message.actionId, terms: message.terms }, sender);
      return { ok: true };
    default:
      throw new Error(`Unknown message type: ${/** @type {any} */ (message).type}`);
  }
}

api.runtime.onInstalled.addListener((/** @type {any} */ details) => {
  // Send first-time installs to the options page so the onboarding callout is seen.
  if (details?.reason === 'install') api.runtime.openOptionsPage();
});

// Firefox MV3 only persists an event page's listeners after it has run once. A
// listener here forces that run every browser session, otherwise the first
// action click that wakes the suspended page is dropped and the options page
// does not open until a second click.
api.runtime.onStartup.addListener(() => {});

// Keep this handler synchronous: an awaited permission/storage call before or after
// openOptionsPage() loses the click on a waking event page, so the first press is
// dropped. Host access is granted at install; the options page requests it from a click
// when the user refreshes icons.
api.action.onClicked.addListener(() => {
  api.runtime.openOptionsPage();
});

api.runtime.onMessage.addListener(
  (/** @type {any} */ message, /** @type {any} */ sender, /** @type {(response?: any) => void} */ sendResponse) => {
    handleMessage(message, sender)
      .then((data) => sendResponse({ data }))
      .catch((error) => sendResponse({ error: errorMessage(error) }));
    return true;
  },
);
