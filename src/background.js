// Chrome loads only this file as a service worker; Firefox lists the scripts in the manifest.
if (typeof DEFAULT_ENGINES === 'undefined' && typeof importScripts === 'function') {
  importScripts(
    'util.js',
    'actions.js',
    'defaultEngines.js',
    'storage.js',
    'iconSource.js',
    'iconParse.js',
    'iconCache.js',
    'iconFetch.js',
    'icons.js',
  );
}

const OPEN_METHODS = Object.freeze(['newTab', 'backgroundTab', 'currentTab', 'newWindow']);
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;

/** @type {Record<string, string>} */
const DISPOSITIONS = Object.freeze({
  newTab: 'NEW_TAB',
  currentTab: 'CURRENT_TAB',
  newWindow: 'NEW_WINDOW',
});

async function seedStorage() {
  await loadEngines();

  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  if (!result[STORAGE_KEYS.settings]) await saveSettings(defaultSettings());
}

/**
 * @param {string} method
 * @param {any} sender
 * @returns {string}
 */
function resolveOpenMethod(method, sender) {
  let resolved = OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod;
  if (resolved === 'currentTab' && sender?.tab?.id == null) resolved = 'newTab';
  return resolved;
}

/**
 * @param {string} method
 * @returns {string}
 */
function dispositionFor(method) {
  return DISPOSITIONS[method] ?? DISPOSITIONS.newTab;
}

/**
 * @param {string} url
 * @param {string} method
 * @param {any} sender
 * @returns {Promise<void>}
 */
async function openUrl(url, method, sender) {
  const openMethod = resolveOpenMethod(method, sender);
  const openerTabId = sender?.tab?.id;

  switch (openMethod) {
    case 'currentTab':
      await api.tabs.update(openerTabId, { url });
      break;
    case 'backgroundTab':
      await api.tabs.create({ url, active: false, openerTabId });
      break;
    case 'newWindow':
      await api.windows.create({ url });
      break;
    default:
      await api.tabs.create({ url, active: true, openerTabId });
      break;
  }
}

/**
 * @param {Engine} engine
 * @param {string} query
 * @param {string} openMethod
 * @param {any} sender
 * @returns {Promise<void>}
 */
async function openBrowserSearch(engine, query, openMethod, sender) {
  if (openMethod === 'backgroundTab') {
    // The search API has no unfocused disposition, so open a background tab
    // and have the search run in it via tabId. The tab never takes focus,
    // matching template engines' tabs.create({ active: false }).
    const tab = await api.tabs.create({ active: false, openerTabId: sender?.tab?.id });
    try {
      await api.search.search({ engine: engine.browserEngineName, query, tabId: tab.id });
    } catch (error) {
      await api.tabs
        .remove(tab.id)
        .catch((removeError) => console.error('ContextPop: failed to close orphaned search tab', removeError));
      throw error;
    }
    return;
  }
  await api.search.search({ engine: engine.browserEngineName, query, disposition: dispositionFor(openMethod) });
}

/**
 * @param {string} value
 * @param {string} label
 */
function assertTemplate(value, label) {
  if (!templateHasSearchTerms(value)) throw new Error(`${label} template is missing {searchTerms}`);
  if (!HTTP_URL_PATTERN.test(value)) throw new Error(`${label} template must use http or https`);
}

/**
 * @param {{ engine: Engine, terms: string, method: string }} message
 * @param {any} sender
 * @returns {Promise<void>}
 */
async function openSearch({ engine, terms, method }, sender) {
  const query = String(terms ?? '');

  if (engine.source === 'browser') {
    if (!supportsBrowserEngineSearch()) throw new Error('Browser engine search is unavailable');
    await openBrowserSearch(engine, query, resolveOpenMethod(method, sender), sender);
    return;
  }

  assertTemplate(engine.template, 'Engine');
  const url = buildSearchUrl(engine.template, query);
  await openUrl(url, method, sender);
}

/**
 * @param {{ template: string, terms: string }} message
 * @returns {Promise<void>}
 */
async function openReference({ template, terms }) {
  const value = String(template ?? '');
  assertTemplate(value, 'Provider');
  await api.windows.create({
    url: buildSearchUrl(value, String(terms ?? '')),
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  });
}

/**
 * @param {{ url: string, method: string }} message
 * @param {any} sender
 * @returns {Promise<void>}
 */
async function openLink({ url, method }, sender) {
  const value = String(url ?? '');
  if (!isHttpUrl(value)) throw new Error('Link must use http or https');
  await openUrl(value, method, sender);
}

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
      return loadIconMap(engines);
    }
    case 'refreshIcons': {
      const engines = await loadEngines();
      await clearIconCache();
      return loadIconMap(engines);
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
      await openReference({ template: message.template, terms: message.terms });
      return { ok: true };
    default:
      throw new Error(`Unknown message type: ${/** @type {any} */ (message).type}`);
  }
}

function seedStorageOnFailure() {
  seedStorage().catch((error) => console.error('ContextPop: seed failed', error));
}

api.runtime.onInstalled.addListener((/** @type {any} */ details) => {
  seedStorageOnFailure();
  // Send first-time installs to the options page so the onboarding callout is seen.
  if (details?.reason === 'install') api.runtime.openOptionsPage();
});

// Firefox MV3 only persists an event page's listeners after it has run once. A
// listener here forces that run every browser session, otherwise the first
// action click that wakes the suspended page is dropped and the options page
// does not open until a second click.
api.runtime.onStartup.addListener(seedStorageOnFailure);

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
