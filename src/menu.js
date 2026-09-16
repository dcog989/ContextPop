// Popup shell: owns the private menu state, lifecycle (open/close), action dispatch, and
// composition of the stateless menu modules. Publishes globalThis.__contextPopMenu for
// content.js.

(() => {
  if (globalThis.__contextPopMenu) return;

  const api = globalThis.browser ?? globalThis.chrome;
  const { t } = globalThis.__contextPopMenuI18n;
  const { css: MENU_CSS } = globalThis.__contextPopMenuStyles;
  const { applyTheme, positionMenu, applyAnimationOrigin, focusTile, moveFocus, focusEdge } =
    globalThis.__contextPopMenuLayout;
  const { appendActionTiles, appendEngineTiles } = globalThis.__contextPopMenuTiles;
  const prefersReducedMotion = () => globalThis.__contextPopTheme?.prefersReducedMotion() ?? false;

  /** @type {MenuState} */
  const menuState = {
    open: false,
    text: '',
    html: '',
    context: '',
    href: '',
    actions: [],
    settings: null,
    handlers: null,
    host: null,
    root: null,
    previousFocus: null,
    onClose: null,
  };

  const CLOSE_ANIM_MS = 200;

  // Host left in the DOM by an in-progress exit animation, tracked so a subsequent
  // open can evict it before mounting the next menu.
  /** @type {{ host: HTMLElement, timer: ReturnType<typeof setTimeout> } | null} */
  let pendingClose = null;

  function isMenuOpen() {
    return menuState.open;
  }

  /**
   * @param {HTMLElement} host
   * @param {number} percent
   */
  function applyOpacity(host, percent) {
    const value = Number(percent);
    const alpha = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : 1;
    host.style.setProperty('--cs-alpha', String(alpha));
  }

  /**
   * @param {Message} message
   * @returns {Promise<void>}
   */
  async function send(message) {
    const response = await api.runtime.sendMessage(message);
    if (response && 'error' in response) throw new Error(response.error);
  }

  function removePendingClose() {
    if (!pendingClose) return;
    clearTimeout(pendingClose.timer);
    pendingClose.host.remove();
    pendingClose = null;
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

    const onClose = menuState.onClose;
    menuState.onClose = null;
    onClose?.(reason);

    const menu = root?.querySelector?.('.cs-menu');
    if (reason === 'replace' || !menu || !host || !menuState.settings?.popupAnimation || prefersReducedMotion()) {
      host?.remove();
      return;
    }

    removePendingClose();
    menu.classList.remove('cs-anim-in');
    menu.classList.add('cs-anim-out');
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      if (pendingClose?.host === host) {
        clearTimeout(pendingClose.timer);
        pendingClose = null;
      }
      host.remove();
    };
    const timer = setTimeout(finish, CLOSE_ANIM_MS);
    pendingClose = { host, timer };
    menu.addEventListener('animationend', finish, { once: true });
  }

  /**
   * @param {MouseEvent} event
   * @param {string | undefined} base
   * @returns {string}
   */
  function resolveMethod(event, base) {
    if (event.shiftKey) return 'newWindow';
    if (event.ctrlKey || event.metaKey) return 'backgroundTab';
    return base || 'newTab';
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
   * @param {Promise<void>} request
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
   * @param {string} id
   * @param {MouseEvent} event
   * @returns {Promise<void>}
   */
  async function dispatchAction(id, event) {
    const action = menuState.actions.find((item) => item.id === id);
    if (!action) return;
    const method = resolveMethod(event, menuState.settings?.openMethod);

    switch (id) {
      case 'copyRich':
      case 'copyPlain':
      case 'copyLink':
        await menuState.handlers?.[id]?.();
        break;
      case 'openLink':
        await send({ type: 'openLink', url: menuState.href, method });
        break;
      case 'define':
      case 'thesaurus':
      case 'translate':
        await send({ type: 'openReference', template: action.template, terms: menuState.text });
        break;
      default:
        break;
    }
  }

  /**
   * @param {MouseEvent} event
   */
  function handleActionClick(event) {
    const target = /** @type {HTMLElement} */ (event.currentTarget);
    runWithFeedback(menuState.host, dispatchAction(target.dataset.actionId ?? '', event));
  }

  /**
   * @param {MouseEvent} event
   */
  function handleEngineClick(event) {
    const method = resolveMethod(event, menuState.settings?.openMethod);
    runWithFeedback(
      menuState.host,
      send({
        type: 'search',
        engineId: /** @type {HTMLElement} */ (event.currentTarget).dataset.engineId ?? '',
        terms: menuState.text,
        method,
      }),
    );
  }

  /**
   * @param {MouseEvent} event
   */
  function handleEngineAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    runWithFeedback(
      menuState.host,
      send({
        type: 'search',
        engineId: /** @type {HTMLElement} */ (event.currentTarget).dataset.engineId ?? '',
        terms: menuState.text,
        method: 'backgroundTab',
      }),
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
  function openMenu({ text, html, context, href, rect, point, engines, settings, handlers, onClose }) {
    removePendingClose();
    closeMenu({ reason: 'replace' });

    menuState.text = text;
    menuState.html = html;
    menuState.context = context;
    menuState.href = href;
    menuState.handlers = handlers;
    menuState.onClose = onClose ?? null;
    menuState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const allActions = builtinActionList(settings);
    const actions = allActions
      .filter((action) => action.enabled)
      .map((action) => ({ ...action, disabled: !matchesContext(action, context) }));

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.inset = '0';
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
    menu.classList.add(`size-${settings.popupSize || 'standard'}`);
    if (settings.accentBorder) menu.classList.add('accent-border');
    applyTheme(menu, settings.theme);

    /** @type {Map<string, (source: string | null | undefined) => void>} */
    const iconSetters = new Map();

    const tiles = document.createElement('div');
    tiles.className = 'cs-tiles';
    tiles.style.gridTemplateColumns = `repeat(${Math.max(1, Number(settings.columns) || 1)}, minmax(0, 1fr))`;

    const actionsFirst = settings.actionsPosition !== 'after';
    const engineHandlers = { onClick: handleEngineClick, onAuxClick: handleEngineAuxClick };
    if (actionsFirst) appendActionTiles(tiles, actions, text, settings.showLabels, handleActionClick);
    appendEngineTiles(tiles, engines, settings.showLabels, iconSetters, engineHandlers);
    if (!actionsFirst) appendActionTiles(tiles, actions, text, settings.showLabels, handleActionClick);

    if (tiles.childElementCount) menu.appendChild(tiles);

    if (!menu.querySelector('.cs-tile:not(:disabled)')) {
      const empty = document.createElement('div');
      empty.className = 'cs-empty';
      empty.textContent = t('menuNoActions', 'Nothing available for this selection');
      menu.appendChild(empty);
    }

    if (menu.querySelector('.cs-tile')) menu.addEventListener('keydown', handleMenuKeydown);

    root.appendChild(menu);
    document.documentElement.appendChild(host);

    menuState.open = true;
    menuState.actions = allActions;
    menuState.settings = settings;
    menuState.host = host;
    menuState.root = root;

    positionMenu(menu, { rect, point, position: settings.popupPosition });
    menu.style.visibility = '';

    if (settings.popupAnimation && !prefersReducedMotion()) {
      applyAnimationOrigin(menu, { rect, point, position: settings.popupPosition });
      menu.classList.add('cs-anim-in');
    }

    const firstTile = /** @type {HTMLElement | null} */ (menu.querySelector('.cs-tile:not(:disabled)'));
    if (firstTile) focusTile(firstTile);

    applyEngineIcons(iconSetters, engines);
  }

  globalThis.__contextPopMenu = { openMenu, closeMenu, isMenuOpen, menuState };
})();
