(() => {
  if (globalThis.__contextPopTheme) return;

  const TOKENS = Object.freeze({
    accent: '#c65900',
    fontFamily: 'system-ui, sans-serif',
  });

  const DURATIONS = Object.freeze({
    rowRemoveMs: 160,
    menuCloseMs: 160,
  });

  /**
   * @param {string} name
   * @returns {string}
   */
  function toCssVariable(name) {
    return `--${name.replace(
      /[A-Z]/g,
      /** @param {string} letter @returns {string} */ (letter) => `-${letter.toLowerCase()}`,
    )}`;
  }

  /**
   * @param {HTMLElement | null} target
   */
  function applyTokens(target) {
    if (!target) return;
    for (const [name, value] of Object.entries(TOKENS)) {
      target.style.setProperty(toCssVariable(name), value);
    }
    for (const [name, value] of Object.entries(DURATIONS)) {
      target.style.setProperty(toCssVariable(name), `${value}ms`);
    }
  }

  function prefersReducedMotion() {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  globalThis.__contextPopTheme = { TOKENS, DURATIONS, applyTokens, prefersReducedMotion };
})();
