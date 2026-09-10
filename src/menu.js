(() => {
  if (globalThis.__contextSmartMenu) return;

  const api = globalThis.browser ?? globalThis.chrome;

  const menuState = {
    open: false,
    text: '',
    settings: null,
    host: null,
    root: null,
    previousFocus: null,
  };

  const MENU_CSS = `
.cs-menu {
  position: absolute;
  z-index: 2147483647;
  display: grid;
  gap: 4px;
  padding: 6px;
  max-width: min(92vw, 560px);
  max-height: 70vh;
  overflow: auto;
  background: #ffffff;
  color: #1a1a1a;
  border: 1px solid rgba(0, 0, 0, 0.16);
  border-radius: 10px;
  box-shadow: 0 10px 32px rgba(0, 0, 0, 0.28);
  pointer-events: auto;
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
.cs-menu.dark {
  background: #202124;
  color: #f1f3f4;
  border-color: rgba(255, 255, 255, 0.16);
}
.cs-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  width: 46px;
  height: 46px;
  padding: 2px;
  border: 1px solid transparent;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  cursor: pointer;
}
.cs-tile:hover,
.cs-tile:focus-visible {
  background: rgba(0, 0, 0, 0.08);
  border-color: rgba(0, 0, 0, 0.16);
  outline: none;
}
.cs-menu.dark .cs-tile:hover,
.cs-menu.dark .cs-tile:focus-visible {
  background: rgba(255, 255, 255, 0.12);
  border-color: rgba(255, 255, 255, 0.2);
}
.cs-menu.has-labels .cs-tile {
  width: auto;
  min-width: 68px;
  height: auto;
  padding: 6px 8px;
}
.cs-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
}
.cs-icon [hidden] {
  display: none !important;
}
.cs-icon img {
  width: 24px;
  height: 24px;
  object-fit: contain;
  pointer-events: none;
}
.cs-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: #e27207;
  color: #ffffff;
  font-size: 13px;
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

  function t(name, fallback) {
    return api.i18n?.getMessage(name) || fallback;
  }

  function isMenuOpen() {
    return menuState.open;
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
    const wrapper = document.createElement('span');
    wrapper.className = 'cs-icon';

    const fallback = document.createElement('span');
    fallback.className = 'cs-letter';
    fallback.textContent = (engine.name || '?').trim().charAt(0).toUpperCase();

    const img = document.createElement('img');
    img.alt = '';
    img.referrerPolicy = 'no-referrer';
    img.hidden = true;
    img.addEventListener('error', () => {
      img.hidden = true;
      fallback.hidden = false;
    });

    const setSource = (source) => {
      if (!source || !wrapper.isConnected) return;
      img.src = source;
      img.hidden = false;
      fallback.hidden = true;
    };

    wrapper.append(img, fallback);
    return { element: wrapper, setSource };
  }

  function requestSearch(engineId, method) {
    api.runtime.sendMessage({ type: 'search', engineId, terms: menuState.text, method }).catch(() => {});
  }

  function handleTileClick(event) {
    let method = menuState.settings?.openMethod || 'newTab';
    if (event.shiftKey) method = 'newWindow';
    else if (event.ctrlKey || event.metaKey) method = 'backgroundTab';

    requestSearch(event.currentTarget.dataset.engineId, method);
    closeMenu({ restoreFocus: true });
  }

  function handleTileAuxClick(event) {
    if (event.button !== 1) return;
    event.preventDefault();
    requestSearch(event.currentTarget.dataset.engineId, 'backgroundTab');
    closeMenu({ restoreFocus: true });
  }

  function focusTile(tile) {
    const tiles = tile.parentNode ? [...tile.parentNode.querySelectorAll('.cs-tile')] : [tile];
    for (const item of tiles) item.tabIndex = item === tile ? 0 : -1;
    tile.focus({ preventScroll: true });
  }

  function moveFocus(menu, delta) {
    const tiles = [...menu.querySelectorAll('.cs-tile')];
    if (!tiles.length) return;
    const current = tiles.indexOf(document.activeElement);
    let next = current + delta;
    if (next < 0) next = tiles.length - 1;
    if (next >= tiles.length) next = 0;
    focusTile(tiles[next]);
  }

  function focusEdge(menu, last) {
    const tiles = [...menu.querySelectorAll('.cs-tile')];
    if (tiles.length) focusTile(last ? tiles[tiles.length - 1] : tiles[0]);
  }

  function handleMenuKeydown(event) {
    const menu = event.currentTarget;
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

  function createTile(engine, showLabels) {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = 'cs-tile';
    tile.dataset.engineId = engine.id;
    tile.title = engine.name;
    tile.setAttribute('aria-label', engine.name);
    tile.setAttribute('role', 'menuitem');
    tile.tabIndex = -1;

    const icon = createIcon(engine);
    tile.appendChild(icon.element);

    if (showLabels) {
      const label = document.createElement('span');
      label.className = 'cs-label';
      label.textContent = engine.name;
      tile.appendChild(label);
    }

    tile.addEventListener('click', handleTileClick);
    tile.addEventListener('auxclick', handleTileAuxClick);
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
    if (!engines.some((engine) => engine.icon)) return;

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

  function openMenu({ text, rect, engines, settings }) {
    closeMenu();

    menuState.previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const host = document.createElement('div');
    host.style.position = 'fixed';
    host.style.inset = '0';
    host.style.zIndex = '2147483647';
    host.style.pointerEvents = 'none';

    const root = host.attachShadow({ mode: 'closed' });

    const style = document.createElement('style');
    style.textContent = MENU_CSS;
    root.appendChild(style);

    const menu = document.createElement('div');
    menu.className = 'cs-menu';
    menu.setAttribute('role', 'menu');
    menu.setAttribute('aria-label', t('menuLabel', 'Selection actions'));
    menu.style.visibility = 'hidden';
    menu.style.gridTemplateColumns = `repeat(${Math.max(1, Number(settings.columns) || 1)}, minmax(0, 1fr))`;

    if (settings.showLabels) menu.classList.add('has-labels');
    applyTheme(menu, settings.theme);

    const iconSetters = new Map();

    if (engines.length) {
      for (const engine of engines) {
        const { tile, setIcon } = createTile(engine, settings.showLabels);
        menu.appendChild(tile);
        iconSetters.set(engine.id, setIcon);
      }
      menu.addEventListener('keydown', handleMenuKeydown);
    } else {
      const empty = document.createElement('div');
      empty.className = 'cs-empty';
      empty.textContent = t('menuNoEngines', 'No search engines configured');
      menu.appendChild(empty);
    }

    root.appendChild(menu);
    document.documentElement.appendChild(host);

    menuState.open = true;
    menuState.text = text;
    menuState.settings = settings;
    menuState.host = host;
    menuState.root = root;

    positionMenu(menu, rect);
    menu.style.visibility = '';

    const firstTile = menu.querySelector('.cs-tile');
    if (firstTile) focusTile(firstTile);

    upgradeIcons(iconSetters, engines);
  }

  globalThis.__contextSmartMenu = { openMenu, closeMenu, isMenuOpen, menuState };
})();
