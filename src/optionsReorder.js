// Shared row-reorder animation for the action and engine lists: capture each row's top
// before a reorder, then FLIP the rows back into place afterwards.

/**
 * @param {HTMLElement} container
 * @returns {Map<string | undefined, number>}
 */
function captureRowPositions(container) {
  return new Map(
    Array.from(container.children, (node) => {
      const el = /** @type {HTMLElement} */ (node);
      return /** @type {[string | undefined, number]} */ ([el.dataset.rowId, el.getBoundingClientRect().top]);
    }),
  );
}

/**
 * @param {HTMLElement} container
 * @param {Map<string | undefined, number>} first
 */
function playRowReorder(container, first) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const node of container.children) {
    const el = /** @type {HTMLElement} */ (node);
    const oldTop = first.get(el.dataset.rowId);
    if (oldTop === undefined) continue;
    const delta = oldTop - el.getBoundingClientRect().top;
    if (delta === 0) continue;
    el.style.transition = 'none';
    el.style.transform = `translateY(${delta}px)`;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        el.style.transition = 'transform 180ms ease';
        el.style.transform = '';
      });
    });
    el.addEventListener(
      'transitionend',
      () => {
        el.style.transition = '';
        el.style.transform = '';
      },
      { once: true },
    );
  }
}
