(() => {
  if (globalThis.__contextSmartTheme) return;

  const TOKENS = Object.freeze({
    accent: '#c65900',
    fontFamily: 'system-ui, sans-serif',
  });

  function toCssVariable(name) {
    return `--${name.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`;
  }

  function applyTokens(target) {
    if (!target) return;
    for (const [name, value] of Object.entries(TOKENS)) {
      target.style.setProperty(toCssVariable(name), value);
    }
  }

  globalThis.__contextSmartTheme = { TOKENS, applyTokens };
})();
