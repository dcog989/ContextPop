// Search-engine list view: rendering, add/delete/reorder, import from the browser, and
// icon refresh. Mutates `state.engines` and schedules saves through markDirty().

/** @type {Map<string, (source: string | null | undefined) => void>} */
let iconSetters = new Map();

// Last fetched engine icon map, reused across re-renders so add/delete/reorder do not
// re-query the background. Refreshed on initial load and by the Refresh icons button.
/** @type {Record<string, string>} */
let engineIcons = {};

/**
 * @param {Engine} engine
 * @returns {{ element: HTMLElement, setSource: (source: string | null | undefined) => void }}
 */
function createEngineIcon(engine) {
  const { element, setSource } = createFaviconIcon({
    prefix: 'engine',
    label: (engine.name || '?').trim().charAt(0).toUpperCase(),
  });
  element.className = 'engine-icon';
  return { element, setSource };
}

/**
 * @param {Engine} engine
 * @param {number} index
 * @returns {{ fragment: DocumentFragment, setIcon: (source: string | null | undefined) => void }}
 */
function createRow(engine, index) {
  const fragment = /** @type {DocumentFragment} */ (elements.rowTemplate.content.cloneNode(true));
  const row = /** @type {HTMLElement} */ (fragment.querySelector('.engine-row'));
  row.dataset.rowId = engine.id;

  const enabled = /** @type {HTMLInputElement} */ (fragment.querySelector('.engine-enabled'));
  const syncDisabled = () => row.classList.toggle('is-disabled', !enabled.checked);
  enabled.checked = engine.enabled !== false;
  enabled.addEventListener('change', () => {
    engine.enabled = enabled.checked;
    syncDisabled();
    markDirty();
  });
  syncDisabled();

  const icon = createEngineIcon(engine);
  /** @type {Element} */ (fragment.querySelector('.engine-icon')).replaceWith(icon.element);

  const name = /** @type {HTMLInputElement} */ (fragment.querySelector('.engine-name'));
  name.value = engine.name;
  name.addEventListener('input', () => {
    engine.name = name.value;
    markDirty();
  });

  const template = /** @type {HTMLInputElement} */ (fragment.querySelector('.engine-template'));
  template.value = engine.template;
  if (engine.source === 'browser') {
    template.disabled = true;
    template.dataset.i18nPlaceholder = 'templatePlaceholderBrowser';
    template.placeholder = msg('templatePlaceholderBrowser');
  }
  template.addEventListener('input', () => {
    engine.template = template.value;
    markDirty();
  });

  const iconUrl = /** @type {HTMLInputElement} */ (fragment.querySelector('.engine-icon-url'));
  iconUrl.value = engine.icon || '';
  iconUrl.addEventListener('input', () => {
    engine.icon = iconUrl.value.trim();
    markDirty();
  });

  /** @type {HTMLElement} */ (fragment.querySelector('.move-up')).addEventListener('click', () =>
    moveEngine(index, -1),
  );
  /** @type {HTMLElement} */ (fragment.querySelector('.move-down')).addEventListener('click', () =>
    moveEngine(index, 1),
  );
  /** @type {HTMLElement} */ (fragment.querySelector('.delete')).addEventListener('click', () => deleteEngine(index));

  return { fragment, setIcon: icon.setSource };
}

/**
 * @param {{ type: 'getIcons' | 'refreshIcons' }} message
 * @returns {Promise<Record<string, string>>}
 */
async function requestEngineIcons(message) {
  const response = await api.runtime.sendMessage(message);
  if (response?.error) throw new Error(response.error);
  return response?.data || {};
}

async function loadEngineIcons() {
  try {
    engineIcons = await requestEngineIcons({ type: 'getIcons' });
  } catch {
    engineIcons = {};
  }
  applyEngineIcons(iconSetters, state.engines, engineIcons);
}

function renderEngines() {
  elements.list.replaceChildren();
  iconSetters = new Map();
  state.engines.forEach((engine, index) => {
    const { fragment, setIcon } = createRow(engine, index);
    elements.list.appendChild(fragment);
    iconSetters.set(engine.id, setIcon);
  });
  applyEngineIcons(iconSetters, state.engines, engineIcons);
}

/**
 * @param {number} index
 * @param {number} offset
 */
function moveEngine(index, offset) {
  const target = index + offset;
  if (target < 0 || target >= state.engines.length) return;
  const first = captureRowPositions(elements.list);
  const [engine] = state.engines.splice(index, 1);
  state.engines.splice(target, 0, engine);
  renderEngines();
  playRowReorder(elements.list, first);
  markDirty();
}

/**
 * @param {number} index
 */
function removeEngine(index) {
  state.engines.splice(index, 1);
  renderEngines();
  markDirty();
}

/**
 * @param {number} index
 */
function deleteEngine(index) {
  const row = /** @type {HTMLElement | undefined} */ (elements.list.children[index]);
  if (!row || globalThis.__contextPopTheme?.prefersReducedMotion()) {
    removeEngine(index);
    return;
  }

  const first = captureRowPositions(elements.list);
  let settled = false;
  const finish = () => {
    if (settled) return;
    settled = true;
    removeEngine(index);
    playRowReorder(elements.list, first);
  };

  row.classList.add('row-removing');
  row.addEventListener('animationend', finish, { once: true });
  setTimeout(finish, 400);
}

function addEngine() {
  state.engines.push(normalizeEngine({ id: generateId(), name: '', source: 'template', template: '', icon: '' }));
  renderEngines();
  markDirty();
}

function restoreDefaults() {
  state.engines = defaultEngineList();
  renderEngines();
  markDirty();
  setStatus(msg('statusDefaultsRestored'));
}

async function importBrowserEngines() {
  if (typeof api.search?.get !== 'function') return;

  /** @type {any[]} */
  let installed = [];
  try {
    installed = await api.search.get();
  } catch (error) {
    setStatus(msg('statusImportFailed', errorMessage(error)), true);
    return;
  }

  const existing = new Set(
    state.engines.map((engine) => engine.browserEngineName).filter((name) => typeof name === 'string'),
  );
  let added = 0;
  for (const item of installed) {
    if (!item?.name || existing.has(item.name)) continue;
    state.engines.push(
      normalizeEngine({
        id: generateId(),
        name: item.name,
        source: 'browser',
        browserEngineName: item.name,
        icon: item.favIconUrl || '',
      }),
    );
    existing.add(item.name);
    added += 1;
  }

  renderEngines();
  markDirty();
  setStatus(msg('statusBrowserImported', String(added)));
}

async function handleRefreshIcons() {
  if (state.dirty) {
    setStatus(msg('statusSaveFirst'), true);
    return;
  }
  elements.refreshIcons.disabled = true;
  elements.refreshIcons.classList.add('is-loading');
  try {
    const granted = await requestHostAccess();
    if (!granted) {
      setStatus(msg('statusIconAccessDenied'), true);
      return;
    }

    const icons = await requestEngineIcons({ type: 'refreshIcons' });
    engineIcons = icons;
    applyEngineIcons(iconSetters, state.engines, icons);
    setStatus(msg('statusIconsRefreshed'));
    clearStatusSoon();
  } catch (error) {
    setStatus(msg('statusRefreshFailed', errorMessage(error)), true);
  } finally {
    elements.refreshIcons.disabled = false;
    elements.refreshIcons.classList.remove('is-loading');
  }
}
