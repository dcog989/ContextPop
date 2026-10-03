// Background opening logic: normalizes queries, resolves the open method, and dispatches
// template-engine searches, browser searches, reference popups, and links. Message routing
// and lifecycle listeners stay in background.js. var/function (not const/let) throughout:
// top-level bindings are shared, bare-name globals across the background scripts.

var POPUP_WIDTH = 520;
var POPUP_HEIGHT = 720;
var MAX_QUERY_CHARS = 2048;

/**
 * @param {unknown} terms
 * @returns {string}
 */
function normalizeTerms(terms) {
  const value = String(terms ?? '').trim();
  return value.length > MAX_QUERY_CHARS ? value.slice(0, MAX_QUERY_CHARS) : value;
}

/**
 * @param {string} method
 * @param {any} sender
 * @returns {string}
 */
function resolveOpenMethod(method, sender) {
  let resolved = OPEN_METHODS.includes(method) ? method : DEFAULT_SETTINGS.openMethod;
  if (resolved === OPEN_METHOD.currentTab && sender?.tab?.id == null) resolved = OPEN_METHOD.newTab;
  return resolved;
}

/**
 * @param {string} method
 * @returns {string}
 */
function dispositionFor(method) {
  return OPEN_METHOD_DISPOSITIONS[method] ?? OPEN_METHOD_DISPOSITIONS[OPEN_METHOD.newTab];
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
    case OPEN_METHOD.currentTab:
      await api.tabs.update(openerTabId, { url });
      break;
    case OPEN_METHOD.backgroundTab:
      await api.tabs.create({ url, active: false, openerTabId });
      break;
    case OPEN_METHOD.newWindow:
      await api.windows.create({ url, incognito: sender?.tab?.incognito });
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
  if (openMethod === OPEN_METHOD.backgroundTab) {
    // The search API has no unfocused disposition, so open a background tab
    // and have the search run in it via tabId. The tab never takes focus,
    // matching template engines' tabs.create({ active: false }).
    const tab = await api.tabs.create({ active: false, openerTabId: sender?.tab?.id });
    try {
      await api.search.search({ engine: engine.browserEngineName, query, tabId: tab.id });
    } catch (error) {
      try {
        await api.tabs.remove(tab.id);
      } catch (removeError) {
        console.error('ContextPop: failed to close orphaned search tab', removeError);
      }
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
  const problem = templateProblem(value);
  if (problem === TEMPLATE_PROBLEM.missingTerms) throw new Error(`${label} template is missing {searchTerms}`);
  if (problem === TEMPLATE_PROBLEM.scheme) throw new Error(`${label} template must use http or https`);
}

/**
 * @param {{ engine: Engine, terms: string, method: string }} message
 * @param {any} sender
 * @returns {Promise<void>}
 */
async function openSearch({ engine, terms, method }, sender) {
  const query = normalizeTerms(terms);

  if (engine.source === ENGINE_SOURCE.browser) {
    if (!supportsBrowserEngineSearch()) throw new Error('Browser engine search is unavailable');
    await openBrowserSearch(engine, query, resolveOpenMethod(method, sender), sender);
    return;
  }

  assertTemplate(engine.template, 'Engine');
  const url = buildSearchUrl(engine.template, query);
  await openUrl(url, method, sender);
}

/**
 * @param {{ actionId: string, terms: string }} message
 * @param {any} sender
 * @returns {Promise<void>}
 */
async function openReference({ actionId, terms }, sender) {
  const settings = await loadSettings();
  const action = builtinActionList(settings).find((item) => item.id === actionId);
  if (action?.kind !== 'reference') throw new Error(`Unknown reference action: ${actionId}`);
  assertTemplate(action.template, 'Provider');
  await api.windows.create({
    url: buildSearchUrl(action.template, normalizeTerms(terms)),
    type: 'popup',
    width: POPUP_WIDTH,
    height: POPUP_HEIGHT,
    incognito: sender?.tab?.incognito,
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
