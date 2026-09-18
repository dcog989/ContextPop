const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const SRC_DIR = path.resolve(__dirname, '..', '..', 'src');

/**
 * Evaluates the given `src/*.js` files in one fresh VM context so their bare-name
 * globals are shared exactly as the browser loads them. Returns the context; its
 * top-level `var`/`function` bindings are readable as properties.
 *
 * Results created inside the context belong to another realm, so copy objects and
 * arrays with `structuredClone` before `assert.deepStrictEqual`. Primitives are safe
 * to compare directly.
 * @param {string[]} files
 * @param {Record<string, unknown>} [globals]
 * @returns {any}
 */
function loadScripts(files, globals = {}) {
  const sandbox = {
    console,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto: globalThis.crypto,
    setTimeout,
    clearTimeout,
    queueMicrotask,
    ...globals,
  };
  const context = vm.createContext(sandbox);
  const source = files.map((file) => fs.readFileSync(path.join(SRC_DIR, file), 'utf8')).join('\n;\n');
  vm.runInContext(source, context, { filename: files.join(' + ') });
  return context;
}

module.exports = { loadScripts };
