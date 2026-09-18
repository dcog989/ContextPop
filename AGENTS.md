# Agent Directives

## Project Specifics

- Name: ContextPop
- Description: Browser extension that launches a customizable popup when text is selected, providing instant access to search engines, copy to clipboard, dictionary / thesaurus lookup, etc.. Firefox and Chrome, Manifest V3.
- Tech: Vanilla JavaScript, HTML, CSS. WebExtensions APIs only. No build step and no runtime dependencies; dev tooling uses system Biome, lefthook, cocogitto, and TypeScript (`tsc`) binaries.

### Key Files

- `src/background.js` — stateless background (Firefox event page / Chrome service worker); storage seeding, tab opening, message routing.
- `src/content.js` — selection detection and trigger handling.
- `src/menu.js` — popup shell: private `menuState`, open/close lifecycle, action dispatch; publishes `globalThis.__contextPopMenu`.
- `src/menuStyles.js` — popup CSS string (`__contextPopMenuStyles`).
- `src/menuI18n.js` — localized-string lookup with fallback (`__contextPopMenuI18n`).
- `src/menuLayout.js` — theme class, on-screen positioning, animation origin, roving focus (`__contextPopMenuLayout`).
- `src/menuTiles.js` — action/engine tile construction (`__contextPopMenuTiles`).
- `src/theme.js` — shared design tokens (single source for the accent); publishes `globalThis.__contextPopTheme` with `applyTokens()` and `prefersReducedMotion()`, loaded by both the options page and the content scripts.
- `src/util.js` — shared string/URL/id helpers (`errorMessage`, `sendMessage`, `capitalize`, `buildSearchUrl`, `isHttpUrl`, `templateHasSearchTerms`, `generateId`).
- `src/actions.js` — built-in action catalog and normalization (`ACTION_ICONS`, `BUILTIN_ACTION_DEFS`, `normalizeBuiltinActions`, `normalizeActionOrder`, `builtinActionList`, `matchesContext`). Each def's `kind` (`clipboard`/`reference`/`link`) drives menu dispatch and its `usesText`/`tooltipKey` drive labels, so adding an action means adding a def (plus its locale strings), not editing menu switches.
- `src/storage.js` — storage schema, settings/engine normalization, and load/save helpers (`api`, `HTTP_URL_PATTERN`, keys, `defaultSettings`, `loadEngines`/`saveEngines`, `loadSettings`/`saveSettings`, onboarding).
- `src/permissions.js` — optional host-access grant (`HOST_ORIGINS`, `requestHostAccess`); options-page only, loaded after `storage.js` for the shared `api`.
- `src/icons.js` — favicon orchestration (`loadIconMap`, `resolveEngineIcon`); composes the modules below.
- `src/iconSource.js` — engine host / icon-source resolution (`engineIconSource`, `templateHost`, `browserEngineHost`).
- `src/iconParse.js` — favicon candidate and web-app-manifest discovery from fetched markup.
- `src/iconFetch.js` — favicon / markup / manifest fetches and data-URL encoding.
- `src/iconCache.js` — in-memory + `storage.local` favicon cache (`readIconCache`, `pruneIconCache`, `clearIconCache`).
- `src/iconSvg.js` — SVG monochrome analysis (`svgDataUrlIsMonochrome`).
- `src/iconRender.js` — DOM icon rendering (`createSvgIcon`, `createFaviconIcon`, `applyEngineIcons`); loaded by content scripts and the options page, not the background.
- `src/defaultEngines.js` — seed engines.
- `src/options.html` / `src/options.css` / `src/options*.js` — options page. `options.js` is the entry (DOM registry + wiring); concerns are split into `optionsI18n.js`, `optionsStore.js` (state/save/validate), `optionsReorder.js`, `optionsActions.js`, `optionsEngines.js`, `optionsConfig.js`, `optionsSettings.js`, and `optionsOnboarding.js` (first-run callout and host-access grant), loaded in that order by `options.html`. Host-access granting itself lives in `permissions.js`, loaded after `storage.js`. The background opens this page on install.
- `src/manifest.json` — Firefox MV3 manifest.
- `src/chrome_manifest.json` — Chrome MV3 manifest.
- `src/_locales/<lang>/messages.json` — UI strings (en, es, de, fr, hi); the manifests and pages use these via `__MSG_*__` / `api.i18n`.
- `biome.json` / `lefthook.yml` / `cog.toml` / `changelog.tpl` — dev tooling config.
- `jsconfig.json` / `globals.d.ts` — TypeScript `checkJs` config and hand-written ambient types (a minimal Promise-based WebExtension `browser`/`chrome` surface, IIFE-published globals, shared domain typedefs).
- `scripts/package.sh` — validates manifest drift, then writes both store zips to `dist/`.
- `scripts/sync_version.sh` — updates the version in both manifests (called by cog).
- `PRIVACY.md` — store privacy disclosure.

### Workflow

- Install: none. Dev tooling expects the system `biome`, `lefthook`, and `cog` binaries.
- Dev: reload the unpacked extension after edits.
- Test: manual, load unpacked (see README); plus `node --test test/*.test.js` for the pure/shared logic (zero-dep harness in `test/`).
- Lint/format: `biome check` (`biome check --write` to fix).
- Type-check: `tsc --noEmit -p jsconfig.json` (strict `checkJs`; `globals.d.ts` supplies platform and shared-global types).
- CI: `.github/workflows/ci.yml` runs `biome ci`, `tsc`, the unit tests, `web-ext lint`, and `scripts/package.sh` on push/PR.
- Git hooks: run `lefthook install` once per clone; `lefthook.yml` formats/lints staged files, runs `tsc` on staged JS, and runs `cog verify` on commit messages.
- Version/changelog: `cog bump --auto`; `cog.toml` calls `scripts/sync_version.sh` so both manifests stay in sync.
- Build: none for the extension. `scripts/package.sh` produces `dist/contextpop-{firefox,chrome}.zip`.

### Common Patterns

- Add feature: extend `src/background.js` message handling and `src/menu.js` UI, then persist via `src/storage.js`.
- Storage: all state lives in `browser.storage.local`; background and options share the helpers in `src/storage.js`.
- Content scripts share one isolated world per frame. `util.js`, `actions.js`, `storage.js`, `defaultEngines.js`, and the icon modules (`icons.js`, `iconSource.js`, `iconParse.js`, `iconFetch.js`, `iconCache.js`, `iconSvg.js`, `iconRender.js`) are deliberately unwrapped and declare top-level `var`/`function`, so their bare-name globals are shared with siblings — do not wrap them in an IIFE. `theme.js`, the menu modules (`menuStyles.js`, `menuI18n.js`, `menuLayout.js`, `menuTiles.js`, `menu.js`), and `content.js` are IIFEs: `theme.js` publishes `globalThis.__contextPopTheme`, the menu modules publish `globalThis.__contextPopMenu*`, `menu.js` publishes `globalThis.__contextPopMenu`, and `content.js` consumes it.
- Because those sibling scripts reference each other's bare globals across files, `noUnusedVariables` is disabled for them, plus `permissions.js` and the `options*.js` modules, by the `biome.json` `overrides` entry. Add a shared-global file to that list (or it will false-positive), but leave it enabled for IIFE/entry files.
- Icon modules load per context: the background imports source/parse/cache/fetch + `icons.js`; content scripts and the options page load `iconSvg.js` + `iconRender.js` instead. Keep the `background.scripts`, `chrome_manifest` `importScripts`, and `content_scripts.js` lists in sync when adding a module.
- Background: Firefox loads the manifest `background.scripts` list; Chrome's service worker calls `importScripts('util.js', 'actions.js', 'defaultEngines.js', 'storage.js', 'iconSource.js', 'iconParse.js', 'iconCache.js', 'iconFetch.js', 'icons.js')` before `background.js` runs.
- Design tokens (accent, font family) live only in `src/theme.js`; stylesheets consume `var(--accent)` / `var(--font-family)` and each context applies the tokens (`theme.applyTokens`). Never hard-code a token value in CSS or JS.

### File System Access

- Allowed: <project root> and all contained directories + files; `/tmp/*`.
- Read-Only: `.docs/ToDo.md`, `.env*`, `.git/`.
- Disallowed: everything not listed in 'Allowed' unless user grants permission.
- Require confirmation: adding/removing dependencies, any operation outside project root.
- Do not delete files or make destructive changes without permission / confirmation.

---

## General Guidelines

### Code Changes

- For non-trivial work, propose an approach and confirm before implementing.
- Keep modifications minimal and scoped; prefer incremental improvements over rewrites. Ask before architectural changes.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs.
- Decompose files over 400 lines if they mix concerns.
- Use clear naming over comments; reserve comments for complex workarounds or non-obvious issues — why, not what.
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly instructed.
- Do not create documentation files unless explicitly requested.

### Verification

- Do not run test, lint, format, or type-check commands; the user builds, tests, and lints manually.
- Run them only when the user explicitly asks.

### Author Environment

- CachyOS, KDE Plasma 6, Wayland, Btrfs.
- fish shell, Ghostty terminal, Fresh TUI editor, yay package manager, bun npm manager, Firefox, and Zed code editor.

### Testing

- Do not create test files for trivial changes, or for behavior that is not reliably unit-testable in the test environment (e.g. UI layout/click mapping). Prefer no new files; only add a test when the logic is genuinely testable and worth guarding.

### Definition of Done

- Logic fully implemented.
- Existing docs updated if public interfaces changed.
- When required by the `Verification` rules, run the corresponding `Workflow` command.
- On completion of an update or fix, print a concise conventional commit message in a fenced code block.

### Communication Style

- Provide concise, actionable responses.
- Ask clarifying questions when requirements are ambiguous.
- Flag potential risks or edge cases proactively.
- Do not pretend to understand how the user feels.
- Never editorialise your answer. No "to be honest", "honestly", hedging, disclaimers, or meta-commentary — just answer.
