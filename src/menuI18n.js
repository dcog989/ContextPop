// Popup i18n: resolves a localized string by name, falling back to a template with
// `$n$` placeholders when no translation is available in the current locale.

(() => {
  if (globalThis.__contextPopMenuI18n) return;

  const api = globalThis.browser ?? globalThis.chrome;

  function t(name, fallback, substitutions) {
    const value = api.i18n?.getMessage(name, substitutions);
    if (value) return value;
    if (!substitutions) return fallback;
    return fallback.replace(/\$(\d+)\$/g, (_match, index) => String(substitutions[Number(index) - 1] ?? ''));
  }

  globalThis.__contextPopMenuI18n = { t };
})();
