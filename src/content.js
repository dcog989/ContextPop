(() => {
  const menuApi = globalThis.__contextSmartMenu;
  if (!menuApi) {
    console.error('Context Smart: menu module failed to load');
    return;
  }

  if (globalThis.__contextSmartInitialized) return;
  globalThis.__contextSmartInitialized = true;

  const { openMenu, closeMenu, isMenuOpen, menuState } = menuApi;
  const api = globalThis.browser ?? globalThis.chrome;

  const contentState = {
    settings: null,
    engines: [],
    rightHoldTimer: null,
    suppressMouseUp: false,
  };

  function request(message) {
    return api.runtime.sendMessage(message).then((response) => {
      if (response?.error) throw new Error(response.error);
      return response?.data;
    });
  }

  async function loadConfig() {
    try {
      const [settings, engines] = await Promise.all([
        request({ type: 'getSettings' }),
        request({ type: 'getEngines' }),
      ]);
      contentState.settings = settings;
      contentState.engines = engines;
    } catch (error) {
      console.error('Context Smart: failed to load config', error);
    }
  }

  function isEditableElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  function readSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    const rect = selection.getRangeAt(0).getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    return { text, rect };
  }

  function triggerMatches(event) {
    switch (contentState.settings?.trigger ?? 'mouseup') {
      case 'alt':
        return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      case 'ctrl':
        return event.ctrlKey || event.metaKey;
      case 'shift':
        return event.shiftKey;
      default:
        return true;
    }
  }

  function showMenu(info) {
    openMenu({
      text: info.text,
      rect: info.rect,
      engines: contentState.engines,
      settings: contentState.settings ?? {},
    });
  }

  function handleMouseUp(event) {
    if (event.button !== 0) return;

    if (contentState.suppressMouseUp) {
      contentState.suppressMouseUp = false;
      return;
    }

    if (isMenuOpen()) return;
    if ((contentState.settings?.trigger ?? 'mouseup') === 'rightHold') return;
    if (!triggerMatches(event)) return;
    if (event.composedPath().includes(menuState.host)) return;
    if (isEditableElement(event.target)) return;

    const info = readSelection();
    if (info) showMenu(info);
  }

  function handleMouseDown(event) {
    if (isMenuOpen() && !event.composedPath().includes(menuState.host)) {
      closeMenu();
      contentState.suppressMouseUp = true;
    }

    if (event.button !== 2) return;
    if ((contentState.settings?.trigger ?? 'mouseup') !== 'rightHold') return;

    const info = readSelection();
    if (!info) return;
    contentState.rightHoldTimer = setTimeout(() => showMenu(info), 300);
  }

  function clearRightHold() {
    clearTimeout(contentState.rightHoldTimer);
    contentState.rightHoldTimer = null;
  }

  function init() {
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener('mouseup', clearRightHold, true);
    document.addEventListener('selectionchange', clearRightHold);
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') closeMenu({ restoreFocus: true });
      },
      true,
    );
    window.addEventListener('scroll', () => closeMenu(), true);
    window.addEventListener('blur', () => closeMenu());

    loadConfig();
    api.storage.onChanged.addListener((_changes, area) => {
      if (area === 'local') loadConfig();
    });
  }

  init();
})();
