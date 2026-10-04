# ContextPop

Firefox extension that launches a customizable popup on text selection for instant search, copy to clipboard, dictionary, thesaurus, and links.

Install: [Firefox ContextPop](https://addons.mozilla.org/en-GB/firefox/addon/contextpop/).

![screenshot 1](assets/screen-1.webp)
![screenshot 2](assets/screen-2.webp)

## Features

- Popup tile grid on text selection, keyboard navigable
- Built-in actions: copy (rich or plain), copy link address, copy page info, open link, dictionary, thesaurus, and translate
- Search engines, configurable to display either before or after Actions
- Context-aware actions: copy, copy link address, copy page info, open link, dictionary, thesaurus, and translate apply to the selections they suit
- Manage engines (name, template, optional icon)
- Import installed Firefox search engines
- Engine icons fetched from each engine's own site (or a custom icon URL / Base64)
- Open results in a new tab, background tab, current tab, or new window; dictionary/thesaurus/translate open a popup window
- Configurable trigger: popup on selection or while holding Alt, Ctrl/Cmd, or Shift
- Customize popup: columns, size, position, opacity, animation, accent border, and engine-name labels
- Theme: light, dark, or system
- Export/import settings as JSON
- First-run orientation callout on the options page
- English, Spanish, German, French, and Hindi locales

## Permissions and privacy

- `storage` — engines, actions, and preferences, kept on-device.
- `search` — enumerate and search the browser's installed engines (Firefox import/search; imported engines are hidden where the API is unavailable).
- `clipboardWrite` — copy actions.
- Host access to all sites — needed to show the menu wherever you select text and to fetch engine icons. It is granted at install, but users can revoke it. When it is missing, grant it from the onboarding callout or "Refresh icons" in settings. Revoke per-site in the browser's extension settings.

Remote icons are fetched, preferring high-resolution variants, and cached on-device without cookies or a referrer. See [PRIVACY.md](PRIVACY.md).

---

## Technical

### Development

No install and no build. Dev tooling is the system `biome`, `lefthook`, `cog`, and `tsc` binaries:

```sh
biome check                    # lint + format check
biome check --write            # apply fixes
tsc --noEmit -p jsconfig.json  # type-check the JS
node --test test/*.test.js     # unit tests for shared/pure logic
lefthook install               # enable git hooks once per clone
cog bump --auto                # version + changelog; syncs the manifest version
```

CI (`.github/workflows/ci.yml`) runs the same checks on push and pull requests, plus `web-ext lint` and `scripts/package.sh` (packaging). Pushing a `v*` tag triggers `.github/workflows/release.yml`, which packages the extension and publishes a GitHub Release with the matching `CHANGELOG.md` section.

### Package

```sh
./scripts/package.sh           # build a zip archive for the store
```

Outputs `dist/contextpop-firefox.zip`. The script uses `zip` when available and falls back to Python's `zipfile`.

### Install (temporary / unpacked)

1. Open `about:debugging#/runtime/this-firefox`.
2. Click **Load Temporary Add-on...**.
3. Select `src/manifest.json`.

## License

[GNU General Public License v3.0](LICENSE)
