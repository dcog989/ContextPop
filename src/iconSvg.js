// SVG monochrome detection: decide whether a favicon should be masked and tinted to the
// accent rather than displayed in its own colors. Pure string analysis, shared with the
// DOM renderer in iconRender.js.

var SVG_COLOR_PATTERN = /\b(?:fill|stroke|stop-color|color)\s*[:=]\s*["']?\s*([^"';\s>)}]+)/gi;
var MONOCHROME_SVG_COLORS = new Set([
  'none',
  'transparent',
  'currentcolor',
  'inherit',
  'context-fill',
  'context-stroke',
  'black',
  'white',
  'gray',
  'grey',
]);

/**
 * @param {string} value
 * @returns {boolean}
 */
function svgColorIsMonochrome(value) {
  const color = String(value).trim().toLowerCase();
  if (MONOCHROME_SVG_COLORS.has(color)) return true;
  let red;
  let green;
  let blue;
  const shortHex = color.match(/^#([0-9a-f]{3})$/);
  const longHex = color.match(/^#([0-9a-f]{6})$/);
  const rgb = color.match(/^rgba?\(([^)]+)\)$/);
  if (shortHex) {
    red = Number.parseInt(shortHex[1][0] + shortHex[1][0], 16);
    green = Number.parseInt(shortHex[1][1] + shortHex[1][1], 16);
    blue = Number.parseInt(shortHex[1][2] + shortHex[1][2], 16);
  } else if (longHex) {
    red = Number.parseInt(longHex[1].slice(0, 2), 16);
    green = Number.parseInt(longHex[1].slice(2, 4), 16);
    blue = Number.parseInt(longHex[1].slice(4, 6), 16);
  } else if (rgb) {
    [red, green, blue] = rgb[1].split(',').map((part) => Number.parseFloat(part));
  } else {
    return false;
  }
  if (![red, green, blue].every(Number.isFinite)) return false;
  const max = Math.max(red, green, blue);
  const min = Math.min(red, green, blue);
  const lightness = (max + min) / 510;
  const saturation = max === min ? 0 : (max - min) / (lightness < 0.5 ? max + min : 510 - max - min);
  return saturation < 0.25 && (lightness < 0.3 || lightness > 0.7);
}

/**
 * @param {string} text
 * @returns {boolean}
 */
function isMonochromeSvgText(text) {
  for (const match of text.matchAll(SVG_COLOR_PATTERN)) {
    if (!svgColorIsMonochrome(match[1])) return false;
  }
  return true;
}

/**
 * @param {string} dataUrl
 * @returns {boolean}
 */
function svgDataUrlIsMonochrome(dataUrl) {
  if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/svg+xml')) return false;
  try {
    const comma = dataUrl.indexOf(',');
    const meta = dataUrl.slice(0, comma);
    const payload = dataUrl.slice(comma + 1);
    const text = /;base64/i.test(meta) ? atob(payload) : decodeURIComponent(payload);
    return isMonochromeSvgText(text);
  } catch {
    return false;
  }
}
