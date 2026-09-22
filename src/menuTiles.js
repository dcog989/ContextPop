// Popup tile construction: builds the action and engine buttons (icon, label, ARIA,
// tooltips) and wires the callbacks supplied by the menu shell. Stateless - the caller
// owns click handling and the engine-icon setters.

(() => {
  if (globalThis.__contextPopMenuTiles) return;

  const { t } = globalThis.__contextPopMenuI18n;

  /**
   * @param {ActionItem} action
   * @param {string} text
   * @returns {string}
   */
  function actionLabel(action, text) {
    const key = `action${capitalize(action.id)}`;
    return action.usesText ? t(key, action.id, [text]) : t(key, action.id);
  }

  /**
   * @param {ActionItem} action
   * @param {string} text
   * @returns {string}
   */
  function actionTooltip(action, text) {
    const key = action.tooltipKey || `action${capitalize(action.id)}`;
    return action.usesText ? t(key, action.id, [text]) : t(key, action.id);
  }

  /**
   * @param {HTMLButtonElement} tile
   * @param {string} label
   * @param {boolean} showLabels
   * @param {string} [tooltip]
   * @returns {HTMLButtonElement}
   */
  function decorateTile(tile, label, showLabels, tooltip = label) {
    tile.type = 'button';
    tile.className = 'cs-tile';
    tile.title = tooltip;
    tile.setAttribute('aria-label', label);
    tile.setAttribute('role', 'menuitem');
    tile.tabIndex = -1;

    if (showLabels) {
      const span = document.createElement('span');
      span.className = 'cs-label';
      span.textContent = label;
      tile.appendChild(span);
    }
    return tile;
  }

  /**
   * @param {ActionItem} action
   * @returns {HTMLElement}
   */
  function createBuiltinIcon(action) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cs-icon';
    const icon = createSvgIcon(action.icon);
    if (icon) wrapper.appendChild(icon);
    return wrapper;
  }

  /**
   * @param {ActionItem} action
   * @param {string} text
   * @param {boolean} showLabels
   * @param {(event: MouseEvent) => void} onActivate
   * @returns {HTMLButtonElement}
   */
  function createActionTile(action, text, showLabels, onActivate) {
    const label = actionLabel(action, text);
    const tile = document.createElement('button');
    decorateTile(tile, label, showLabels, actionTooltip(action, text));
    tile.dataset.actionId = action.id;
    if (action.disabled) tile.disabled = true;
    tile.prepend(createBuiltinIcon(action));
    tile.addEventListener('click', onActivate);
    return tile;
  }

  /**
   * @param {Engine} engine
   * @param {boolean} showLabels
   * @param {EngineTileHandlers} handlers
   * @returns {EngineTile}
   */
  function createEngineTile(engine, showLabels, handlers) {
    const tile = document.createElement('button');
    decorateTile(tile, engine.name, showLabels);
    tile.dataset.engineId = engine.id;

    const icon = createFaviconTileIcon(engine, 'cs');
    tile.prepend(icon.element);
    tile.addEventListener('click', handlers.onClick);
    tile.addEventListener('auxclick', handlers.onAuxClick);
    return { tile, setIcon: icon.setSource };
  }

  /**
   * @param {HTMLElement} tiles
   * @param {ActionItem[]} actions
   * @param {string} text
   * @param {boolean} showLabels
   * @param {(event: MouseEvent) => void} onActivate
   */
  function appendActionTiles(tiles, actions, text, showLabels, onActivate) {
    for (const action of actions) {
      tiles.appendChild(createActionTile(action, text, showLabels, onActivate));
    }
  }

  /**
   * @param {HTMLElement} tiles
   * @param {Engine[]} engines
   * @param {boolean} showLabels
   * @param {Map<string, (source: string | null | undefined) => void>} iconSetters
   * @param {EngineTileHandlers} handlers
   */
  function appendEngineTiles(tiles, engines, showLabels, iconSetters, handlers) {
    for (const engine of engines) {
      const { tile, setIcon } = createEngineTile(engine, showLabels, handlers);
      tiles.appendChild(tile);
      iconSetters.set(engine.id, setIcon);
    }
  }

  globalThis.__contextPopMenuTiles = { appendActionTiles, appendEngineTiles };
})();
