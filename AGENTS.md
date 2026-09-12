# Agent Directives

## Project Specifics

- Name: ContextPop
- Description: Browser extension that launches a customizable popup when text is selected, providing instant access to search engines, copy to clipboard, dictionary / thesaurus lookup, etc.. Firefox and Chrome, Manifest V3.
- Tech: Vanilla JavaScript, HTML, CSS. WebExtensions APIs only. No build step and no runtime dependencies; dev tooling uses system Biome, lefthook, and cocogitto binaries.

### Key Files

- `src/background.js` — stateless background (Firefox event page / Chrome service worker); storage seeding, tab opening, message routing.
- `src/content.js` — selection detection and trigger handling.
- `src/menu.js` — popup UI rendered in a closed shadow root.
- `src/theme.js` — shared design tokens (single source for the accent); publishes `globalThis.__contextPopTheme` with `applyTokens()`, loaded by both the options page and the content scripts.
- `src/storage.js` — shared storage schema and helpers (`api`, engines, settings).
- `src/defaultEngines.js` — seed engines.
- `src/options.html` / `src/options.js` / `src/options.css` — engine and settings management.
- `src/manifest.json` — Firefox MV3 manifest.
- `src/chrome_manifest.json` — Chrome MV3 manifest.
- `src/_locales/en/messages.json` — UI strings; the manifests and pages use these via `__MSG_*__` / `api.i18n`.
- `biome.json` / `lefthook.yml` / `cog.toml` / `changelog.tpl` — dev tooling config.
- `scripts/package.sh` — validates manifest drift, then writes both store zips to `dist/`.
- `scripts/sync_version.sh` — updates the version in both manifests (called by cog).
- `PRIVACY.md` — store privacy disclosure.

### Workflow

- Install: none. Dev tooling expects the system `biome`, `lefthook`, and `cog` binaries.
- Dev: reload the unpacked extension after edits.
- Test: manual, load unpacked (see README).
- Lint/format: `biome check` (`biome check --write` to fix).
- Git hooks: run `lefthook install` once per clone; `lefthook.yml` formats/lints staged files and runs `cog verify` on commit messages.
- Version/changelog: `cog bump --auto`; `cog.toml` calls `scripts/sync_version.sh` so both manifests stay in sync.
- Build: none for the extension. `scripts/package.sh` produces `dist/context-pop-{firefox,chrome}.zip`.

### Common Patterns

- Add feature: extend `src/background.js` message handling and `src/menu.js` UI, then persist via `src/storage.js`.
- Storage: all state lives in `browser.storage.local`; background and options share the helpers in `src/storage.js`.
- Content scripts `theme.js`, `menu.js`, and `content.js` run in one isolated world but are wrapped in IIFEs; `theme.js` publishes `globalThis.__contextPopTheme` and `menu.js` publishes `globalThis.__contextPopMenu`, which `content.js` consumes.
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
