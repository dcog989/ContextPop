// Network retrieval of favicons, site markup, and web-app manifests, plus byte-to-data-URL
// encoding. Runs wherever fetch is available (service worker, content script, options page).
// Candidate parsing lives in iconParse.js.

var MAX_ICON_BYTES = 256 * 1024;
var MAX_MARKUP_BYTES = 512 * 1024;
var ICON_FETCH_TIMEOUT_MS = 4000;
var BASE64_CHUNK_SIZE = 0x8000;
var ICON_TARGET_SIZE_PX = 64;

/**
 * @param {ArrayBuffer} buffer
 * @param {string} contentType
 * @returns {string}
 */
function arrayBufferToDataUrl(buffer, contentType) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i += BASE64_CHUNK_SIZE) {
    binary += String.fromCharCode(...bytes.subarray(i, i + BASE64_CHUNK_SIZE));
  }
  return `data:${contentType};base64,${btoa(binary)}`;
}

/**
 * Best-effort raster downscale to ICON_TARGET_SIZE_PX, re-encoded as PNG for a ~26-50 px
 * display slot. Returns null when the source is already small enough, is a vector (the
 * caller keeps it intact for monochrome masking), or cannot be decoded (e.g. some .ico),
 * so the caller falls back to the original bytes.
 * @param {ArrayBuffer} buffer
 * @param {string} contentType
 * @returns {Promise<string | null>}
 */
async function downscaleImageToDataUrl(buffer, contentType) {
  if (contentType === 'image/svg+xml') return null;
  try {
    const bitmap = await createImageBitmap(new Blob([buffer], { type: contentType }));
    try {
      const longest = Math.max(bitmap.width, bitmap.height);
      if (longest <= ICON_TARGET_SIZE_PX) return null;
      const scale = ICON_TARGET_SIZE_PX / longest;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) return null;
      context.drawImage(bitmap, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/png' });
      return arrayBufferToDataUrl(await blob.arrayBuffer(), 'image/png');
    } finally {
      bitmap.close();
    }
  } catch {
    return null;
  }
}

/**
 * Fetch with the shared no-referrer/omit-credentials policy under the icon timeout. The
 * timeout stays armed while `consume` reads the body (e.g. streaming markup), aborting a
 * stalled reader.
 * @template T
 * @param {string} url
 * @param {(response: Response) => Promise<T>} consume
 * @returns {Promise<T>}
 */
async function fetchWithTimeout(url, consume) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ICON_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      signal: controller.signal,
    });
    return await consume(response);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {string} url
 * @returns {Promise<FetchResult>}
 */
async function fetchImage(url) {
  if (!url) return { dataUrl: null, definitive: false };
  if (url.startsWith('data:')) return { dataUrl: url, definitive: true };
  if (!isHttpUrl(url)) return { dataUrl: null, definitive: true };

  try {
    return await fetchWithTimeout(url, async (response) => {
      const contentType = (response.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
      const declaredLength = Number(response.headers.get('content-length') || 0);
      const withinLimit = !declaredLength || declaredLength <= MAX_ICON_BYTES;
      if (response.ok && contentType.startsWith('image/') && withinLimit) {
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength <= MAX_ICON_BYTES) {
          const downscaled = await downscaleImageToDataUrl(buffer, contentType);
          return { dataUrl: downscaled ?? arrayBufferToDataUrl(buffer, contentType), definitive: true };
        }
        return { dataUrl: null, definitive: true };
      }
      // Any non-image 2xx (e.g. an SPA catch-all serving HTML for /favicon.ico) is a
      // definitive "no icon here"; only 5xx/transient failures should be retried later.
      return { dataUrl: null, definitive: response.status < 500 };
    });
  } catch {
    return { dataUrl: null, definitive: false };
  }
}

/**
 * @param {string} url
 * @returns {Promise<MenuContent>}
 */
async function fetchMarkup(url) {
  try {
    return await fetchWithTimeout(url, async (response) => {
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
    });
  } catch {
    return { markup: null, baseUrl: url, definitive: false };
  }
}

/**
 * @param {string} manifestUrl
 * @returns {Promise<IconCandidate[]>}
 */
async function fetchManifestIcons(manifestUrl) {
  try {
    return await fetchWithTimeout(manifestUrl, async (response) => {
      if (!response.ok) return [];
      const data = await response.json();
      const icons = Array.isArray(data?.icons) ? data.icons : [];
      /** @type {IconCandidate[]} */
      const candidates = [];
      for (const icon of icons) {
        if (typeof icon?.src !== 'string' || !icon.src) continue;
        const purpose = String(icon.purpose || '').toLowerCase();
        if (purpose.includes('monochrome') || purpose.includes('maskable')) continue;
        try {
          candidates.push({
            url: new URL(icon.src, manifestUrl).href,
            vector: isVectorIcon(icon.type, icon.src),
            size: iconSize(icon.sizes),
          });
        } catch {
          // Ignore icons with unresolvable src.
        }
      }
      return candidates;
    });
  } catch {
    return [];
  }
}
