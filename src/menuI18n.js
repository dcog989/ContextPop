// Popup i18n: resolves a localized string by name, falling back to a template with
// `$n$` placeholders when no translation is available in the current locale.

(() => {
  if (globalThis.__contextPopMenuI18n) return;

  const api = globalThis.browser ?? globalThis.chrome;

  /**
   * @param {string} name
   * @param {string} [fallback]
   * @param {Array<string | number>} [substitutions]
   * @returns {string}
   */
  function t(name, fallback, substitutions) {
    const value = api.i18n?.getMessage(name, substitutions);
    if (value) return value;
    if (!fallback) return '';
    if (!substitutions) return fallback;
    return fallback.replace(
      /\$(\d+)\$/g,
      /** @param {string} _match @param {string} index @returns {string} */ (_match, index) =>
        String(substitutions[Number(index) - 1] ?? ''),
    );
  }

  globalThis.__contextPopMenuI18n = { t };
})();
