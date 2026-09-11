// Chrome loads only this file as a service worker; Firefox lists the scripts in the manifest.
if (typeof DEFAULT_ENGINES === 'undefined' && typeof importScripts === 'function') {
  importScripts('defaultEngines.js', 'storage.js', 'icons.js');
}

const OPEN_METHODS = Object.freeze(['newTab', 'backgroundTab', 'currentTab', 'newWindow']);
const POPUP_WIDTH = 520;
const POPUP_HEIGHT = 720;

const DISPOSITIONS = Object.freeze({
  newTab: 'NEW_TAB',
  backgroundTab: 'NEW_TAB',
  currentTab: 'CURRENT_TAB',
  newWindow: 'NEW_WINDOW',
});

async function seedStorage() {
  const engines = await loadEngines();
  if (!engines.length) await saveEngines(defaultEngineList());

  const result = await api.storage.local.get(STORAGE_KEYS.settings);
  if (!result[STORAGE_KEYS.settings]) await saveSettings(defaultSettings());
}

function resolveOpenMethod(method, sender) {
  let resolved = OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod;
  if (resolved === 'currentTab' && sender?.tab?.id == null) resolved = 'newTab';
  return resolved;
}

function dispositionFor(method) {
  return DISPOSITIONS[OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod];
}

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

async function openSearch({ engine, terms, method }, sender) {
  const query = String(terms ?? '');

  if (engine.source === 'browser') {
    if (!supportsBrowserEngineSearch()) throw new Error('Browser engine search is unavailable');
    await api.search.search({
      engine: engine.browserEngineName,
      query,
      disposition: dispositionFor(method),
    });
    return;
  }

  if (!engine.template.includes('{searchTerms}')) throw new Error('Engine template is missing {searchTerms}');
  if (!HTTP_URL_PATTERN.test(engine.template)) throw new Error('Engine template must use http or https');

  const url = buildSearchUrl(engine.template, query);
  await openUrl(url, method, sender);
}

async function openReference({ template, terms }) {
  const value = String(template ?? '');
  if (!value.includes('{searchTerms}')) throw new Error('Provider template is missing {searchTerms}');
  if (!HTTP_URL_PATTERN.test(value)) throw new Error('Provider template must use http or https');
  await api.windows.create({
    url: buildSearchUrl(value, String(terms ?? '')),
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
  });
}

async function openLink({ url, method }, sender) {
  const value = String(url ?? '');
  if (!HTTP_URL_PATTERN.test(value)) throw new Error('Link must use http or https');
  await openUrl(value, method, sender);
}

async function handleMessage(message, sender) {
  switch (message?.type) {
    case 'getEngines': {
      let engines = await loadEngines();
      if (!engines.length) {
        engines = defaultEngineList();
        await saveEngines(engines);
      }
      return engines;
    }
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
    case 'openOptions':
      await api.runtime.openOptionsPage();
      return { ok: true };
    default:
      throw new Error(`Unknown message type: ${message?.type}`);
  }
}

api.runtime.onInstalled.addListener(() => {
  seedStorage().catch((error) => console.error('Context Smart: seed failed', error));
});

api.action.onClicked.addListener(() => {
  api.runtime.openOptionsPage();
});

api.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender)
    .then((data) => sendResponse({ data }))
    .catch((error) => sendResponse({ error: error.message }));
  return true;
});
