// DOM rendering of engine and action icons. Requires a document, so this module is loaded
// by the content scripts and the options page but not by the background service worker.

function createSvgIcon(markup) {
  if (typeof markup !== 'string' || markup.length === 0) return null;
  const parsed = new DOMParser().parseFromString(markup, 'image/svg+xml');
  const root = parsed.documentElement;
  if (root?.nodeName !== 'svg') return null;
  return document.importNode(root, true);
}

function createFaviconIcon({ prefix, label }) {
  const wrapper = document.createElement('span');
  const mask = document.createElement('span');
  mask.className = `${prefix}-mask`;
  mask.hidden = true;
  const fallback = document.createElement('span');
  fallback.className = `${prefix}-letter`;
  fallback.textContent = label;
  const img = document.createElement('img');
  img.alt = '';
  img.referrerPolicy = 'no-referrer';
  img.hidden = true;
  img.addEventListener('error', () => {
    img.hidden = true;
    fallback.hidden = false;
  });

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

async function applyEngineIcons(iconSetters, engines) {
  if (!engines.length) return;

  let icons = {};
  try {
    const response = await api.runtime.sendMessage({ type: 'getIcons' });
    if (response?.error) throw new Error(response.error);
    icons = response?.data || {};
  } catch {
    icons = {};
  }

  for (const engine of engines) {
    const setIcon = iconSetters.get(engine.id);
    if (setIcon) setIcon(icons[engine.id] || engine.icon);
  }
}
