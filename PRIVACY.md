# Privacy Policy

Context Smart does not collect, store, or transmit any personal data to the developer.

## What the extension handles

- **Selected text.** When you trigger the menu and pick an engine, the selected text is inserted into that engine's URL and opened in your browser. It is sent directly to the search engine you chose, not to the developer.
- **Settings and engines.** Your engine list and preferences are stored only in your browser via `storage.local`. They are never uploaded.
- **Remote icons.** If you add an icon URL for an engine, the extension fetches that image so it can be shown in the menu. Icon requests are cached for the browser session and sent without cookies or a referrer. They are only made when you configure an icon URL and grant the corresponding host access. Icons are optional; engines without one display a letter.

## Permissions

- `storage` — save your engines and preferences.
- Host access to all sites — required to show the menu on any page where you select text.
- Optional host access — requested only if you configure remote icon URLs, so those images can be fetched.

## Contact

Open an issue on the project repository for any privacy question.
