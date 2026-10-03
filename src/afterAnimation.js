// Resolves after a CSS animation or transition on an element finishes, with a fallback
// timer in case the event never fires (element detached, reduced motion, missed frame).
// Shared bare-name global across content-script, background, and options contexts; keep
// the top-level var in sync with the options.html and manifest.json load order.

/**
 * @param {HTMLElement} el
 * @param {number} fallbackMs
 * @param {string} [animationName]
 * @returns {Promise<void>}
 */
function afterAnimation(el, fallbackMs, animationName = '') {
  return new Promise((resolve) => {
    let timer = 0;
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      el.removeEventListener('animationend', onAnimationEnd);
      el.removeEventListener('transitionend', onTransitionEnd);
      resolve();
    };
    const onAnimationEnd = /** @param {AnimationEvent} event */ (event) => {
      if (event.target === el && (!animationName || event.animationName === animationName)) finish();
    };
    const onTransitionEnd = /** @param {TransitionEvent} event */ (event) => {
      if (event.target === el) finish();
    };
    el.addEventListener('animationend', onAnimationEnd);
    el.addEventListener('transitionend', onTransitionEnd);
    timer = setTimeout(finish, fallbackMs);
  });
}
