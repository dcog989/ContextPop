# Context Smart

Context Smart shows a popup of search engines, plus options to copy to clipboard, open in new tab, etc. when text is selected.

## Features

- Popup tile grid on text selection, keyboard navigable (arrows, Home/End, Tab, Escape)
- Manage engines (name, template, optional icon) with import/export
- Open results in a new tab, background tab, current tab, or new window
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

- `storage` — engines and preferences, kept on-device.
- Host access to all sites — needed to show the menu wherever you select text.
- Optional host access — requested only when you configure a remote icon URL.

Remote icons are fetched by the background and cached for the session, without cookies or a referrer. See [PRIVACY.md](PRIVACY.md).
