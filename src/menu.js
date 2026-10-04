// Popup shell: owns the private menu state, lifecycle (open/close), and composition of the
// stateless menu modules. Actions and searches are delegated to injected callbacks, keeping
// the shell decoupled from transport. Publishes globalThis.__contextPopMenu for content.js.

(() => {
  if (globalThis.__contextPopMenu) return;

  const { t } = globalThis.__contextPopMenuI18n;
  const { css: MENU_CSS } = globalThis.__contextPopMenuStyles;
  const { applyTheme, positionMenu, applyAnimationOrigin, enabledTiles, moveFocus, focusEdge } =
    globalThis.__contextPopMenuLayout;
  const { appendActionTiles, appendEngineTiles } = globalThis.__contextPopMenuTiles;
  const prefersReducedMotion = () => globalThis.__contextPopTheme?.prefersReducedMotion() ?? false;

  /** @type {MenuState} */
  const menuState = {
    open: false,
    selection: null,
    config: null,
    callbacks: null,
    actions: [],
    host: null,
    root: null,
    previousFocus: null,
  };

  function isMenuOpen() {
    return menuState.open;
  }

  /**
   * @param {Event} event
   * @returns {boolean}
   */
  function isEventInsideMenu(event) {
    return Boolean(menuState.host && event.composedPath().includes(menuState.host));
  }

  /**
   * @param {HTMLElement} host
   * @param {number} percent
   */
  function applyOpacity(host, percent) {
    const value = Number(percent);
    const alpha = Number.isFinite(value) ? clamp(value, 0, 100) / 100 : 1;
    host.style.setProperty('--cs-alpha', String(alpha));
  }

  // Cache-only icon map for the frame, invalidated when the background writes resolved
  // icons (icon:* storage changes). A generation counter drops an in-flight reply that
  // was invalidated before it landed.
  /** @type {Record<string, string> | null} */
  let cachedIcons = null;
  /** @type {Promise<Record<string, string>> | null} */
  let iconRequest = null;
  let iconGeneration = 0;

  /**
   * Fetches engine icons for the open menu, reusing the frame-local map; failures fall
   * back to the letter tiles.
   * @returns {Promise<Record<string, string>>}
   */
  function requestIcons() {
    if (cachedIcons) return Promise.resolve(cachedIcons);
    if (!iconRequest) {
      const onIcons = menuState.callbacks?.onIcons;
      if (!onIcons) return Promise.resolve({});
      const generation = iconGeneration;
      iconRequest = onIcons()
        .then((icons) => {
          if (generation === iconGeneration) cachedIcons = icons;
          return icons;
        })
        .catch(() => ({}))
        .finally(() => {
          iconRequest = null;
        });
    }
    return iconRequest;
  }

  function invalidateIcons() {
    cachedIcons = null;
    iconGeneration += 1;
  }

  /**
   * @param {{ restoreFocus?: boolean, reason?: string }} [options]
   */
  function closeMenu({ restoreFocus = false, reason = 'action' } = {}) {
    if (!menuState.open) return;
    menuState.open = false;

    const host = menuState.host;
    const root = menuState.root;
    menuState.host = null;
    menuState.root = null;

    const previousFocus = menuState.previousFocus;
    menuState.previousFocus = null;
    if (restoreFocus && previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }

    const animate = menuState.config?.settings.popupAnimation ?? false;
    const onClose = menuState.callbacks?.onClose;
    menuState.selection = null;
    menuState.config = null;
    menuState.callbacks = null;
    onClose?.(reason);

    const menu = /** @type {HTMLElement | null} */ (root?.querySelector?.('.cs-menu') ?? null);
    if (reason === 'replace' || !menu || !host || !animate || prefersReducedMotion()) {
      host?.remove();
      return;
    }

    const closeMs = globalThis.__contextPopTheme?.DURATIONS.menuCloseMs ?? 0;
    afterAnimation(menu, closeMs, 'cs-shrink').then(() => host.remove());
    menu.classList.remove('cs-anim-in');
    menu.classList.add('cs-anim-out');
  }

  /**
   * @param {string} message
   */
  function showMenuError(message) {
    const menu = /** @type {HTMLElement | null} */ (menuState.root?.querySelector?.('.cs-menu') ?? null);
    if (!menu) return;
    let notice = /** @type {HTMLElement | null} */ (menu.querySelector('.cs-error'));
    if (!notice) {
      notice = document.createElement('div');
      notice.className = 'cs-error';
      notice.setAttribute('role', 'alert');
      menu.appendChild(notice);
    }
    notice.textContent = message;
  }

  /**
   * Runs an action and reports its outcome: close the menu on success, or keep it
   * open with an inline error when the request is rejected.
   * @param {HTMLElement | null} host
   * @param {Promise<unknown>} request
   */
  async function runWithFeedback(host, request) {
    try {
      await request;
    } catch (error) {
      if (menuState.host === host) showMenuError(t('actionFailed', 'Action failed: $1$', [errorMessage(error)]));
      return;
    }
    if (menuState.host === host) closeMenu({ restoreFocus: true });
  }

  /**
   * @param {MouseEvent} event
   */
  function handleActionClick(event) {
    const callbacks = menuState.callbacks;
    if (!callbacks) return;
    const id = /** @type {HTMLElement} */ (event.currentTarget).dataset.actionId ?? '';
    const action = menuState.actions.find((item) => item.id === id);
    if (!action) return;
    runWithFeedback(menuState.host, callbacks.onAction(action, event));
  }

  /**
   * @param {MouseEvent} event
   */
  function handleEngineClick(event) {
    if (!menuState.callbacks) return;
    runWithFeedback(
      menuState.host,
      menuState.callbacks.onSearch(/** @type {HTMLElement} */ (event.currentTarget).dataset.engineId ?? '', event),
    );
  }

  /**
   * @param {MouseEvent} event
   */
  function handleEngineAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    if (!menuState.callbacks) return;
    runWithFeedback(
      menuState.host,
      menuState.callbacks.onSearch(/** @type {HTMLElement} */ (event.currentTarget).dataset.engineId ?? '', event),
    );
  }

  /**
   * @param {KeyboardEvent} event
   */
  function handleMenuKeydown(event) {
    const menu = /** @type {HTMLElement} */ (event.currentTarget);
    menu.classList.add('kb');
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        event.preventDefault();
        moveFocus(menu, 1);
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        event.preventDefault();
        moveFocus(menu, -1);
        break;
      case 'Home':
        event.preventDefault();
        focusEdge(menu, false);
        break;
      case 'End':
        event.preventDefault();
        focusEdge(menu, true);
        break;
      case 'Tab':
        event.preventDefault();
        moveFocus(menu, event.shiftKey ? -1 : 1);
        break;
      case 'Escape':
        event.preventDefault();
        closeMenu({ restoreFocus: true, reason: 'escape' });
        break;
      default:
        break;
    }
  }

  /**
   * @param {OpenMenuOptions} options
   */
  function openMenu({ selection, config, callbacks }) {
    closeMenu({ reason: 'replace' });

    const { text, contexts, rect, point } = selection;
    const { engines, settings } = config;

    menuState.selection = selection;
    menuState.config = config;
    menuState.callbacks = callbacks;
    menuState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const allActions = builtinActionList(settings);
    const actions = allActions
      .filter((action) => action.enabled)
      .map((action) => ({ ...action, disabled: !matchesContext(action, contexts) }));

    const host = document.createElement('div');
    host.popover = 'manual';
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.margin = '0';
    host.style.padding = '0';
    host.style.border = '0';
    host.style.background = 'transparent';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.overflow = 'visible';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    globalThis.__contextPopTheme?.applyTokens(host);
    applyOpacity(host, settings.popupOpacity);

    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = MENU_CSS;
    root.appendChild(style);

    const menu = document.createElement('div');
    menu.className = 'cs-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('menuLabel', 'Selection actions'));
    menu.style.visibility = 'hidden';

    if (settings.showLabels) menu.classList.add('has-labels');
    menu.classList.add(`size-${settings.popupSize || POPUP_SIZE.standard}`);
    if (settings.accentBorder) menu.classList.add('accent-border');
    applyTheme(menu, settings.theme);

    /** @type {Map<string, (source: string | null | undefined) => void>} */
    const iconSetters = new Map();

    const tiles = document.createElement('div');
    tiles.className = 'cs-tiles';
    tiles.style.gridTemplateColumns = `repeat(${Math.max(1, Number(settings.columns) || 1)}, minmax(0, 1fr))`;

    const actionsFirst = settings.actionsPosition !== ACTIONS_POSITION.after;
    const engineHandlers = { onClick: handleEngineClick, onAuxClick: handleEngineAuxClick };
    if (actionsFirst) appendActionTiles(tiles, actions, text, settings.showLabels, handleActionClick);
    appendEngineTiles(tiles, engines, settings.showLabels, iconSetters, engineHandlers);
    if (!actionsFirst) appendActionTiles(tiles, actions, text, settings.showLabels, handleActionClick);

    if (tiles.childElementCount) menu.appendChild(tiles);

    if (!enabledTiles(menu).length) {
      const empty = document.createElement('div');
      empty.className = 'cs-empty';
      empty.textContent = t('menuNoActions', 'Nothing available for this selection');
      menu.appendChild(empty);
    }

    if (menu.querySelector('.cs-tile')) menu.addEventListener('keydown', handleMenuKeydown);

    root.appendChild(menu);
    document.documentElement.appendChild(host);
    host.showPopover();

    menuState.open = true;
    menuState.actions = allActions;
    menuState.host = host;
    menuState.root = root;

    positionMenu(menu, { rect, point, position: settings.popupPosition });
    menu.style.visibility = '';

    if (settings.popupAnimation && !prefersReducedMotion()) {
      applyAnimationOrigin(menu, { rect, point, position: settings.popupPosition });
      menu.classList.add('cs-anim-in');
    }

    menu.tabIndex = -1;
    menu.focus({ preventScroll: true });

    // Apply each engine's stored icon immediately so imported/custom favicons show at
    // once (as the options list does), then upgrade with the background-resolved map.
    applyEngineIcons(iconSetters, engines, {});
    requestIcons().then((icons) => applyEngineIcons(iconSetters, engines, icons));
  }

  globalThis.__contextPopMenu = { openMenu, closeMenu, isMenuOpen, isEventInsideMenu, invalidateIcons };
})();
