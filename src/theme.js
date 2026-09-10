(() => {
  if (globalThis.__contextSmartTheme) return;

  const TOKENS = Object.freeze({
    accent: '#c65900',
  });

  function applyTokens(target) {
    if (!target) return;
    for (const [name, value] of Object.entries(TOKENS)) {
      target.style.setProperty(`--${name}`, value);
    }
  }

  globalThis.__contextSmartTheme = { TOKENS, applyTokens };
})();
