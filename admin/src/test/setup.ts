import { configure } from '@testing-library/react';
import '@testing-library/jest-dom/vitest';

// Testing Library waits one second by default. These tests render whole routes behind a stubbed
// API, and several files run in parallel, so a slow machine (or CI) can exceed that and fail a
// test that is merely slow. Five seconds still fails fast when something is actually broken.
configure({ asyncUtilTimeout: 5_000 });

// jsdom implements neither of these, and the dashboard's chart (recharts' ResponsiveContainer)
// measures its box on mount. Without them it throws during the passive effect, which took the
// whole screen down with it rather than just the chart.
//
// The stub reports no size, so the chart renders empty in tests - which is the honest outcome in
// a DOM that does no layout, and is why the dashboard's assertions are about the tiles, the
// labelled series and the daily table rather than about the drawn path.
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe(): void { /* no layout in jsdom, so nothing ever changes size */ }
    unobserve(): void { /* nothing to stop watching */ }
    disconnect(): void { /* nothing to disconnect */ }
  };
}

// Radix (the account and theme menus) asks the DOM things jsdom does not answer: it tracks
// pointer capture to tell a click from a drag, and scrolls the focused item into view. Unstubbed,
// a menu never opens in a test, which looks exactly like the menu being broken.
if (!Element.prototype.hasPointerCapture) {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
}
if (!Element.prototype.scrollIntoView) {
  Element.prototype.scrollIntoView = () => undefined;
}

// `'matchMedia' in window` would narrow window to never (the DOM types always declare it), so
// this asks the object itself whether jsdom actually provided one.
const maybeMatchMedia = window as Window & { matchMedia?: typeof window.matchMedia };
if (!maybeMatchMedia.matchMedia) {
  // src/stores/theme.ts asks for the OS colour scheme at import time. Nothing matches, so tests
  // run in the light theme unless one of them stamps data-theme itself.
  const matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    addListener: () => undefined,
    removeListener: () => undefined,
    dispatchEvent: () => false,
  });
  window.matchMedia = matchMedia;
}
