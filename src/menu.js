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

  const menuState = {
    open: false,
    text: '',
    html: '',
    context: '',
    href: '',
    linkText: '',
    actions: [],
    settings: null,
    handlers: null,
    host: null,
    root: null,
    previousFocus: null,
  };

  const CLOSE_ANIM_MS = 150;

  function isMenuOpen() {
    return menuState.open;
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function applyOpacity(host, percent) {
    const value = Number(percent);
    const alpha = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) / 100 : 1;
    host.style.setProperty('--cs-alpha', String(alpha));
  }

  function send(message) {
    api.runtime.sendMessage(message).catch(() => {});
  }

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
    if (menu && menuState.settings?.popupAnimation && !prefersReducedMotion()) {
      menu.classList.remove('cs-anim-in');
      menu.classList.add('cs-anim-out');
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        host?.remove();
      };
      menu.addEventListener('animationend', finish, { once: true });
      setTimeout(finish, CLOSE_ANIM_MS);
    } else {
      host?.remove();
    }
  }

  function resolveMethod(event, base) {
    if (event.shiftKey) return 'newWindow';
    if (event.ctrlKey || event.metaKey) return 'backgroundTab';
    return base || 'newTab';
  }

  function dispatchAction(id, event) {
    const action = menuState.actions.find((item) => item.id === id);
    if (!action) return;
    const method = resolveMethod(event, menuState.settings?.openMethod);

    switch (id) {
      case 'copyRich':
      case 'copyPlain':
      case 'copyLink':
        menuState.handlers?.[id]?.();
        break;
      case 'openLink':
        send({ type: 'openLink', url: menuState.href, method });
        break;
      case 'define':
      case 'thesaurus':
      case 'translate':
        send({ type: 'openReference', template: action.template, terms: menuState.text });
        break;
      default:
        break;
    }
  }

  function handleActionClick(event) {
    dispatchAction(event.currentTarget.dataset.actionId, event);
    closeMenu({ restoreFocus: true });
  }

  function handleEngineClick(event) {
    const method = resolveMethod(event, menuState.settings?.openMethod);
    send({ type: 'search', engineId: event.currentTarget.dataset.engineId, terms: menuState.text, method });
    closeMenu({ restoreFocus: true });
  }

  function handleEngineAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    send({
      type: 'search',
      engineId: event.currentTarget.dataset.engineId,
      terms: menuState.text,
      method: 'backgroundTab',
    });
    closeMenu({ restoreFocus: true });
  }

  function handleMenuKeydown(event) {
    const menu = event.currentTarget;
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

  function openMenu({ text, html, context, href, linkText, rect, point, engines, settings, handlers, onClose }) {
    closeMenu({ reason: 'replace' });

    menuState.text = text;
    menuState.html = html;
    menuState.context = context;
    menuState.href = href;
    menuState.linkText = linkText;
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

    const firstTile = menu.querySelector('.cs-tile:not(:disabled)');
    if (firstTile) focusTile(firstTile);

    applyEngineIcons(iconSetters, engines);
  }

  globalThis.__contextPopMenu = { openMenu, closeMenu, isMenuOpen, menuState };
})();
