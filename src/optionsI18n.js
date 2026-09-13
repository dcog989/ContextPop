// Options-page localization: resolves __MSG_* UI strings into the document, including the
// strings baked into the row templates. `elements` is provided by the entry script, which
// loads after this module and only runs the calls that touch it at bootstrap.

function msg(name, substitutions) {
  return api.i18n.getMessage(name, substitutions);
}

function localize() {
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

  for (const element of document.querySelectorAll('[data-i18n]')) {
    const value = msg(element.dataset.i18n);
    if (value) element.textContent = value;
  }

  const roots = [document, elements.rowTemplate?.content, elements.actionRowTemplate?.content].filter(Boolean);
  for (const root of roots) {
    for (const { selector, key, apply } of attributeBindings) {
      for (const element of root.querySelectorAll(selector)) {
        const value = msg(element.dataset[key]);
        if (value) apply(element, value);
      }
    }
  }

  document.title = msg('optionsPageTitle');
}
