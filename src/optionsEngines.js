// Search-engine list view: rendering, add/delete/reorder, import from the browser, and
// icon refresh. Mutates `state.engines` and schedules saves through markDirty().

let iconSetters = new Map();

function createEngineIcon(engine) {
  const { element, setSource } = createFaviconIcon({
    prefix: 'engine',
    label: (engine.name || '?').trim().charAt(0).toUpperCase(),
  });
  element.className = 'engine-icon';
  return { element, setSource };
}

function createRow(engine, index) {
  const fragment = elements.rowTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.engine-row');
  row.dataset.rowId = engine.id;

  const enabled = fragment.querySelector('.engine-enabled');
  const syncDisabled = () => row.classList.toggle('is-disabled', !enabled.checked);
  enabled.checked = engine.enabled !== false;
  enabled.addEventListener('change', () => {
    engine.enabled = enabled.checked;
    syncDisabled();
    markDirty();
  });
  syncDisabled();

  const icon = createEngineIcon(engine);
  fragment.querySelector('.engine-icon').replaceWith(icon.element);

  const name = fragment.querySelector('.engine-name');
  name.value = engine.name;
  name.addEventListener('input', () => {
    engine.name = name.value;
    markDirty();
  });

  const template = fragment.querySelector('.engine-template');
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

  const iconUrl = fragment.querySelector('.engine-icon-url');
  iconUrl.value = engine.icon || '';
  iconUrl.addEventListener('input', () => {
    engine.icon = iconUrl.value.trim();
    markDirty();
  });

  fragment.querySelector('.move-up').addEventListener('click', () => moveEngine(index, -1));
  fragment.querySelector('.move-down').addEventListener('click', () => moveEngine(index, 1));
  fragment.querySelector('.delete').addEventListener('click', () => deleteEngine(index));

  return { fragment, setIcon: icon.setSource };
}

function renderEngines() {
  elements.list.replaceChildren();
  iconSetters = new Map();
  state.engines.forEach((engine, index) => {
    const { fragment, setIcon } = createRow(engine, index);
    elements.list.appendChild(fragment);
    iconSetters.set(engine.id, setIcon);
  });
  applyEngineIcons(iconSetters, state.engines);
}

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

function removeEngine(index) {
  state.engines.splice(index, 1);
  renderEngines();
  markDirty();
}

function deleteEngine(index) {
  const row = elements.list.children[index];
  if (!row || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
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

  let installed = [];
  try {
    installed = await api.search.get();
  } catch (error) {
    setStatus(msg('statusImportFailed', error.message), true);
    return;
  }

  const existing = new Set(state.engines.map((engine) => engine.browserEngineName).filter(Boolean));
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

    const response = await api.runtime.sendMessage({ type: 'refreshIcons' });
    if (response?.error) throw new Error(response.error);
    const icons = response?.data || {};
    for (const engine of state.engines) {
      const setIcon = iconSetters.get(engine.id);
      if (setIcon) setIcon(icons[engine.id] || engine.icon);
    }
    setStatus(msg('statusIconsRefreshed'));
    clearStatusSoon();
  } catch (error) {
    setStatus(msg('statusRefreshFailed', error.message), true);
  } finally {
    elements.refreshIcons.disabled = false;
    elements.refreshIcons.classList.remove('is-loading');
  }
}
