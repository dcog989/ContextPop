# Agent Directives

## Project Specifics

- Name: ContextPop
- Description: Browser extension that launches a customizable popup when text is selected, providing instant access to search engines, copy to clipboard, dictionary / thesaurus lookup, etc.. Firefox, Manifest V3.
- Tech: Vanilla JavaScript, HTML, CSS. WebExtensions APIs only. No build step and no runtime dependencies; dev tooling uses system Biome, Lefthook, and Cocogitto binaries.

### Key Files

- `src/background.js` — stateless event page entry; message routing and lifecycle listeners.
- `src/opener.js` — background-only; normalizes queries and opens tabs/windows/searches (template engines, browser search, reference popups, links).
- `src/url.js` — URL recognition and construction: `KNOWN_TLDS`/`BARE_URL_PATTERN`/`AMBIGUOUS_TLDS`, `isHttpUrl`, `looksLikeUrl`/`normalizeHttpUrl` (scheme-less selections like `donkeys.org`, `fishing.net/trout`, defaulting to `https://`), and `buildSearchUrl` (`{searchTerms}` substitution).
- `src/util.js` — shared string/id/number helpers (`generateId`, `errorMessage`, `capitalize`, `clamp`, `clampInt`, `pickEnum`, `defineEnum`) plus search-template validation (`templateProblem` -> `TEMPLATE_PROBLEM` codes `ok`/`missingTerms`/`scheme`, used by the background and options).
- `src/actions.js` — built-in action catalog; a def's `kind` (`clipboard`/`reference`/`link`) drives menu dispatch and its `usesText`/`tooltipKey` drive labels. Adding an action that reuses an existing kind and behavior is just a def plus its locale strings (menu switches stay untouched); a genuinely new behavior also needs its handler (e.g. a new clipboard operation in `src/clipboard.js`).
- `src/engineSource.js` — per-source engine strategy registry (`ENGINE_SOURCE_STRATEGIES`) covering `normalize` plus, when the owning context loads, `open` (background), `iconSource` (background), and `validate`/`applyTemplateField` (options). Call sites dispatch via `engineStrategy(engine)` instead of branching on `engine.source`; `extendEngineSource` attaches context-owned behavior.
- `src/permissions.js` — optional host-access grant; options-page only, loaded after `storage.js` for the shared `api`.
- `src/options.html` / `src/options*.js` — options page; `options.js` is the entry and the remaining modules load in a fixed order from the HTML. The background opens this page on install.
- `src/manifest.json` — Firefox MV3 manifest.
- `src/_locales/<lang>/messages.json` — UI strings (en, es, de, fr, hi), used via `__MSG_*__` / `api.i18n`.
- `jsconfig.json` / `globals.d.ts` — editor-only `checkJs` config and hand-written ambient types (the WebExtension `browser` surface, IIFE-published globals, shared domain typedefs). Biome's type-aware checks do not read them.

### Workflow

- Install: none. Dev tooling expects the system `biome`, `lefthook`, and `cog` binaries.
- Dev: reload the unpacked extension after edits.
- Test: manual, load unpacked (see README); plus `node --test test/*.test.js` for the pure/shared logic (zero-dep harness in `test/`).
- Lint/format: `biome check` (`biome check --write` to fix). This is the only static check.
- Type-check: `biome check` too, via `linter.domains.types: all` plus the type-aware nursery rules enabled in `biome.json` (inference-based, no `tsc`). `jsconfig.json` (`checkJs`) and `globals.d.ts` exist for editor errors only, since Biome ignores them.
- Disabled type-aware rules: `useStrictBooleanExpressions`, `noUnsafeReturn`, `noUnnecessaryConditions` (false positives on JSDoc-typed JS; `Map#get` and optional-object fields are inferred as `any`/`always-truthy`).
- CI: `.github/workflows/ci.yml` runs `biome ci`, the unit tests, `web-ext lint`, and `scripts/package.sh` on push/PR.
- Release: pushing a `v*` tag (from `cog bump`) triggers `.github/workflows/release.yml`, which packages the extension and publishes a GitHub Release using the matching `CHANGELOG.md` section.
- Git hooks: run `lefthook install` once per clone; `lefthook.yml` formats/lints staged files and runs `cog verify` on commit messages.
- Version/changelog: `cog bump --auto`; `cog.toml` calls `scripts/sync_version.sh` so the manifest version stays in sync.
- Build: none for the extension. `scripts/package.sh` produces `dist/contextpop-firefox.zip`.

### Common Patterns

- Add feature: extend `src/background.js` message handling and `src/menu.js` UI, then persist via `src/storage.js`.
- Storage: all state lives in `browser.storage.local`; background and options share the helpers in `src/storage.js`.
- Content scripts share one isolated world per frame. `url.js`, `util.js`, `actions.js`, `storage.js`, `engineSource.js`, `defaultEngines.js`, and the icon modules (`icons.js`, `iconSource.js`, `iconParse.js`, `iconFetch.js`, `iconCache.js`, `iconSvg.js`, `iconRender.js`) are deliberately unwrapped and declare top-level `var`/`function`, so their bare-name globals are shared with siblings — do not wrap them in an IIFE. `theme.js`, the menu modules (`menuStyles.js`, `menuI18n.js`, `menuLayout.js`, `menuTiles.js`, `menu.js`), `clipboard.js`, and `content.js` are IIFEs: `theme.js` publishes `globalThis.__contextPopTheme`, the menu modules publish `globalThis.__contextPopMenu*`, `menu.js` publishes `globalThis.__contextPopMenu`, `clipboard.js` publishes `globalThis.__contextPopClipboard`, and `content.js` consumes them.
- Because those sibling scripts reference each other's bare globals across files, `noUnusedVariables` is disabled for them, plus `permissions.js` and the `options*.js` modules, by the `biome.json` `overrides` entry. Add a shared-global file to that list (or it will false-positive), but leave it enabled for IIFE/entry files.
- Icon modules load per context: the background imports source/parse/cache/fetch + `icons.js`; content scripts and the options page load `iconSvg.js` + `iconRender.js` instead. Keep the `background.scripts` and `content_scripts.js` lists in sync when adding a module.
- Background: Firefox loads the manifest `background.scripts` list before `background.js` runs.
- Design tokens (accent, font family) and animation durations live only in `src/theme.js`; stylesheets consume `var(--accent)` / `var(--font-family)` / `var(--*-ms)` and each context applies the tokens (`theme.applyTokens`). Never hard-code a token value in CSS or JS.

### File System Access

- Allowed: <project root> and all contained directories + files; `/tmp/*`.
- Read-Only: `.docs/ToDo.md`, `.env*`, `.git/`.
- Disallowed: everything not listed in 'Allowed' unless user grants permission.
- Require confirmation: adding/removing dependencies, any operation outside project root.
- Do not delete files or make destructive changes without permission / confirmation.

---

## General Guidelines

### Code Changes

- For non-trivial work, propose an approach and confirm before implementing, including architectural changes.
- Keep modifications minimal and scoped; prefer incremental improvements over rewrites.
- Use explicit types and named constants (no magic numbers).
- Return explicit error types; do not suppress exceptions.
- Follow standard repository linting and formatting configs.
- Decompose files over 400 lines if they mix concerns.
- Name things clearly; reserve comments for the non-obvious why (workarounds, edge cases).
- Never run git mutations (commit, push, reset, rebase, amend) unless explicitly instructed.
- Do not create documentation files unless explicitly requested.
- Adhere to <https://develop.kde.org/hig/>.

### Author Environment

- Ryzen 5800X3D, Radeon RX 7900 XT, Display (AW3225QF); CachyOS, KDE, KWin / Wayland, Btrfs.
- fish shell, Ghostty terminal, Fresh TUI editor, yay package manager, bun npm manager, Firefox, Zed code editor.

### Testing

- Add tests only when the logic is genuinely testable and worth guarding. No test files for trivial changes or behavior the environment cannot test reliably (e.g. UI layout/click mapping).

### Definition of Done

- Logic fully implemented.
- Existing docs updated if public interfaces changed.
- Run the corresponding `Workflow` command when `Verification` requires it.

### Commit Messages

- On completion of an update or fix, print a conventional commit message in a fenced code block.
- Add a body only when the "why" isn't obvious.
- Never hard-wrap: one physical line per paragraph, however long.

### Communication Style

- Format: short declarative sentences, one idea per line.
- Instructions: numbered steps, one action each (exact command, path, or code); no prose recap.
- Explanations: essential context only. End question answers with `TL;DR:`, one sentence; omit for status updates and completed work.
- Tone: no preamble, restating, hedging, disclaimers, emotional framing, or closing offers. Keep every fact, command, flag, path, default, caveat.
- Edge Cases: state risks explicitly; ask when requirements are ambiguous.
