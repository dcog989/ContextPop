(() => {
  const menuApi = globalThis.__contextPopMenu;
  if (!menuApi) {
    console.error('ContextPop: menu module failed to load');
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
   * Rewrites relative href/src/srcset URLs to absolute so the serialized markup is
   * self-contained once pasted outside the page.
   * @param {Document} doc
   */
  function absolutizeUrls(doc) {
    for (const element of doc.querySelectorAll('[href], [src], [srcset]')) {
      const href = element.getAttribute('href');
      const src = element.getAttribute('src');
      const srcset = element.getAttribute('srcset');
      if (href != null) {
        try {
          element.setAttribute('href', new URL(href, document.baseURI).href);
        } catch {
          // Leave non-resolvable values (e.g. "#", "javascript:") untouched.
        }
      }
      if (src != null) {
        try {
          element.setAttribute('src', new URL(src, document.baseURI).href);
        } catch {
          // Leave non-resolvable values untouched.
        }
      }
      if (srcset != null) {
        const resolved = srcset
          .split(',')
          .map((candidate) => {
            const [url, ...descriptor] = candidate.trim().split(/\s+/);
            try {
              return [new URL(url, document.baseURI).href, ...descriptor].join(' ');
            } catch {
              return candidate.trim();
            }
          })
          .join(', ');
        element.setAttribute('srcset', resolved);
      }
    }
  }

  /**
   * @param {Range[]} ranges
   * @returns {string}
   */
  function serializeSelection(ranges) {
    const doc = document.implementation.createHTMLDocument('');
    const container = doc.body;
    for (const range of ranges) container.appendChild(doc.importNode(range.cloneContents(), true));
    absolutizeUrls(doc);
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
      findAnchor(range.commonAncestorContainer, range) ||
      findAnchor(range.startContainer, range) ||
      findAnchor(range.endContainer, range);
    const anchorHref = anchor?.href && isHttpUrl(anchor.href) ? anchor.href : '';

    const ranges = Array.from({ length: selection.rangeCount }, (_, index) =>
      selection.getRangeAt(index).cloneRange(),
    );

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
    const selection = contentState.selection;
    const plain = selection?.text || '';
    let html = plain;
    if (selection) {
      try {
        const serialized = serializeSelection(selection.ranges).trim();
        if (serialized) html = serialized;
      } catch {
        // Deferred serialization fails if the selected nodes have since been removed.
      }
    }
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
      handlers: CLIPBOARD_HANDLERS,
      onClose: handleMenuClose,
    });
  }

  /**
   * @param {MouseEvent} event
   */
  function handleMouseUp(event) {
    if (event.button !== 0) return;

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

    loadConfig();
    api.storage.onChanged.addListener((/** @type {any} */ changes, /** @type {string} */ area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.settings] || changes[STORAGE_KEYS.engines]) loadConfig();
    });
  }

  init();
})();
