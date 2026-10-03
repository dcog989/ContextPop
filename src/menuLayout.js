// Popup geometry and focus helpers: theme classes, on-screen positioning, and roving
// keyboard focus over the tiles. Stateless - operates on elements passed in.

(() => {
  if (globalThis.__contextPopMenuLayout) return;

  /**
   * @param {HTMLElement} menu
   * @param {string} theme
   */
  function applyTheme(menu, theme) {
    const dark =
      theme === THEME.dark || (theme === THEME.auto && window.matchMedia('(prefers-color-scheme: dark)').matches);
    menu.classList.toggle('dark', dark);
  }

  /**
   * @param {HTMLElement} menu
   * @param {MenuAnchor} anchor
   */
  function positionMenu(menu, anchor) {
    const margin = 8;
    const rect = anchor.rect || { left: margin, top: margin, right: margin, bottom: margin };
    const size = menu.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = document.documentElement.clientHeight;

    let left = rect.left;
    let top = rect.bottom + margin;

    if (anchor.position === POPUP_POSITION.under && anchor.point) {
      const tileRect = menu.querySelector('.cs-tile:not(:disabled)')?.getBoundingClientRect();
      const offsetX = tileRect ? tileRect.left - size.left + tileRect.width / 2 : 0;
      const offsetY = tileRect ? tileRect.top - size.top + tileRect.height / 2 : 0;
      left = anchor.point.x - offsetX;
      top = anchor.point.y - offsetY;
    } else if (top + size.height > viewportHeight - margin) {
      top = rect.top - size.height - margin;
    }

    left = clamp(left, margin, Math.max(margin, viewportWidth - size.width - margin));
    top = clamp(top, margin, Math.max(margin, viewportHeight - size.height - margin));

    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
  }

  /**
   * @param {HTMLElement} menu
   * @param {MenuAnchor} anchor
   */
  function applyAnimationOrigin(menu, anchor) {
    const box = menu.getBoundingClientRect();
    const rect = anchor.rect;
    const point =
      anchor.position === POPUP_POSITION.under && anchor.point
        ? anchor.point
        : { x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: rect?.bottom ?? 0 };
    const x = clamp(point.x - box.left, 0, box.width);
    const y = clamp(point.y - box.top, 0, box.height);
    menu.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
  }

  /**
   * @param {HTMLElement} tile
   */
  function focusTile(tile) {
    const tiles = /** @type {HTMLElement[]} */ (
      tile.parentNode ? [...tile.parentNode.querySelectorAll('.cs-tile')] : [tile]
    );
    for (const item of tiles) item.tabIndex = item === tile ? 0 : -1;
    tile.focus({ preventScroll: true });
  }

  /**
   * @param {HTMLElement} menu
   * @param {number} delta
   */
  function moveFocus(menu, delta) {
    const tiles = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.cs-tile:not(:disabled)')]);
    if (!tiles.length) return;
    const current = tiles.indexOf(/** @type {HTMLElement} */ (menu.querySelector('.cs-tile:focus')));
    let next = current + delta;
    if (next < 0) next = tiles.length - 1;
    if (next >= tiles.length) next = 0;
    focusTile(tiles[next]);
  }

  /**
   * @param {HTMLElement} menu
   * @param {boolean} last
   */
  function focusEdge(menu, last) {
    const tiles = /** @type {HTMLElement[]} */ ([...menu.querySelectorAll('.cs-tile:not(:disabled)')]);
    if (tiles.length) focusTile(last ? tiles[tiles.length - 1] : tiles[0]);
  }

  globalThis.__contextPopMenuLayout = {
    applyTheme,
    positionMenu,
    applyAnimationOrigin,
    focusTile,
    moveFocus,
    focusEdge,
  };
})();
