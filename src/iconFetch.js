// Network retrieval of favicons, site markup, and web-app manifests, plus byte-to-data-URL
// encoding. Runs wherever fetch is available (service worker, content script, options page).
// Candidate parsing lives in iconParse.js.

var MAX_ICON_BYTES = 256 * 1024;
var MAX_MARKUP_BYTES = 512 * 1024;
var ICON_FETCH_TIMEOUT_MS = 4000;
var BASE64_CHUNK_SIZE = 0x8000;

function arrayBufferToDataUrl(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

async function fetchImage(url) {
  if (!url) return { dataUrl: null, definitive: false };
  if (url.startsWith('data:')) return { dataUrl: url, definitive: true };
  if (!HTTP_URL_PATTERN.test(url)) return { dataUrl: null, definitive: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    const declaredLength = Number(response.headers.get('content-length') || 0);
    const withinLimit = !declaredLength || declaredLength <= MAX_ICON_BYTES;
    if (response.ok && contentType.startsWith('image/') && withinLimit) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength <= MAX_ICON_BYTES) {
        return { dataUrl: arrayBufferToDataUrl(buffer, contentType), definitive: true };
      }
      return { dataUrl: null, definitive: true };
    }
    return { dataUrl: null, definitive: response.status >= 400 && response.status < 500 };
  } catch {
    return { dataUrl: null, definitive: false };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchMarkup(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) {
      return { markup: null, baseUrl: url, definitive: response.status >= 400 && response.status < 500 };
    }
    const reader = response.body?.getReader();
    if (!reader) {
      const text = await response.text();
      return { markup: text.slice(0, MAX_MARKUP_BYTES), baseUrl: response.url || url, definitive: true };
    }
    const decoder = new TextDecoder();
    let received = 0;
    let markup = '';
    while (received < MAX_MARKUP_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      markup += decoder.decode(value, { stream: true });
      if (markup.includes('</head>')) break;
    }
    reader.cancel().catch(() => {});
    return { markup, baseUrl: response.url || url, definitive: true };
  } catch {
    return { markup: null, baseUrl: url, definitive: false };
  } finally {
    clearTimeout(timer);
  }
}

async function fetchManifestIcons(manifestUrl) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(manifestUrl, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    if (!response.ok) return [];
    const data = await response.json();
    const icons = Array.isArray(data?.icons) ? data.icons : [];
    const candidates = [];
    for (const icon of icons) {
      if (typeof icon?.src !== 'string' || !icon.src) continue;
      const purpose = String(icon.purpose || '').toLowerCase();
      if (purpose.includes('monochrome') || purpose.includes('maskable')) continue;
      try {
        candidates.push({
          url: new URL(icon.src, manifestUrl).href,
          vector: isVectorIcon(icon, icon.src),
          size: iconSize(icon),
        });
      } catch {
        // Ignore icons with unresolvable src.
      }
    }
    return candidates;
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}
