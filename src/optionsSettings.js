// Preferences form: reflect settings into the controls and persist each change to `state`.

/** @type {ReadonlyArray<{ el: HTMLElement, key: string, event?: string, read: (el: any) => any, write: (el: any, value: any) => void, after?: () => void }>} */
const SETTINGS_CONTROLS = [
  { el: elements.actionsPosition, key: 'actionsPosition', read: (el) => el.value, write: (el, value) => (el.value = value) },
  { el: elements.trigger, key: 'trigger', read: (el) => el.value, write: (el, value) => (el.value = value) },
  { el: elements.openMethod, key: 'openMethod', read: (el) => el.value, write: (el, value) => (el.value = value) },
  {
    el: elements.columns,
    key: 'columns',
    read: (el) => clampInt(el.value, MIN_COLUMNS, MAX_COLUMNS, DEFAULT_SETTINGS.columns),
    write: (el, value) => (el.value = String(value)),
  },
  { el: elements.theme, key: 'theme', read: (el) => el.value, write: (el, value) => (el.value = value) },
  { el: elements.labels, key: 'showLabels', read: (el) => el.checked, write: (el, value) => (el.checked = Boolean(value)) },
  {
    el: elements.accentBorder,
    key: 'accentBorder',
    read: (el) => el.checked,
    write: (el, value) => (el.checked = Boolean(value)),
  },
  { el: elements.popupSize, key: 'popupSize', read: (el) => el.value, write: (el, value) => (el.value = value) },
  {
    el: elements.popupPosition,
    key: 'popupPosition',
    read: (el) => el.value,
    write: (el, value) => (el.value = value),
  },
  {
    el: elements.popupAnimation,
    key: 'popupAnimation',
    read: (el) => el.checked,
    write: (el, value) => (el.checked = Boolean(value)),
  },
  {
    el: elements.popupOpacity,
    key: 'popupOpacity',
    event: 'input',
    read: (el) => clampInt(el.value, 0, 100, DEFAULT_SETTINGS.popupOpacity),
    write: (el, value) => (el.value = String(value)),
    after: () => (elements.popupOpacityValue.textContent = `${state.settings.popupOpacity}%`),
  },
];

function renderSettings() {
  for (const control of SETTINGS_CONTROLS) {
    control.write(control.el, state.settings[control.key]);
  }
  elements.popupOpacityValue.textContent = `${state.settings.popupOpacity}%`;
}

function bindSettings() {
  for (const control of SETTINGS_CONTROLS) {
    control.el.addEventListener(control.event ?? 'change', () => {
      state.settings[control.key] = control.read(control.el);
      if (control.after) control.after();
      markDirty(STORAGE_KEYS.settings);
    });
  }
}
