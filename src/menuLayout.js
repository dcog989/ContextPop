// Popup geometry and focus helpers: theme classes, on-screen positioning, and roving
// keyboard focus over the tiles. Stateless - operates on elements passed in.

(() => {
  if (globalThis.__contextPopMenuLayout) return;

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

  function applyAnimationOrigin(menu, anchor) {
    const box = menu.getBoundingClientRect();
    const rect = anchor.rect;
    const point =
      anchor.position === 'under' && anchor.point
        ? anchor.point
        : { x: (rect?.left ?? 0) + (rect?.width ?? 0) / 2, y: rect?.bottom ?? 0 };
    const x = Math.min(Math.max(0, point.x - box.left), box.width);
    const y = Math.min(Math.max(0, point.y - box.top), box.height);
    menu.style.transformOrigin = `${Math.round(x)}px ${Math.round(y)}px`;
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

  globalThis.__contextPopMenuLayout = {
    applyTheme,
    positionMenu,
    applyAnimationOrigin,
    focusTile,
    moveFocus,
    focusEdge,
  };
})();
