(() => {
  const menuApi = globalThis.__contextPopMenu;
  if (!menuApi) {
    console.error('ContextPop: menu module failed to load');
    return;
  }

  if (globalThis.__contextPopInitialized) return;
  globalThis.__contextPopInitialized = true;

  const { openMenu, closeMenu, isMenuOpen, isEventInsideMenu } = menuApi;
  const api = globalThis.browser ?? globalThis.chrome;

  /** @type {{ settings: Settings | null, engines: Engine[], selection: SelectionInfo | null, suppressMouseUp: boolean }} */
  const contentState = {
    settings: null,
    engines: [],
    selection: null,
    suppressMouseUp: false,
  };

  async function loadConfig() {
    try {
      const [settings, engines] = await Promise.all([
        sendMessage({ type: 'getSettings' }),
        sendMessage({ type: 'getEngines' }),
      ]);
      contentState.settings = settings;
      contentState.engines = engines;
    } catch (error) {
      console.error('ContextPop: failed to load config', error);
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
   * @returns {HTMLAnchorElement | null}
   */
  function findAnchor(node) {
    let element = /** @type {Element | null} */ (node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement);
    while (element && element !== document.documentElement) {
      if (element.tagName === 'A' && /** @type {HTMLAnchorElement} */ (element).href) {
        return /** @type {HTMLAnchorElement} */ (element);
      }
      element = element.parentElement;
    }
    return null;
  }

  /**
   * @param {Range} range
   * @returns {string}
   */
  function serializeSelection(range) {
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    return container.innerHTML;
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
      findAnchor(range.commonAncestorContainer) || findAnchor(range.startContainer) || findAnchor(range.endContainer);
    const anchorHref = anchor?.href && isHttpUrl(anchor.href) ? anchor.href : '';

    return {
      text,
      rect,
      html: serializeSelection(range),
      href: anchorHref || (isHttpUrl(text) ? text : ''),
    };
  }

  /**
   * @param {SelectionInfo} info
   * @returns {string}
   */
  function classify(info) {
    if (info.href) return 'link';
    if (/^\S+$/.test(info.text)) return 'word';
    return 'text';
  }

  /**
   * @param {string} reason
   */
  function handleMenuClose(reason) {
    if (reason === 'escape' || reason === 'replace') return;
    contentState.selection = null;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  /**
   * @returns {(SelectionInfo & { context: string }) | null}
   */
  function buildActivation() {
    const info = readSelection();
    if (!info) return null;
    return { ...info, context: classify(info) };
  }

  /**
   * @param {string} text
   */
  function fallbackCopy(text) {
    const container = document.body || document.documentElement;
    if (!container) throw new Error('Copy failed');
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.top = '-1000px';
    area.style.opacity = '0';
    container.appendChild(area);
    area.select();

    let copied = false;
    try {
      copied = document.execCommand('copy');
    } catch {
      copied = false;
    }
    area.remove();

    if (!copied) throw new Error('Copy failed');
  }

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  async function writeClipboardText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
  }

  /**
   * @returns {Promise<void>}
   */
  async function copyPlain() {
    await writeClipboardText((contentState.selection?.text || '').replace(/\s+/g, ' ').trim());
  }

  /**
   * @returns {Promise<void>}
   */
  async function copyLink() {
    await writeClipboardText(contentState.selection?.href || '');
  }

  /**
   * @returns {Promise<void>}
   */
  async function copyRich() {
    const plain = contentState.selection?.text || '';
    const html = contentState.selection?.html?.trim() ? contentState.selection.html : plain;
    try {
      if (navigator.clipboard?.write && globalThis.ClipboardItem) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
        return;
      }
    } catch {
      // Clipboard Item unavailable or rejected; fall back to a plain-text copy.
    }
    await copyPlain();
  }

  // Clipboard action implementations, keyed by their BUILTIN_ACTION_DEFS id (see actions.js).
  // dispatchAction resolves menuState.handlers[action.id], so every `kind: 'clipboard'` def needs
  // a matching entry here; a missing key now throws in menu.js instead of silently no-opping.
  /** @type {Readonly<Record<string, () => Promise<void>>>} */
  const CLIPBOARD_HANDLERS = Object.freeze({ copyRich, copyPlain, copyLink });

  /**
   * @param {MouseEvent} event
   * @returns {boolean}
   */
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

  /**
   * @param {SelectionInfo & { context: string }} info
   * @param {MouseEvent | null} event
   */
  function showMenu(info, event) {
    contentState.selection = info;
    openMenu({
      text: info.text,
      html: info.html,
      context: info.context,
      href: info.href,
      rect: info.rect,
      point: event ? { x: event.clientX, y: event.clientY } : null,
      engines: contentState.engines.filter((engine) => engine.enabled !== false),
      settings: contentState.settings ?? defaultSettings(),
      handlers: CLIPBOARD_HANDLERS,
      onClose: handleMenuClose,
    });
  }

  /**
   * @param {MouseEvent} event
   */
  function handleMouseUp(event) {
    if (event.button !== 0) return;

    if (contentState.suppressMouseUp) {
      contentState.suppressMouseUp = false;
      return;
    }

    if (isMenuOpen()) return;
    if (!triggerMatches(event)) return;
    if (isEventInsideMenu(event)) return;
    if (isEditableElement(event.target)) return;

    const info = buildActivation();
    if (info) showMenu(info, event);
  }

  /**
   * @param {MouseEvent} event
   */
  function handleMouseDown(event) {
    if (event.button !== 0) return;
    if (isMenuOpen() && !isEventInsideMenu(event)) {
      closeMenu({ reason: 'outside' });
      contentState.suppressMouseUp = true;
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
    window.addEventListener('scroll', () => closeMenu({ reason: 'scroll' }), true);
    window.addEventListener('blur', () => closeMenu({ reason: 'blur' }));

    loadConfig();
    api.storage.onChanged.addListener((/** @type {any} */ changes, /** @type {string} */ area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.settings] || changes[STORAGE_KEYS.engines]) loadConfig();
    });
  }

  init();
})();
