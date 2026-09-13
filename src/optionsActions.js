// Actions list view: renders the built-in action rows with their enable toggles, editable
// templates, and reorder controls, and applies reordering to `state`.

/**
 * @param {string} actionId
 * @param {number} index
 * @returns {DocumentFragment}
 */
function createActionRow(actionId, index) {
  const def = BUILTIN_ACTION_DEFS.find((item) => item.id === actionId);
  const value = state.settings.builtinActions[actionId];
  const fragment = /** @type {DocumentFragment} */ (elements.actionRowTemplate.content.cloneNode(true));
  const row = /** @type {HTMLElement} */ (fragment.querySelector('.action-row'));
  row.dataset.rowId = actionId;

  const enabled = /** @type {HTMLInputElement} */ (fragment.querySelector('.action-enabled'));
  enabled.checked = value.enabled;
  enabled.addEventListener('change', () => {
    value.enabled = enabled.checked;
    markDirty();
  });

  const icon = createSvgIcon(def?.icon);
  if (icon) /** @type {HTMLElement} */ (fragment.querySelector('.action-icon')).appendChild(icon);
  /** @type {HTMLElement} */ (fragment.querySelector('.action-name')).textContent = msg(
    `action${capitalize(actionId)}`,
  );

  const templateField = /** @type {HTMLElement} */ (fragment.querySelector('.action-template-field'));
  if (def?.template) {
    templateField.hidden = false;
    const templateInput = /** @type {HTMLInputElement} */ (fragment.querySelector('.action-template'));
    templateInput.value = value.template || def.template;
    templateInput.addEventListener('input', () => {
      value.template = templateInput.value;
      markDirty();
    });
  }

  /** @type {HTMLElement} */ (fragment.querySelector('.move-up')).addEventListener('click', () =>
    moveAction(index, -1),
  );
  /** @type {HTMLElement} */ (fragment.querySelector('.move-down')).addEventListener('click', () =>
    moveAction(index, 1),
  );
  return fragment;
}

function renderActions() {
  elements.actionList.replaceChildren();
  state.settings.actionOrder.forEach((actionId, index) => {
    elements.actionList.appendChild(createActionRow(actionId, index));
  });
}

/**
 * @param {number} index
 * @param {number} offset
 */
function moveAction(index, offset) {
  const target = index + offset;
  const order = state.settings.actionOrder;
  if (target < 0 || target >= order.length) return;
  const first = captureRowPositions(elements.actionList);
  const [id] = order.splice(index, 1);
  order.splice(target, 0, id);
  renderActions();
  playRowReorder(elements.actionList, first);
  markDirty();
}

function restoreActionDefaults() {
  const defaults = defaultSettings();
  state.settings.builtinActions = defaults.builtinActions;
  state.settings.actionOrder = defaults.actionOrder;
  renderActions();
  markDirty();
  setStatus(msg('statusDefaultsRestored'));
}
