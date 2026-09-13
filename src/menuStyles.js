(() => {
  if (globalThis.__contextPopMenuStyles) return;

  const css = `
.cs-menu {
  position: absolute;
  z-index: 2147483647;
  display: flex;
  flex-direction: column;
  gap: 0.57em;
  padding: 0.57em;
  max-width: min(92vw, 40em);
  max-height: 70vh;
  overflow: auto;
  background: rgba(255, 255, 255, var(--cs-alpha, 1));
  color: #1a1a1a;
  border: 1px solid rgba(0, 0, 0, calc(0.16 * var(--cs-alpha, 1)));
  border-radius: 0.71em;
  box-shadow: 0 10px 32px rgba(0, 0, 0, calc(0.28 * var(--cs-alpha, 1)));
  pointer-events: auto;
  font-family: var(--font-family);
  font-size: 14px;
  --icon-size: 26px;
  --tile-size: 38px;
}
.cs-menu.size-compact {
  font-size: 12px;
  --icon-size: 22px;
  --tile-size: 32px;
  gap: 4px;
  padding: 4px;
}
.cs-menu.size-compact .cs-tiles {
  gap: 2px;
}
.cs-menu.size-compact .cs-tile {
  padding: 1px;
}
.cs-menu.size-large {
  font-size: 16px;
  --icon-size: 30px;
  --tile-size: 44px;
}
.cs-menu.size-luxury {
  font-size: 18px;
  --icon-size: 34px;
  --tile-size: 50px;
}
.cs-menu.dark {
  background: rgba(32, 33, 36, var(--cs-alpha, 1));
  color: #f1f3f4;
  border-color: rgba(255, 255, 255, calc(0.16 * var(--cs-alpha, 1)));
}
.cs-menu.accent-border {
  border-color: var(--accent);
}
.cs-tiles {
  display: grid;
  gap: 0.29em;
}
.cs-tile {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.14em;
  width: var(--tile-size);
  height: var(--tile-size);
  padding: 0.14em;
  border: 1px solid transparent;
  border-radius: 0.57em;
  background: transparent;
  color: inherit;
  cursor: pointer;
  outline: none;
  opacity: var(--cs-alpha, 1);
  transition: opacity 120ms ease;
}
.cs-tile:not(:disabled):hover,
.cs-menu.kb .cs-tile:not(:disabled):focus {
  opacity: 1;
}
.cs-tile:hover {
  background: #00000014;
  border-color: #00000029;
}
.cs-menu.kb .cs-tile:focus {
  background: #00000014;
  border-color: #00000029;
}
.cs-menu.dark .cs-tile:hover,
.cs-menu.dark.kb .cs-tile:focus {
  background: #ffffff1f;
  border-color: #ffffff33;
}
.cs-menu.has-labels .cs-tile {
  width: auto;
  min-width: 4.86em;
  height: auto;
  padding: 0.43em 0.57em;
}
.cs-tile:disabled {
  opacity: calc(0.35 * var(--cs-alpha, 1));
  cursor: default;
}
.cs-tile:disabled:hover {
  background: transparent;
  border-color: transparent;
}
.cs-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-size);
  height: var(--icon-size);
}
.cs-icon [hidden] {
  display: none !important;
}
.cs-icon img {
  width: var(--icon-size);
  height: var(--icon-size);
  object-fit: contain;
  pointer-events: none;
}
.cs-icon .cs-mask {
  width: var(--icon-size);
  height: var(--icon-size);
  background-color: currentColor;
  -webkit-mask-repeat: no-repeat;
  mask-repeat: no-repeat;
  -webkit-mask-position: center;
  mask-position: center;
  -webkit-mask-size: contain;
  mask-size: contain;
  pointer-events: none;
}
.cs-icon svg {
  width: calc(var(--icon-size) - 0.14em);
  height: calc(var(--icon-size) - 0.14em);
}
.cs-letter {
  display: flex;
  align-items: center;
  justify-content: center;
  width: var(--icon-size);
  height: var(--icon-size);
  border-radius: 50%;
  background: var(--accent);
  color: #ffffff;
  font-size: calc(var(--icon-size) * 0.54);
  font-weight: 600;
}
.cs-label {
  max-width: 7.6em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.79em;
  line-height: 1.2;
}
.cs-empty {
  padding: 0.67em 1em;
  font-size: 0.86em;
  opacity: calc(0.72 * var(--cs-alpha, 1));
}
.cs-menu.cs-anim-in {
  animation: cs-expand 140ms ease-out;
}
.cs-menu.cs-anim-out {
  animation: cs-shrink 120ms ease-in forwards;
  pointer-events: none;
}
@keyframes cs-expand {
  from {
    opacity: 0;
    transform: scale(0.92);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
@keyframes cs-shrink {
  from {
    opacity: 1;
    transform: scale(1);
  }
  to {
    opacity: 0;
    transform: scale(0.92);
  }
}
@media (prefers-reduced-motion: reduce) {
  .cs-menu.cs-anim-in,
  .cs-menu.cs-anim-out {
    animation: none;
  }
}
`;

  globalThis.__contextPopMenuStyles = { css };
})();
