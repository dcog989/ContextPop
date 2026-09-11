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
  gap: 8px;
  padding: 8px;
  max-width: min(92vw, 560px);
  max-height: 70vh;
  overflow: auto;
  background: #ffffff;
  color: #1a1a1a;
  border: 1px solid #00000029;
  border-radius: 10px;
  box-shadow: 0 10px 32px #00000047;
  pointer-events: auto;
  font-family: var(--font-family);
}
.cs-menu.dark {
  background: #202124;
  color: #f1f3f4;
  border-color: #ffffff29;
}
.cs-tiles {
  display: grid;
  gap: 4px;
}
.cs-menu {
  --icon-size: 28px;
  --tile-size: 52px;
}
.cs-menu.icon-sm {
  --icon-size: 22px;
  --tile-size: 44px;
}
.cs-menu.icon-lg {
  --icon-size: 36px;
  --tile-size: 64px;
}
.cs-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: var(--tile-size);
  height: var(--tile-size);
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 8px;
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
  min-width: 68px;
  height: auto;
  padding: 6px 8px;
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
  width: calc(var(--icon-size) - 2px);
  height: calc(var(--icon-size) - 2px);
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
  max-width: 84px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 11px;
  line-height: 1.2;
}
.cs-empty {
  padding: 8px 12px;
  font-size: 12px;
  opacity: 0.72;
}
`;

  const BUILTIN_ICON_SVG = Object.freeze({
    copyRich:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></svg>',
    copyPlain:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg>',
    openLink:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6"/><path d="M20 4 10 14"/><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
    openLinkBackground:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M13 5h6v6"/><path d="M19 5l-8 8"/><path d="M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5"/></svg>',
    define:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19a2 2 0 0 1 2-2h13"/></svg>',
    thesaurus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5a2 2 0 0 1 2-2h12v18H6a2 2 0 0 1-2-2z"/><path d="M9 8h6"/><path d="M9 12h4"/></svg>',
  });

  function t(name, fallback, substitutions) {
    const value = api.i18n?.getMessage(name, substitutions);
    if (value) return value;
    if (!substitutions) return fallback;
    return fallback.replace(/\$(\d+)\$/g, (_match, index) => String(substitutions[Number(index) - 1] ?? ''));
  }

  function capitalize(value) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }

  function listActions(settings) {
    return typeof globalThis.builtinActionList === 'function' ? globalThis.builtinActionList(settings) : [];
  }

  function contextMatches(item, context) {
    if (typeof globalThis.matchesContext === 'function') return globalThis.matchesContext(item, context);
    const contexts = Array.isArray(item?.contexts) ? item.contexts : ['text', 'word', 'link'];
    return contexts.includes(context);
  }

  function isCopyAction(id) {
    return id === 'copyRich' || id === 'copyPlain';
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

  function createBuiltinIcon(id) {
    const wrapper = document.createElement('span');
    wrapper.className = 'cs-icon';
    wrapper.innerHTML = BUILTIN_ICON_SVG[id] || BUILTIN_ICON_SVG.copyRich;
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
      case 'openLinkBackground':
        send({ type: 'openLink', url: menuState.href, method: 'backgroundTab' });
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
    const current = tiles.indexOf(document.activeElement);
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
    tile.prepend(createBuiltinIcon(action.id));
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

  function positionMenu(menu, anchorRect) {
    const margin = 8;
    const rect = anchorRect || { left: margin, top: margin, right: margin, bottom: margin };
    const size = menu.getBoundingClientRect();

    let left = rect.left;
    let top = rect.bottom + margin;
    if (top + size.height > window.innerHeight - margin) {
      top = rect.top - size.height - margin;
    }

    left = Math.min(Math.max(margin, left), Math.max(margin, window.innerWidth - size.width - margin));
    top = Math.min(Math.max(margin, top), Math.max(margin, window.innerHeight - size.height - margin));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  async function upgradeIcons(iconSetters, engines) {
    if (!engines.length) return;

    let icons = {};
    try {
      const response = await api.runtime.sendMessage({ type: 'getIcons' });
      if (response?.error) throw new Error(response.error);
      icons = response?.data || {};
    } catch {
      icons = {};
    }

    for (const engine of engines) {
      const setIcon = iconSetters.get(engine.id);
      if (setIcon) setIcon(icons[engine.id] || engine.icon);
    }
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

  function openMenu({ text, html, context, href, linkText, rect, engines, settings, clipboardAllowed, handlers }) {
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
      .filter((action) => action.enabled && (clipboardAllowed || !isCopyAction(action.id)))
      .map((action) => ({ ...action, disabled: !contextMatches(action, context) }));
    const copyBlocked =
      !clipboardAllowed &&
      allActions.some((action) => action.enabled && isCopyAction(action.id) && contextMatches(action, context));

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
    if (settings.iconSize === 'small' || settings.iconSize === 'large') {
      menu.classList.add(`icon-${settings.iconSize}`);
    }
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

    if (copyBlocked) {
      const notice = document.createElement('div');
      notice.className = 'cs-empty';
      notice.textContent = t('clipboardBlocked', 'Clipboard access was not granted');
      menu.appendChild(notice);
    }

    if (!menu.querySelector('.cs-tile:not(:disabled)') && !copyBlocked) {
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

    positionMenu(menu, rect);
    menu.style.visibility = '';

    const firstTile = menu.querySelector('.cs-tile:not(:disabled)');
    if (firstTile) focusTile(firstTile);

    upgradeIcons(iconSetters, engines);
  }

  globalThis.__contextSmartMenu = { openMenu, closeMenu, isMenuOpen, menuState };
})();
