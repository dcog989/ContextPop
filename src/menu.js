(() => {
  if (globalThis.__contextSmartMenu) return;

  const api = globalThis.browser ?? globalThis.chrome;

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

  const MENU_CSS = `
.cs-menu {
  position: absolute;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 0.57em;
  padding: 0.57em;
  max-width: min(92vw, 40em);
  max-height: 70vh;
  overflow: auto;
  background: #ffffff;
  color: #1a1a1a;
  border: 1px solid #00000029;
  border-radius: 0.71em;
  box-shadow: 0 10px 32px #00000047;
  pointer-events: auto;
  font-family: var(--font-family);
  font-size: 14px;
  --icon-size: 26px;
  --tile-size: 38px;
}
.cs-menu.size-compact {
  font-size: 12px;
  --icon-size: 22px;
  --tile-size: 32px;
  gap: 4px;
  padding: 4px;
}
.cs-menu.size-compact .cs-tiles {
  gap: 2px;
}
.cs-menu.size-compact .cs-tile {
  padding: 1px;
}
.cs-menu.size-large {
  font-size: 16px;
  --icon-size: 30px;
  --tile-size: 44px;
}
.cs-menu.size-luxury {
  font-size: 18px;
  --icon-size: 34px;
  --tile-size: 50px;
}
.cs-menu.dark {
  background: #202124;
  color: #f1f3f4;
  border-color: #ffffff29;
}
.cs-tiles {
  display: grid;
  gap: 0.29em;
}
.cs-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.14em;
  width: var(--tile-size);
  height: var(--tile-size);
  padding: 0.14em;
  border: 1px solid transparent;
  border-radius: 0.57em;
  background: transparent;
  color: inherit;
  cursor: pointer;
  outline: none;
}
.cs-tile:hover {
  background: #00000014;
  border-color: #00000029;
}
.cs-menu.kb .cs-tile:focus {
  background: #00000014;
  border-color: #00000029;
}
.cs-menu.dark .cs-tile:hover,
.cs-menu.dark.kb .cs-tile:focus {
  background: #ffffff1f;
  border-color: #ffffff33;
}
.cs-menu.has-labels .cs-tile {
  width: auto;
  min-width: 4.86em;
  height: auto;
  padding: 0.43em 0.57em;
}
.cs-tile:disabled {
  opacity: 0.35;
  cursor: default;
}
.cs-tile:disabled:hover {
  background: transparent;
  border-color: transparent;
}
.cs-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-size);
  height: var(--icon-size);
}
.cs-icon [hidden] {
  display: none !important;
}
.cs-icon img {
  width: var(--icon-size);
  height: var(--icon-size);
  object-fit: contain;
  pointer-events: none;
}
.cs-icon .cs-mask {
  width: var(--icon-size);
  height: var(--icon-size);
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  pointer-events: none;
}
.cs-icon svg {
  width: calc(var(--icon-size) - 0.14em);
  height: calc(var(--icon-size) - 0.14em);
}
.cs-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-size);
  height: var(--icon-size);
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  font-size: calc(var(--icon-size) * 0.54);
  font-weight: 600;
}
.cs-label {
  max-width: 7.6em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.79em;
  line-height: 1.2;
}
.cs-empty {
  padding: 0.67em 1em;
  font-size: 0.86em;
  opacity: 0.72;
}
`;

  function t(name, fallback, substitutions) {
    const value = api.i18n?.getMessage(name, substitutions);
    if (value) return value;
    if (!substitutions) return fallback;
    return fallback.replace(/\$(\d+)\$/g, (_match, index) => String(substitutions[Number(index) - 1] ?? ''));
  }

  function listActions(settings) {
    return typeof globalThis.builtinActionList === 'function' ? globalThis.builtinActionList(settings) : [];
  }

  function contextMatches(item, context) {
    if (typeof globalThis.matchesContext === 'function') return globalThis.matchesContext(item, context);
    const contexts = Array.isArray(item?.contexts) ? item.contexts : ['text', 'word', 'link'];
    return contexts.includes(context);
  }

  function isMenuOpen() {
    return menuState.open;
  }

  function send(message) {
    api.runtime.sendMessage(message).catch(() => {});
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!menuState.open) return;
    menuState.open = false;
    if (menuState.host?.parentNode) menuState.host.parentNode.removeChild(menuState.host);
    menuState.host = null;
    menuState.root = null;

    const previousFocus = menuState.previousFocus;
    menuState.previousFocus = null;
    if (restoreFocus && previousFocus?.isConnected && typeof previousFocus.focus === 'function') {
      previousFocus.focus({ preventScroll: true });
    }
  }

  function createIcon(engine) {
    const { element, setSource } = createFaviconIcon({
      prefix: 'cs',
      label: (engine.name || '?').trim().charAt(0).toUpperCase(),
    });
    element.className = 'cs-icon';
    return { element, setSource };
  }

  function createBuiltinIcon(action) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cs-icon';
    wrapper.innerHTML = action.icon || '';
    return wrapper;
  }

  function resolveMethod(event, base) {
    if (event.shiftKey) return 'newWindow';
    if (event.ctrlKey || event.metaKey) return 'backgroundTab';
    return base || 'newTab';
  }

  function actionLabel(action, text) {
    switch (action.id) {
      case 'define':
        return t('actionDefine', 'Define $1$', [text]);
      case 'thesaurus':
        return t('actionThesaurus', 'Thesaurus $1$', [text]);
      default:
        return t(`action${capitalize(action.id)}`, action.id);
    }
  }

  function actionTooltip(action, text) {
    switch (action.id) {
      case 'define':
        return t('actionDefineTooltip', 'Define "$1$"', [text]);
      case 'thesaurus':
        return t('actionThesaurusTooltip', 'Thesaurus "$1$"', [text]);
      default:
        return actionLabel(action, text);
    }
  }

  function dispatchAction(id, event) {
    const action = menuState.actions.find((item) => item.id === id);
    if (!action) return;
    const method = resolveMethod(event, menuState.settings?.openMethod);

    switch (id) {
      case 'copyRich':
      case 'copyPlain':
        menuState.handlers?.[id]?.();
        break;
      case 'openLink':
        send({ type: 'openLink', url: menuState.href, method });
        break;
      case 'define':
      case 'thesaurus':
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

  function focusTile(tile) {
    const tiles = tile.parentNode ? [...tile.parentNode.querySelectorAll('.cs-tile')] : [tile];
    for (const item of tiles) item.tabIndex = item === tile ? 0 : -1;
    tile.focus({ preventScroll: true });
  }

  function moveFocus(menu, delta) {
    const tiles = [...menu.querySelectorAll('.cs-tile:not(:disabled)')];
    if (!tiles.length) return;
    const current = tiles.indexOf(menu.querySelector('.cs-tile:focus'));
    let next = current + delta;
    if (next < 0) next = tiles.length - 1;
    if (next >= tiles.length) next = 0;
    focusTile(tiles[next]);
  }

  function focusEdge(menu, last) {
    const tiles = [...menu.querySelectorAll('.cs-tile:not(:disabled)')];
    if (tiles.length) focusTile(last ? tiles[tiles.length - 1] : tiles[0]);
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
        closeMenu({ restoreFocus: true });
        break;
      default:
        break;
    }
  }

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

  function createActionTile(action, text, showLabels) {
    const label = actionLabel(action, text);
    const tile = document.createElement('button');
    decorateTile(tile, label, showLabels, actionTooltip(action, text));
    tile.dataset.actionId = action.id;
    if (action.disabled) tile.disabled = true;
    tile.prepend(createBuiltinIcon(action));
    tile.addEventListener('click', handleActionClick);
    return tile;
  }

  function createEngineTile(engine, showLabels) {
    const tile = document.createElement('button');
    decorateTile(tile, engine.name, showLabels);
    tile.dataset.engineId = engine.id;

    const icon = createIcon(engine);
    tile.prepend(icon.element);
    tile.addEventListener('click', handleEngineClick);
    tile.addEventListener('auxclick', handleEngineAuxClick);
    return { tile, setIcon: icon.setSource };
  }

  function applyTheme(menu, theme) {
    const dark = theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    menu.classList.toggle('dark', dark);
  }

  function positionMenu(menu, anchor) {
    const margin = 8;
    const rect = anchor.rect || { left: margin, top: margin, right: margin, bottom: margin };
    const size = menu.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + margin;

    if (anchor.position === 'under' && anchor.point) {
      const tileRect = menu.querySelector('.cs-tile:not(:disabled)')?.getBoundingClientRect();
      const offsetX = tileRect ? tileRect.left - size.left + tileRect.width / 2 : 0;
      const offsetY = tileRect ? tileRect.top - size.top + tileRect.height / 2 : 0;
      left = anchor.point.x - offsetX;
      top = anchor.point.y - offsetY;
    } else if (top + size.height > window.innerHeight - margin) {
      top = rect.top - size.height - margin;
    }

    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - size.width - margin));
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - size.height - margin));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  function appendTiles(tiles, items, kind, settings, iconSetters) {
    for (const item of items) {
      if (kind === 'actions') {
        tiles.appendChild(createActionTile(item, menuState.text, settings.showLabels));
      } else {
        const { tile, setIcon } = createEngineTile(item, settings.showLabels);
        tiles.appendChild(tile);
        iconSetters.set(item.id, setIcon);
      }
    }
  }

  function openMenu({
    text,
    html,
    context,
    href,
    linkText,
    rect,
    point,
    engines,
    settings,
    handlers,
  }) {
    closeMenu();

    menuState.text = text;
    menuState.html = html;
    menuState.context = context;
    menuState.href = href;
    menuState.linkText = linkText;
    menuState.handlers = handlers;
    menuState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const allActions = listActions(settings);
    const actions = allActions
      .filter((action) => action.enabled)
      .map((action) => ({ ...action, disabled: !contextMatches(action, context) }));

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';
    globalThis.__contextSmartTheme?.applyTokens(host);

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
    menu.classList.add(`size-${settings.popupSize || 'normal'}`);
    applyTheme(menu, settings.theme);

    const iconSetters = new Map();

    const tiles = document.createElement('div');
    tiles.className = 'cs-tiles';
    tiles.style.gridTemplateColumns = `repeat(${Math.max(1, Number(settings.columns) || 1)}, minmax(0, 1fr))`;

    const actionsFirst = settings.actionsPosition !== 'after';
    if (actionsFirst) appendTiles(tiles, actions, 'actions', settings, iconSetters);
    appendTiles(tiles, engines, 'engines', settings, iconSetters);
    if (!actionsFirst) appendTiles(tiles, actions, 'actions', settings, iconSetters);

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

    const firstTile = menu.querySelector('.cs-tile:not(:disabled)');
    if (firstTile) focusTile(firstTile);

    applyEngineIcons(iconSetters, engines);
  }

  globalThis.__contextSmartMenu = { openMenu, closeMenu, isMenuOpen, menuState };
})();
