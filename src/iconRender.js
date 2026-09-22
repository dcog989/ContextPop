// DOM rendering of engine and action icons. Requires a document, so this module is loaded
// by the content scripts and the options page but not by the background service worker.

/**
 * @param {string | null | undefined} markup
 * @returns {Node | null}
 */
function createSvgIcon(markup) {
  if (typeof markup !== 'string' || markup.length === 0) return null;
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root?.nodeName !== 'svg') return null;
  return document.importNode(root, true);
}

/**
 * @param {{ prefix: string, name: string }} options
 * @returns {{ element: HTMLElement, setSource: (source: string | null | undefined) => void }}
 */
function createFaviconIcon({ prefix, name }) {
  const wrapper = document.createElement('span');
  const mask = document.createElement('span');
  mask.className = `${prefix}-mask`;
  mask.hidden = true;
  const fallback = document.createElement('span');
  fallback.className = `${prefix}-letter`;
  fallback.textContent = (name || '?').trim().charAt(0).toUpperCase();
  const img = document.createElement('img');
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.hidden = true;
  img.addEventListener('error', () => {
    img.hidden = true;
    fallback.hidden = false;
  });

  /**
   * @param {string | null | undefined} source
   */
  const setSource = (source) => {
    if (!source || !wrapper.isConnected) return;
    if (svgDataUrlIsMonochrome(source)) {
      mask.style.webkitMaskImage = `url("${source}")`;
      mask.style.maskImage = `url("${source}")`;
      mask.hidden = false;
      img.hidden = true;
    } else {
      img.src = source;
      img.hidden = false;
      mask.hidden = true;
    }
    fallback.hidden = true;
  };

  wrapper.append(img, mask, fallback);
  return { element: wrapper, setSource };
}

/**
 * Favicon icon wrapped with the context's `<prefix>-icon` class; the shared shape used by
 * both the popup engine tiles and the options-page engine rows.
 * @param {Engine} engine
 * @param {string} prefix
 * @returns {{ element: HTMLElement, setSource: (source: string | null | undefined) => void }}
 */
function createFaviconTileIcon(engine, prefix) {
  const { element, setSource } = createFaviconIcon({ prefix, name: engine.name });
  element.className = `${prefix}-icon`;
  return { element, setSource };
}

/**
 * Applies an already-fetched icon map to the engine tiles. Pure rendering: callers own
 * the background request so this module stays free of messaging.
 * @param {Map<string, (source: string | null | undefined) => void>} iconSetters
 * @param {Engine[]} engines
 * @param {Record<string, string>} icons
 */
function applyEngineIcons(iconSetters, engines, icons) {
  for (const engine of engines) {
    const setIcon = iconSetters.get(engine.id);
    if (setIcon) setIcon(icons[engine.id] || engine.icon);
  }
}
