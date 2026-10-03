(() => {
  const menuApi = globalThis.__contextPopMenu;
  if (!menuApi) {
    console.error('ContextPop: menu module failed to load');
    return;
  }

  const clipboardApi = globalThis.__contextPopClipboard;
  if (!clipboardApi) {
    console.error('ContextPop: clipboard module failed to load');
    return;
  }

  if (globalThis.__contextPopInitialized) return;
  globalThis.__contextPopInitialized = true;

  const { openMenu, closeMenu, isMenuOpen, isEventInsideMenu } = menuApi;
  const api = globalThis.browser;

  /** @type {{ settings: Settings | null, engines: Engine[], selection: SelectionInfo | null }} */
  const contentState = {
    settings: null,
    engines: [],
    selection: null,
  };

  const clipboardHandlers = clipboardApi.createClipboardHandlers(() => contentState.selection);

  // Reads config straight from storage (already injected into this frame) instead of
  // messaging the background, so page/iframe loads never wake the event page. Loaded on
  // the first valid selection and cached until the storage onChanged listener invalidates.
  async function ensureConfig() {
    if (contentState.settings) return;
    try {
      const result = await api.storage.local.get([STORAGE_KEYS.settings, STORAGE_KEYS.engines]);
      contentState.settings = normalizeSettings(result[STORAGE_KEYS.settings]);
      const stored = result[STORAGE_KEYS.engines];
      const engines = Array.isArray(stored) ? stored.map(normalizeEngine) : defaultEngineList();
      contentState.engines = filterUsableEngines(engines);
    } catch (error) {
      console.error('ContextPop: failed to load config', error);
      contentState.settings = defaultSettings();
      contentState.engines = filterUsableEngines(defaultEngineList());
    }
  }

  /**
   * @param {any} element
   * @returns {boolean}
   */
  function isEditableElement(element) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return false;
    return (
      element.tagName === 'INPUT' ||
      element.tagName === 'TEXTAREA' ||
      element.tagName === 'SELECT' ||
      element.isContentEditable
    );
  }

  /**
   * @param {Node} node
   * @param {Range} range
   * @returns {HTMLAnchorElement | null}
   */
  function findAnchor(node, range) {
    let element = /** @type {Element | null} */ (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement);
    while (element && element !== document.documentElement) {
      if (
        element.tagName === 'A' &&
        /** @type {HTMLAnchorElement} */ (element).href &&
        element.contains(range.startContainer) &&
        element.contains(range.endContainer)
      ) {
        return /** @type {HTMLAnchorElement} */ (element);
      }
      element = element.parentElement;
    }
    return null;
  }

  /**
   * @returns {SelectionInfo | null}
   */
  function readSelection() {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || !selection.rangeCount) return null;

    const text = selection.toString().trim();
    if (!text) return null;

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || (rect.width === 0 && rect.height === 0)) return null;

    const anchor =
      findAnchor(range.commonAncestorContainer, range) ||
      findAnchor(range.startContainer, range) ||
      findAnchor(range.endContainer, range);
    const anchorHref = anchor?.href && isHttpUrl(anchor.href) ? anchor.href : '';

    const ranges = Array.from({ length: selection.rangeCount }, (_, index) => selection.getRangeAt(index).cloneRange());

    return {
      text,
      rect,
      ranges,
      href: anchorHref || normalizeHttpUrl(text),
    };
  }

  /**
   * @param {SelectionInfo} info
   * @returns {string[]}
   */
  function classify(info) {
    const isWord = /^\S+$/.test(info.text);
    if (info.href) return isWord ? ['link', 'word'] : ['link', 'text'];
    return isWord ? ['word'] : ['text'];
  }

  /**
   * @param {string} reason
   */
  function handleMenuClose(reason) {
    if (reason === 'escape' || reason === 'replace' || reason === 'scroll' || reason === 'blur') return;
    contentState.selection = null;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  /**
   * @returns {(SelectionInfo & { contexts: string[] }) | null}
   */
  function buildActivation() {
    const info = readSelection();
    if (!info) return null;
    return { ...info, contexts: classify(info) };
  }

  /**
   * @param {MouseEvent} event
   * @returns {boolean}
   */
  function triggerMatches(event) {
    switch (contentState.settings?.trigger ?? TRIGGER.mouseup) {
      case TRIGGER.alt:
        return event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey;
      case TRIGGER.ctrl:
        return event.ctrlKey || event.metaKey;
      case TRIGGER.shift:
        return event.shiftKey;
      default:
        return true;
    }
  }

  /**
   * @param {SelectionInfo & { contexts: string[] }} info
   * @param {MouseEvent | null} event
   */
  function showMenu(info, event) {
    contentState.selection = info;
    openMenu({
      text: info.text,
      contexts: info.contexts,
      href: info.href,
      rect: info.rect,
      point: event ? { x: event.clientX, y: event.clientY } : null,
      engines: contentState.engines.filter((engine) => engine.enabled !== false),
      settings: contentState.settings ?? defaultSettings(),
      handlers: clipboardHandlers,
      onClose: handleMenuClose,
    });
  }

  /**
   * @param {MouseEvent} event
   */
  async function handleMouseUp(event) {
    if (event.button !== 0) return;

    if (isMenuOpen()) return;
    if (isEventInsideMenu(event)) return;
    if (isEditableElement(event.composedPath()[0])) return;

    const info = buildActivation();
    if (!info) return;

    // Config is only needed once there is a real selection, so defer the storage read
    // until here rather than on every frame load.
    await ensureConfig();
    if (!triggerMatches(event)) return;

    showMenu(info, event);
  }

  /**
   * @param {MouseEvent} event
   */
  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (isMenuOpen() && !isEventInsideMenu(event)) {
      closeMenu({ reason: 'outside' });
    }
  }

  function init() {
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener(
      'keydown',
      /** @param {KeyboardEvent} event */ (event) => {
        if (event.key === 'Escape') closeMenu({ restoreFocus: true, reason: 'escape' });
      },
      true,
    );
    window.addEventListener(
      'scroll',
      /** @param {Event} event */ (event) => {
        const target = event.target;
        if (target === document || target === window || target === document.documentElement) {
          closeMenu({ reason: 'scroll' });
        }
      },
      { capture: true, passive: true },
    );
    window.addEventListener('blur', () => closeMenu({ reason: 'blur' }));

    api.storage.onChanged.addListener((/** @type {any} */ changes, /** @type {string} */ area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.settings] || changes[STORAGE_KEYS.engines]) {
        contentState.settings = null;
        contentState.engines = [];
      }
      // Engine edits change the id set the icon map is keyed by; resolved icons arrive as
      // icon:* writes. Both must drop the frame's cached map.
      if (changes[STORAGE_KEYS.engines] || Object.keys(changes).some((key) => key.startsWith(ICON_CACHE_PREFIX))) {
        menuApi.invalidateIcons();
      }
    });
  }

  init();
})();
