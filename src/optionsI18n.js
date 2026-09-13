// Options-page localization: resolves __MSG_* UI strings into the document, including the
// strings baked into the row templates. `elements` is provided by the entry script, which
// loads after this module and only runs the calls that touch it at bootstrap.

/**
 * @param {string} name
 * @param {string | Array<string | number>} [substitutions]
 * @returns {string}
 */
function msg(name, substitutions) {
  return api.i18n.getMessage(name, substitutions);
}

/**
 * @typedef {{ selector: string, key: string, apply: (element: any, value: string) => void }} AttributeBinding
 */

function localize() {
  /** @type {AttributeBinding[]} */
  const attributeBindings = [
    {
      selector: '[data-i18n-placeholder]',
      key: 'i18nPlaceholder',
      apply: (element, value) => (element.placeholder = value),
    },
    {
      selector: '[data-i18n-aria-label]',
      key: 'i18nAriaLabel',
      apply: (element, value) => element.setAttribute('aria-label', value),
    },
    { selector: '[data-i18n-title]', key: 'i18nTitle', apply: (element, value) => (element.title = value) },
  ];

  for (const node of document.querySelectorAll('[data-i18n]')) {
    const element = /** @type {HTMLElement} */ (node);
    const key = element.dataset.i18n;
    if (!key) continue;
    const value = msg(key);
    if (value) element.textContent = value;
  }

  const roots = [document, elements.rowTemplate?.content, elements.actionRowTemplate?.content].filter(
    (root) => root !== undefined,
  );
  for (const root of roots) {
    for (const { selector, key, apply } of attributeBindings) {
      for (const node of root.querySelectorAll(selector)) {
        const element = /** @type {HTMLElement} */ (node);
        const dataKey = element.dataset[key];
        if (!dataKey) continue;
        const value = msg(dataKey);
        if (value) apply(element, value);
      }
    }
  }

  document.title = msg('optionsPageTitle');
}
