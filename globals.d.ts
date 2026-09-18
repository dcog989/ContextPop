// Ambient declarations for the WebExtension runtime, the globals published by the IIFE
// modules, and the domain types shared across the global-scope scripts. This file must
// stay import/export-free so every entry remains part of the same global scope.

// --- WebExtension platform -------------------------------------------------
// Hand-typed to the namespaces this extension calls. Method signatures are
// Promise-based, matching Firefox and Chrome MV3; payload types stay loose where
// the platforms differ. Namespaces are required so the runtime feature guards
// (`typeof api.search?.get === 'function'`) read as checks against the platform
// rather than optional-property narrowing.

interface WebExtensionEvent<Listener extends (...args: any[]) => any> {
  addListener(listener: Listener): void;
  removeListener(listener: Listener): void;
  hasListener(listener: Listener): boolean;
}

interface WebExtensionStorageArea {
  get(keys?: string | string[] | Record<string, any> | null): Promise<Record<string, any>>;
  set(items: Record<string, any>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  getKeys?(): Promise<string[]>;
}

interface WebExtensionTab {
  id: number;
}

interface WebExtensionApi {
  storage: {
    local: WebExtensionStorageArea;
    onChanged: WebExtensionEvent<(changes: Record<string, any>, areaName: string) => void>;
  };
  tabs: {
    create(props: { url?: string; active?: boolean; openerTabId?: number }): Promise<WebExtensionTab>;
    update(tabId: number, props: { url?: string; active?: boolean }): Promise<WebExtensionTab>;
    remove(tabId: number): Promise<void>;
  };
  windows: {
    create(props: { url?: string; type?: string; width?: number; height?: number }): Promise<WebExtensionTab>;
  };
  search: {
    search(props: { engine?: string; query?: string; tabId?: number; disposition?: string }): Promise<void>;
    get(): Promise<Array<{ name?: string; favIconUrl?: string }>>;
  };
  permissions: {
    request(permissions: { origins?: readonly string[] }): Promise<boolean>;
    contains(permissions: { origins?: readonly string[] }): Promise<boolean>;
  };
  runtime: {
    sendMessage(message: any): Promise<any>;
    getManifest(): { version: string };
    openOptionsPage(): Promise<void>;
    onInstalled: WebExtensionEvent<(details: { reason?: string }) => void>;
    onStartup: WebExtensionEvent<() => void>;
    onMessage: WebExtensionEvent<(message: any, sender: any, sendResponse: (response?: any) => void) => unknown>;
  };
  action: {
    onClicked: WebExtensionEvent<() => void>;
  };
  i18n: {
    getMessage(name: string, substitutions?: string | Array<string | number>): string;
  };
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

type ActionKind = 'clipboard' | 'reference' | 'link';

interface BuiltinAction {
  id: string;
  kind: ActionKind;
  contexts: string[];
  template?: string;
  icon: string;
  usesText?: boolean;
  tooltipKey?: string;
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
  kind: ActionKind;
  template: string;
  enabled: boolean;
  contexts: string[];
  icon: string;
  usesText: boolean;
  tooltipKey: string;
  disabled?: boolean;
}

interface SelectionInfo {
  text: string;
  rect: DOMRect;
  html: string;
  href: string;
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
}

type MessageResponse<T> = { data: T } | { error: string };

// --- Published globals -----------------------------------------------------

interface ThemeApi {
  TOKENS: Readonly<{ accent: string; fontFamily: string }>;
  applyTokens(target: HTMLElement | null): void;
  prefersReducedMotion(): boolean;
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
  isEventInsideMenu(event: Event): boolean;
}

declare var __contextPopTheme: ThemeApi;
declare var __contextPopMenuI18n: MenuI18nApi;
declare var __contextPopMenuStyles: { css: string };
declare var __contextPopMenuLayout: MenuLayoutApi;
declare var __contextPopMenuTiles: MenuTilesApi;
declare var __contextPopMenu: MenuApi;
declare var __contextPopInitialized: boolean;
