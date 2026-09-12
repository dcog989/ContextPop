(() => {
  const menuApi = globalThis.__contextPopMenu;
  if (!menuApi) {
    console.error('ContextPop: menu module failed to load');
    return;
  }

  if (globalThis.__contextPopInitialized) return;
  globalThis.__contextPopInitialized = true;

  const { openMenu, closeMenu, isMenuOpen, menuState } = menuApi;
  const api = globalThis.browser ?? globalThis.chrome;

  const contentState = {
    settings: null,
    engines: [],
    selection: null,
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
      console.error('ContextPop: failed to load config', error);
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

  function findAnchor(node) {
    let element = node?.nodeType === Node.ELEMENT_NODE ? node : node?.parentElement;
    while (element && element !== document.documentElement) {
      if (element.tagName === 'A' && element.href) return element;
      element = element.parentElement;
    }
    return null;
  }

  function isHttpUrl(value) {
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  function serializeSelection(range) {
    const container = document.createElement('div');
    container.appendChild(range.cloneContents());
    return container.innerHTML;
  }

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
      linkText: anchor ? anchor.textContent.trim() : '',
    };
  }

  function classify(info) {
    if (info.href) return 'link';
    if (/^\S+$/.test(info.text)) return 'word';
    return 'text';
  }

  function handleMenuClose(reason) {
    if (reason === 'escape' || reason === 'replace') return;
    contentState.selection = null;
    const selection = window.getSelection();
    if (selection) selection.removeAllRanges();
  }

  function buildActivation() {
    const info = readSelection();
    if (!info) return null;
    return { ...info, context: classify(info) };
  }

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

  async function writeClipboardText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      fallbackCopy(text);
    }
  }

  async function copyPlain() {
    await writeClipboardText((contentState.selection?.text || '').replace(/\s+/g, ' ').trim());
  }

  async function copyLink() {
    await writeClipboardText(contentState.selection?.href || '');
  }

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

  function showMenu(info, event) {
    contentState.selection = info;
    openMenu({
      text: info.text,
      html: info.html,
      context: info.context,
      href: info.href,
      linkText: info.linkText,
      rect: info.rect,
      point: event ? { x: event.clientX, y: event.clientY } : null,
      engines: contentState.engines,
      settings: contentState.settings ?? defaultSettings(),
      handlers: { copyRich, copyPlain, copyLink },
      onClose: handleMenuClose,
    });
  }

  function handleMouseUp(event) {
    if (event.button !== 0) return;

    if (contentState.suppressMouseUp) {
      contentState.suppressMouseUp = false;
      return;
    }

    if (isMenuOpen()) return;
    if (!triggerMatches(event)) return;
    if (event.composedPath().includes(menuState.host)) return;
    if (isEditableElement(event.target)) return;

    const info = buildActivation();
    if (info) showMenu(info, event);
  }

  function handleMouseDown(event) {
    if (isMenuOpen() && !event.composedPath().includes(menuState.host)) {
      closeMenu({ reason: 'outside' });
      contentState.suppressMouseUp = true;
    }
  }

  function init() {
    document.addEventListener('mouseup', handleMouseUp, true);
    document.addEventListener('mousedown', handleMouseDown, true);
    document.addEventListener(
      'keydown',
      (event) => {
        if (event.key === 'Escape') closeMenu({ restoreFocus: true, reason: 'escape' });
      },
      true,
    );
    window.addEventListener('scroll', () => closeMenu({ reason: 'scroll' }), true);
    window.addEventListener('blur', () => closeMenu({ reason: 'blur' }));

    loadConfig();
    api.storage.onChanged.addListener((changes, area) => {
      if (area !== 'local') return;
      if (changes[STORAGE_KEYS.settings] || changes[STORAGE_KEYS.engines]) loadConfig();
    });
  }

  init();
})();
