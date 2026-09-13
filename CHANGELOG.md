# Changelog
All notable changes to this project will be documented in this file. See [conventional commits](https://www.conventionalcommits.org/) for commit guidelines.

- - -
## v0.6.1 - 2026-09-13

#### Bug Fixes

- (1d9a1bb) open options before permission check and revert host-access refactor - dcog989

- - -

## v0.6.0 - 2026-09-13

#### Features

- (6f8d8ef) add first-run onboarding callout - dcog989

#### Bug Fixes

- (b8c08d7) sync host-access disclosure and dedupe permission helper - dcog989

#### Refactoring

- (1832d64) add BuiltinAction typedef and fix shadowed binding - dcog989

- (57e9c95) type the background/content message protocol - dcog989

- - -

## v0.5.0 - 2026-09-13

#### Features

- (1b79de3) fade popup chrome and tiles with popup opacity - dcog989

- (9829b8e) add per-engine enable/disable checkbox - dcog989

- (2036449) add restore-defaults button to actions - dcog989

- (9bf9f04) add popup opacity slider - dcog989

- (5d3fdf3) add optional expand/shrink popup animation - dcog989

#### Bug Fixes

- (a851866) require all-site host access for content scripts - dcog989

- (5233a5c) make hovered tile background opaque - dcog989

- (3143ef2) fade accent border with popup opacity - dcog989

#### Refactoring

- (88bf224) share HTTP URL validation and template checks - dcog989

- (0bfd7c6) split popup logic into stateless menu modules - dcog989

- (7d5b029) split options controller into single-concern modules - dcog989

- (e99894a) split favicon logic into single-concern modules - dcog989

- (9f11638) change export name from 'context-pop' to 'contextpop' - dcog989

- - -

## v0.4.1 - 2026-09-12

#### Bug Fixes

- (f820734) stop flashing the icon-access warning on every save - dcog989

- - -

## v0.4.0 - 2026-09-12

#### Features

- (3cba297) show extension version next to the repo link - dcog989

#### Bug Fixes

- (eb12da9) open browser-engine results in a background tab via tabId - dcog989

- (e91faed) request full host access on save for icons and site access - dcog989

- - -

## v0.3.1 - 2026-09-12

#### Bug Fixes

- (e8a7b7d) run event page on startup so first action click registers - dcog989

- (d698599) honor background-tab open method for browser-native engines - dcog989

#### Refactoring

- (81fec2a) replace manual regex.exec loops with matchAll - dcog989

- - -

## v0.3.0 - 2026-09-12

#### Features

- (d4497a9) rename Behavior section to Preferences - dcog989

- (3c0b4ef) add option to use accent color for popup border - dcog989

#### Bug Fixes

- (ecc648a) clear selection by close reason, preserving it on Escape - dcog989

- - -

## v0.2.0 - 2026-09-12

#### Features

- (5644fd1) add Hindi locale - dcog989

- (ae1e357) add Spanish, German, and French locales - dcog989

- (d27d985) add Translate and Copy link address - dcog989

- (5794e48) unify app logo with accent badge - dcog989

- (6982f86) add popup position setting with pointer-anchored mode - dcog989

- (cadf78a) show action icons in action settings - dcog989

- (3ceb4da) replace PowerThesaurus with Cambridge Thesaurus - dcog989

- (87dfdfe) replace Google/Bing defaults with Startpage and OpenStreetMap - dcog989

- (460dd6b) replace icon size with scalable popup size presets - dcog989

- (d330b92) show spinner while refreshing engine icons - dcog989

- (2bdfeef) learn engine hosts from searches and theme monochrome SVGs - dcog989

- (ec00e40) resolve hosts for browser-imported engines - dcog989

- (05b47ac) default define to Wiktionary and thesaurus to Power Thesaurus - dcog989

- (ee7c4aa) fetch high-res icons for browser-imported engines - dcog989

- (bde87c3) quote the parsed word in define/thesaurus tooltips - dcog989

- (88f4c88) flow action and engine tiles together in one grid - dcog989

- (fed0f7d) use galaxy icon as accent-colored app logo - dcog989

- (9746d50) animate engine deletion - dcog989

- (d649a21) add manual refresh for cached engine icons - dcog989

- (33ec1b7) animate row reordering on move up/down - dcog989

- (3123597) add icon size setting and increase default icon size - dcog989

- (0bb9785) disable non-applicable action icons instead of hiding them - dcog989

- (6f5d018) always open search results in tabs; drop engine result-view option - dcog989

- (fcca530) show favicons for engine rows - dcog989

- (594773b) remove browser default search action - dcog989

- (b2aa812) save automatically when settings change - dcog989

- (13c6d8c) add built-in actions, context filtering, and browser engine import - dcog989

- (c4f9715) add full-config backup and repository link to options - dcog989

#### Bug Fixes

- (3fdaf94) add SVG namespace so icons render in Firefox - dcog989

- (2f23466) set Android min version and avoid dynamic innerHTML - dcog989

- (8c08514) offer the copy actions for link selections - dcog989

- (e9dd54d) detect the link when a selection straddles the anchor boundary - dcog989

- (fe9af8b) validate built-in action provider templates on save - dcog989

- (fd58688) preserve a deliberately empty engine list - dcog989

- (9e24bfd) replace DeepL with Google Translate, remove legacy code - dcog989

- (2b52517) restore spacing below Backup heading - dcog989

- (1d05bf3) show "Standard" popup size label - dcog989

- (65cb358) persist repeated action and engine edits - dcog989

- (7a436da) use real defaults when settings fail to load - dcog989

- (30ec93b) ignore browser-source engines where named search is unsupported - dcog989

- (3a732e0) guard clipboard fallback against missing document.body - dcog989

- (66806b0) restore arrow-key navigation in closed shadow root - dcog989

- (db1589b) resolve biome errors and descending-specificity warnings - dcog989

- (6444361) resolve imported engines from their site on refresh - dcog989

- (e627020) pass the query to browser.search.search - dcog989

- (6ec4358) restore context chip labels - dcog989

- (7790b45) migrate stored Merriam-Webster defaults to new providers - dcog989

- (34040a8) read the web app manifest for high-res icons - dcog989

- (a157f9a) don't open the menu on a plain image click - dcog989

- (357350a) make header sticky and unstick the footer - dcog989

- (8efe3fa) read declared high-resolution favicons and cache persistently - dcog989

- (4fa9ebd) drop quotes around word in define/thesaurus labels - dcog989

- (8b18e34) respect hidden state of provider template field - dcog989

- (a4df63a) remove default focus outline on initially focused tile - dcog989

- (f6fd0fa) only highlight focused tile during keyboard navigation - dcog989

#### Performance Improvements

- (b5398ad) list cache keys without reading cached values - dcog989

- (1b689cf) avoid config reload on icon cache writes - dcog989

#### Refactoring

- (4f50753) default to alphabetical built-in action order - dcog989

- (5b863cc) drop legacy iconSize-to-popupSize migration + size label 'standard' - dcog989

- (924732a) split tile appenders and drop listActions wrapper - dcog989

- (2632b93) drop unused builtin action metadata - dcog989

- (e7d4030) drop duplicate contextMatches fallback - dcog989

- (33b8124) derive permission origins from engineIconSource - dcog989

- (696f733) share capitalize helper - dcog989

- (1fc36e7) extract shared applyEngineIcons helper - dcog989

- (d622dff) drop dead clipboard permission gate - dcog989

- (3d86c11) var not const - dcog989

- (c3ae8e5) drop background-tab link action and defer to open method - dcog989

- (a13bb2a) move refresh icons + remove hint text - dcog989

- (2e117bb) fix engine icons to the engine's own site - dcog989

- (b13af45) replace from-browser badge with template placeholder hint - dcog989

- (ecf13bd) remove per-engine context filtering and chips - dcog989

- (9cf441f) extract favicon logic into icons.js and drop host-learning - dcog989

- (63c491c) restore the engine name→host map - dcog989

- (b4a0579) learn imported-engine hosts from searches only - dcog989

- (b9a92ae) learn engine hosts only, probe unresolved engines on refresh - dcog989

- (e7d5f53) whenever - dcog989

- (1ddbef1) always hide group headers - dcog989

- (8302b4a) remove per-engine import/export - dcog989

- (3bc8e25) use explicit width and height for popup window creation - dcog989

- (29d4e76) refine description - dcog989

- (5ca7a93) tokenize font family in theme.js - dcog989

- (297fd54) centralize design tokens in theme.js - dcog989

- - -

Changelog generated by [cocogitto](https://github.com/cocogitto/cocogitto).