# Privacy Policy

Context Smart does not collect, store, or transmit any personal data to the developer.

## What the extension handles

- **Selected text.** When you trigger the menu and pick an engine, the selected text is inserted into that engine's URL and opened in your browser. It is sent directly to the search engine you chose, not to the developer.
- **Settings and engines.** Your engine list and preferences are stored only in your browser via `storage.local`. They are never uploaded. Engines imported from the browser stay on-device.
- **Icons and favicons.** To show an engine icon, the extension fetches the site's favicon. Depending on the favicon source setting, the request goes either to the engine's own site (`site`), to DuckDuckGo's icon service (`duckduckgo`), or not at all (`none`). Requests are cached for the browser session and sent without cookies or a referrer, so they are not tied to the page you are viewing. Icons are optional; engines without one display a letter.

## Permissions

- `storage` — save your engines and preferences.
- `search` — read the search engines already installed in your browser and run a search with them (used only when you import or use a browser engine).
- Host access to all sites — required to show the menu on any page where you select text.
- Optional host access — requested only if you configure remote icons or favicons, so those images can be fetched.

## Contact

Open an issue at <https://github.com/dcog989/Context-Smart/issues> for any privacy question.
