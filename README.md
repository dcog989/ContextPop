# Context Smart

Launches a customizable popup when text is selected. Provides instant access to search engines, copy to clipboard, dictionary / thesaurus lookup, open link in new tab, etc..

## Features

- Popup tile grid on text selection, keyboard navigable (arrows, Home/End, Tab, Escape)
- Built-in actions: copy (rich or plain), open link, define, thesaurus, and search with the browser default
- Search engines, with a configurable Actions-before/after-engines group order
- Context-aware actions: copy, open link, define, and thesaurus apply to the selections they suit (`text`, `word`, `link`)
- Manage engines (name, template, result view, optional icon); engines are offered for any selection
- Import the engines already installed in Firefox; search them through the browser
- Favicon source: the engine's own site, DuckDuckGo's icon service, or none, with a letter fallback
- Open results in a new tab, background tab, current tab, new window, or a popup window
- Shift-click opens a new window; Ctrl/Cmd-click or middle-click opens a background tab
- Light, dark, or system theme
- English UI with a `_locales` bundle ready for translation
- Firefox and Chrome, Manifest V3, no build step

## Install (temporary / unpacked)

### Firefox

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `src/manifest.json`.

### Chrome / Chromium

Chrome only reads a file named `manifest.json`, and `src/manifest.json` is the Firefox manifest. Use the packaging script to produce a ready-to-load directory:

```sh
./scripts/package.sh
```

Then:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select `dist/chrome`.
4. Re-run the script after changes, then click the reload button on the extension card.

## Package

Build zip archives for both stores:

```sh
./scripts/package.sh
```

Outputs `dist/context-smart-firefox.zip` and `dist/context-smart-chrome.zip`. The script uses `zip` when available and falls back to Python's `zipfile`. It also fails if the shared fields in the two manifests drift.

## Development

No install and no build. Dev tooling is the system `biome`, `lefthook`, and `cog` binaries:

```sh
biome check          # lint + format check
biome check --write  # apply fixes
lefthook install     # enable git hooks once per clone
cog bump --auto      # version + changelog; syncs both manifests
```

## Engine template

Each engine has a URL template containing `{searchTerms}`, for example:

```text
https://duckduckgo.com/?q={searchTerms}
```

`{searchTerms}` is replaced with the URL-encoded selected text. Templates must use `http` or `https`.

## Permissions and privacy

- `storage` — engines, actions, and preferences, kept on-device.
- `search` — enumerate and use the browser's installed engines (Firefox import/search, Chrome default search).
- `clipboardWrite` — copy actions.
- Host access to all sites — needed to show the menu wherever you select text.
- Optional host access — requested only when you configure remote icons or favicons.

Remote icons are fetched by the background, preferring the high-resolution icon each site declares, and cached on-device without cookies or a referrer. Use "Refresh icons" in settings to re-fetch them. See [PRIVACY.md](PRIVACY.md).
