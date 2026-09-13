(() => {
  if (globalThis.__contextPopTheme) return;

  const TOKENS = Object.freeze({
    accent: '#c65900',
    fontFamily: 'system-ui, sans-serif',
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
  }

  globalThis.__contextPopTheme = { TOKENS, applyTokens };
})();
