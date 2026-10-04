// Clipboard action implementations: writes the current selection to the clipboard, with an
// HTML serialization for the rich copy. The active selection is injected through
// createClipboardHandlers so the handlers stay independent of the content-script state that
// owns it. Publishes globalThis.__contextPopClipboard for content.js.

(() => {
  if (globalThis.__contextPopClipboard) return;

  /**
   * @param {string} text
   * @returns {Promise<void>}
   */
  async function writeClipboardText(text) {
    await navigator.clipboard.writeText(text);
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
   * Builds the clipboard handlers, reading the active selection through `getSelection`.
   * Keyed by their BUILTIN_ACTION_DEFS id (see actions.js): content.js resolves
   * clipboardHandlers[action.id] when dispatching, so every `kind: 'clipboard'` def needs a
   * matching entry.
   * @param {() => SelectionInfo | null} getSelection
   * @returns {Readonly<Record<string, () => Promise<void>>>}
   */
  function createClipboardHandlers(getSelection) {
    async function copyPlain() {
      await writeClipboardText((getSelection()?.text || '').replace(/\s+/g, ' ').trim());
    }

    async function copyLink() {
      await writeClipboardText(getSelection()?.href || '');
    }

    async function copyRich() {
      const selection = getSelection();
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
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/html': new Blob([html], { type: 'text/html' }),
            'text/plain': new Blob([plain], { type: 'text/plain' }),
          }),
        ]);
        return;
      } catch {
        // Clipboard Item rejected; fall back to a plain-text copy.
      }
      await copyPlain();
    }

    return Object.freeze({ copyRich, copyPlain, copyLink });
  }

  globalThis.__contextPopClipboard = { createClipboardHandlers };
})();
