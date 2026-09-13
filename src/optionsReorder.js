// Shared row-reorder animation for the action and engine lists: capture each row's top
// before a reorder, then FLIP the rows back into place afterwards.

function captureRowPositions(container) {
  return new Map([...container.children].map((el) => [el.dataset.rowId, el.getBoundingClientRect().top]));
}

function playRowReorder(container, first) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  for (const el of container.children) {
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
