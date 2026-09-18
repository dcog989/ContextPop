const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScripts } = require('./helpers/loadScripts');

const { svgColorIsMonochrome, isMonochromeSvgText, svgDataUrlIsMonochrome } = loadScripts(['iconSvg.js']);

const base64Svg = (svg) => `data:image/svg+xml;base64,${Buffer.from(svg, 'utf8').toString('base64')}`;
const uriSvg = (svg) => `data:image/svg+xml,${encodeURIComponent(svg)}`;

test('svgColorIsMonochrome treats keywords and neutral extremes as monochrome', () => {
  for (const color of ['none', 'transparent', 'currentColor', 'inherit', 'context-fill', 'black', 'white', 'grey']) {
    assert.equal(svgColorIsMonochrome(color), true, color);
  }
  assert.equal(svgColorIsMonochrome('#000'), true);
  assert.equal(svgColorIsMonochrome('#000000'), true);
  assert.equal(svgColorIsMonochrome('#fff'), true);
  assert.equal(svgColorIsMonochrome('#333333'), true);
  assert.equal(svgColorIsMonochrome('rgb(0, 0, 0)'), true);
  assert.equal(svgColorIsMonochrome('rgb(255, 255, 255)'), true);
});

test('svgColorIsMonochrome rejects mid-tones, saturated, and unparsed colors', () => {
  assert.equal(svgColorIsMonochrome('#888888'), false);
  assert.equal(svgColorIsMonochrome('#ff0000'), false);
  assert.equal(svgColorIsMonochrome('#123456'), false);
  assert.equal(svgColorIsMonochrome('rgb(200, 10, 10)'), false);
  assert.equal(svgColorIsMonochrome('rgba(255, 0, 0, 1)'), false);
  assert.equal(svgColorIsMonochrome('url(#grad)'), false);
  assert.equal(svgColorIsMonochrome('var(--accent)'), false);
});

test('isMonochromeSvgText defaults to true only when no colour is declared', () => {
  assert.equal(isMonochromeSvgText('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'), true);
  assert.equal(isMonochromeSvgText('<svg><path fill="currentColor"/></svg>'), true);
  assert.equal(isMonochromeSvgText('<svg><style>.a{fill:#000}</style></svg>'), true);
  assert.equal(isMonochromeSvgText('<svg fill="#f00"></svg>'), false);
  assert.equal(isMonochromeSvgText('<svg><path stroke="rgb(200,10,10)"/></svg>'), false);
  assert.equal(isMonochromeSvgText('<svg><path fill="#000"/><path fill="#f00"/></svg>'), false);
});

test('svgDataUrlIsMonochrome decodes base64 and percent-encoded SVG payloads', () => {
  assert.equal(svgDataUrlIsMonochrome(base64Svg('<svg fill="#000"></svg>')), true);
  assert.equal(svgDataUrlIsMonochrome(base64Svg('<svg fill="#f00"></svg>')), false);
  assert.equal(svgDataUrlIsMonochrome(uriSvg('<svg fill="#000"></svg>')), true);
  assert.equal(svgDataUrlIsMonochrome(uriSvg('<svg fill="#f00"></svg>')), false);
});

test('svgDataUrlIsMonochrome rejects non-SVG data URLs and undecodable payloads', () => {
  assert.equal(svgDataUrlIsMonochrome(undefined), false);
  assert.equal(svgDataUrlIsMonochrome('data:image/png;base64,AAAA'), false);
  assert.equal(svgDataUrlIsMonochrome('https://example.com/favicon.svg'), false);
  assert.equal(svgDataUrlIsMonochrome('data:image/svg+xml;base64,!!!!'), false);
});
