// Preferences form: reflect settings into the controls and persist each change to `state`.

function renderSettings() {
  elements.actionsPosition.value = state.settings.actionsPosition;
  elements.trigger.value = state.settings.trigger;
  elements.openMethod.value = state.settings.openMethod;
  elements.columns.value = String(state.settings.columns);
  elements.theme.value = state.settings.theme;
  elements.labels.checked = Boolean(state.settings.showLabels);
  elements.accentBorder.checked = Boolean(state.settings.accentBorder);
  elements.popupSize.value = state.settings.popupSize;
  elements.popupPosition.value = state.settings.popupPosition;
  elements.popupAnimation.checked = Boolean(state.settings.popupAnimation);
  elements.popupOpacity.value = String(state.settings.popupOpacity);
  elements.popupOpacityValue.textContent = `${state.settings.popupOpacity}%`;
}

function bindSettings() {
  elements.actionsPosition.addEventListener('change', () => {
    state.settings.actionsPosition = elements.actionsPosition.value;
    markDirty();
  });
  elements.trigger.addEventListener('change', () => {
    state.settings.trigger = elements.trigger.value;
    markDirty();
  });
  elements.openMethod.addEventListener('change', () => {
    state.settings.openMethod = elements.openMethod.value;
    markDirty();
  });
  elements.columns.addEventListener('change', () => {
    state.settings.columns = clamp(Math.round(Number(elements.columns.value) || 0), MIN_COLUMNS, MAX_COLUMNS);
    elements.columns.value = String(state.settings.columns);
    markDirty();
  });
  elements.theme.addEventListener('change', () => {
    state.settings.theme = elements.theme.value;
    markDirty();
  });
  elements.labels.addEventListener('change', () => {
    state.settings.showLabels = elements.labels.checked;
    markDirty();
  });
  elements.accentBorder.addEventListener('change', () => {
    state.settings.accentBorder = elements.accentBorder.checked;
    markDirty();
  });
  elements.popupSize.addEventListener('change', () => {
    state.settings.popupSize = elements.popupSize.value;
    markDirty();
  });
  elements.popupPosition.addEventListener('change', () => {
    state.settings.popupPosition = elements.popupPosition.value;
    markDirty();
  });
  elements.popupAnimation.addEventListener('change', () => {
    state.settings.popupAnimation = elements.popupAnimation.checked;
    markDirty();
  });
  elements.popupOpacity.addEventListener('input', () => {
    state.settings.popupOpacity = clamp(Number(elements.popupOpacity.value) || 0, 0, 100);
    elements.popupOpacityValue.textContent = `${state.settings.popupOpacity}%`;
    markDirty();
  });
}
