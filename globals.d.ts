// Ambient declarations for the WebExtension runtime, the globals published by the IIFE
// modules, and the domain types shared across the global-scope scripts. This file must
// stay import/export-free so every entry remains part of the same global scope.

// --- WebExtension platform -------------------------------------------------
// The API surface is broad and partially promise/callback based. Keep the boundary
// deliberately loose and put type effort into our own data structures instead.
interface WebExtensionApi {
  [namespace: string]: any;
}

declare var browser: WebExtensionApi;
declare var chrome: WebExtensionApi;
declare function importScripts(...urls: string[]): void;

// --- Domain types ----------------------------------------------------------

interface Engine {
  id: string;
  name: string;
  source: string;
  enabled?: boolean;
  template: string;
  browserEngineName?: string;
  icon: string;
}

interface BuiltinActionValue {
  enabled: boolean;
  template?: string;
}

interface Settings {
  trigger: string;
  openMethod: string;
  columns: number;
  theme: string;
  showLabels: boolean;
  actionsPosition: string;
  popupSize: string;
  popupPosition: string;
  popupAnimation: boolean;
  popupOpacity: number;
  accentBorder: boolean;
  builtinActions: Record<string, BuiltinActionValue>;
  actionOrder: string[];
}

interface ActionItem {
  id: string;
  template: string;
  enabled: boolean;
  contexts: string[];
  icon: string;
  disabled?: boolean;
}

interface SelectionInfo {
  text: string;
  rect: DOMRect;
  html: string;
  href: string;
  linkText: string;
  context?: string;
}

interface AnchorRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
}

interface MenuAnchor {
  rect?: AnchorRect | null;
  point?: { x: number; y: number } | null;
  position?: string;
}

interface IconSource {
  key: string;
  kind: 'image' | 'markup';
}

interface IconCandidate {
  url: string;
  vector: boolean;
  size: number;
}

interface FetchResult {
  dataUrl: string | null;
  definitive: boolean;
}

interface MenuContent {
  markup: string | null;
  baseUrl: string;
  definitive: boolean;
}

// --- Message protocol ------------------------------------------------------

interface MessageMap {
  getEngines: { type: 'getEngines' };
  getSettings: { type: 'getSettings' };
  getIcons: { type: 'getIcons' };
  refreshIcons: { type: 'refreshIcons' };
  search: { type: 'search'; engineId: string; terms: string; method: string };
  openLink: { type: 'openLink'; url: string; method: string };
  openReference: { type: 'openReference'; template: string; terms: string };
  openOptions: { type: 'openOptions' };
}

type MessageType = keyof MessageMap;

type Message = MessageMap[MessageType];

type IconMap = Record<string, string>;

interface MessageResultMap {
  getEngines: Engine[];
  getSettings: Settings;
  getIcons: IconMap;
  refreshIcons: IconMap;
  search: { ok: boolean };
  openLink: { ok: boolean };
  openReference: { ok: boolean };
  openOptions: { ok: boolean };
}

type MessageResponse<T> = { data: T } | { error: string };

// --- Published globals -----------------------------------------------------

interface ThemeApi {
  TOKENS: Readonly<{ accent: string; fontFamily: string }>;
  applyTokens(target: HTMLElement | null): void;
}

interface MenuI18nApi {
  t(name: string, fallback?: string, substitutions?: Array<string | number>): string;
}

interface MenuLayoutApi {
  applyTheme(menu: HTMLElement, theme: string): void;
  positionMenu(menu: HTMLElement, anchor: MenuAnchor): void;
  applyAnimationOrigin(menu: HTMLElement, anchor: MenuAnchor): void;
  focusTile(tile: HTMLElement): void;
  moveFocus(menu: HTMLElement, delta: number): void;
  focusEdge(menu: HTMLElement, last: boolean): void;
}

interface EngineTileHandlers {
  onClick: (event: MouseEvent) => void;
  onAuxClick: (event: MouseEvent) => void;
}

interface EngineTile {
  tile: HTMLButtonElement;
  setIcon: (source: string | null | undefined) => void;
}

interface MenuTilesApi {
  createActionTile(
    action: ActionItem,
    text: string,
    showLabels: boolean,
    onActivate: (event: MouseEvent) => void,
  ): HTMLButtonElement;
  createEngineTile(engine: Engine, showLabels: boolean, handlers: EngineTileHandlers): EngineTile;
  appendActionTiles(
    tiles: HTMLElement,
    actions: ActionItem[],
    text: string,
    showLabels: boolean,
    onActivate: (event: MouseEvent) => void,
  ): void;
  appendEngineTiles(
    tiles: HTMLElement,
    engines: Engine[],
    showLabels: boolean,
    iconSetters: Map<string, (source: string | null | undefined) => void>,
    handlers: EngineTileHandlers,
  ): void;
}

interface MenuState {
  open: boolean;
  text: string;
  html: string;
  context: string;
  href: string;
  linkText: string;
  actions: ActionItem[];
  settings: Settings | null;
  handlers: Record<string, (() => void) | undefined> | null;
  host: HTMLElement | null;
  root: ShadowRoot | null;
  previousFocus: HTMLElement | null;
  onClose: ((reason: string) => void) | null;
}

interface OpenMenuOptions {
  text: string;
  html: string;
  context: string;
  href: string;
  linkText: string;
  rect: DOMRect | null;
  point: { x: number; y: number } | null;
  engines: Engine[];
  settings: Settings;
  handlers: Record<string, () => void>;
  onClose: (reason: string) => void;
}

interface MenuApi {
  openMenu(options: OpenMenuOptions): void;
  closeMenu(options?: { restoreFocus?: boolean; reason?: string }): void;
  isMenuOpen(): boolean;
  menuState: MenuState;
}

declare var __contextPopTheme: ThemeApi;
declare var __contextPopMenuI18n: MenuI18nApi;
declare var __contextPopMenuStyles: { css: string };
declare var __contextPopMenuLayout: MenuLayoutApi;
declare var __contextPopMenuTiles: MenuTilesApi;
declare var __contextPopMenu: MenuApi;
declare var __contextPopInitialized: boolean;
