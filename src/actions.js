// Built-in action catalog and normalization: the action definitions (ids, contexts,
// templates) plus the helpers that normalize stored values against them and turn settings
// into the ordered ActionItem list the menu consumes. Unwrapped bare globals shared with
// sibling content-script files.

var THESAURUS_TEMPLATE = 'https://dictionary.cambridge.org/thesaurus/{searchTerms}';

/** @type {ReadonlyArray<BuiltinAction>} */
var BUILTIN_ACTION_DEFS = Object.freeze([
  { id: 'copyPlain', kind: 'clipboard', contexts: ['text', 'word', 'link'], icon: ACTION_ICONS.copyPlain },
  { id: 'copyLink', kind: 'clipboard', contexts: ['link'], icon: ACTION_ICONS.copyLink },
  { id: 'copyRich', kind: 'clipboard', contexts: ['text', 'word', 'link'], icon: ACTION_ICONS.copyRich },
  {
    id: 'define',
    kind: 'reference',
    contexts: ['word'],
    template: 'https://en.wiktionary.org/wiki/{searchTerms}',
    icon: ACTION_ICONS.define,
    usesText: true,
    tooltipKey: 'actionDefineTooltip',
  },
  { id: 'openLink', kind: 'link', contexts: ['link'], icon: ACTION_ICONS.openLink },
  {
    id: 'thesaurus',
    kind: 'reference',
    contexts: ['word'],
    template: THESAURUS_TEMPLATE,
    icon: ACTION_ICONS.thesaurus,
    usesText: true,
    tooltipKey: 'actionThesaurusTooltip',
  },
  {
    id: 'translate',
    kind: 'reference',
    contexts: ['text', 'word'],
    template: 'https://translate.google.com/?sl=auto&tl=en&text={searchTerms}&op=translate',
    icon: ACTION_ICONS.translate,
  },
]);

/**
 * The i18n message key for a built-in action's label, e.g. `copyPlain` -> `actionCopyPlain`.
 * @param {string} id
 * @returns {string}
 */
function actionMessageKey(id) {
  return `action${capitalize(id)}`;
}

/**
 * @param {any} stored
 * @param {Record<string, BuiltinActionValue>} base
 * @returns {Record<string, BuiltinActionValue>}
 */
function normalizeBuiltinActions(stored, base) {
  const source = Array.isArray(stored)
    ? Object.fromEntries(stored.map((item) => [item?.id, item]))
    : stored && typeof stored === 'object'
      ? stored
      : {};

  return Object.fromEntries(
    BUILTIN_ACTION_DEFS.map((def) => {
      const fallback = base[def.id];
      const value = source[def.id] || {};
      /** @type {BuiltinActionValue} */
      const entry = {
        enabled: value.enabled !== false,
      };
      if (def.template) {
        const storedTemplate = value.template;
        entry.template =
          typeof storedTemplate === 'string' ? storedTemplate : String(fallback.template ?? def.template);
      }
      return [def.id, entry];
    }),
  );
}

/**
 * @param {any} order
 * @returns {string[]}
 */
function normalizeActionOrder(order) {
  const ids = BUILTIN_ACTION_DEFS.map((def) => def.id);
  const seen = new Set();
  const result = [];
  for (const id of Array.isArray(order) ? order : []) {
    if (ids.includes(id) && !seen.has(id)) {
      seen.add(id);
      result.push(id);
    }
  }
  for (const id of ids) {
    if (!seen.has(id)) result.push(id);
  }
  return result;
}

/**
 * Expects already-normalized settings (see normalizeSettings in storage.js); callers must
 * not pass raw stored values, which may omit action entries.
 * @param {Settings} settings
 * @returns {ActionItem[]}
 */
function builtinActionList(settings) {
  const byId = new Map(BUILTIN_ACTION_DEFS.map((def) => [def.id, def]));
  return settings.actionOrder
    .map((id) => byId.get(id))
    .filter((def) => def !== undefined)
    .map((def) => {
      const value = settings.builtinActions[def.id];
      return {
        id: def.id,
        kind: def.kind,
        template: value.template ?? def.template ?? '',
        enabled: value.enabled,
        contexts: [...def.contexts],
        icon: def.icon || '',
        usesText: def.usesText === true,
        tooltipKey: def.tooltipKey ?? '',
      };
    });
}

/**
 * @param {ActionItem} item
 * @param {string[]} contexts
 * @returns {boolean}
 */
function matchesContext(item, contexts) {
  return item.contexts.some((value) => contexts.includes(value));
}
