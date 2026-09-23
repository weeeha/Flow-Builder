import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

// vitest.config.mts does not set `test.globals: true` (the existing lib tests
// import everything explicitly from "vitest" and don't need it), but
// @testing-library/react's auto-cleanup only self-registers when it detects a
// global `afterEach`. Without this, renders from one test leak into the next
// within the same file — e.g. a leftover "Run options" button from a prior
// test made a later queryByRole match multiple elements.
afterEach(() => {
  cleanup();
});

// jsdom does not implement ResizeObserver. Radix's Popper-based positioning
// (used by components/ui/select.tsx and components/ui/dropdown-menu.tsx, which
// the copied Flow Kit components render) calls it when content opens.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub as unknown as typeof ResizeObserver;

// jsdom has no layout engine, so it never implements scrollIntoView, and it
// does not implement the pointer-capture trio at all. Radix's DropdownMenu
// (components/ui/dropdown-menu.tsx, exercised via run-button.tsx) calls these
// during open/close; without the stubs the click that should open the menu
// throws instead, and "Run from here" etc. never mount.
window.HTMLElement.prototype.scrollIntoView ??= () => {};
window.HTMLElement.prototype.hasPointerCapture ??= () => false;
window.HTMLElement.prototype.setPointerCapture ??= () => {};
window.HTMLElement.prototype.releasePointerCapture ??= () => {};

// jsdom fires a window-level "blur" event whenever focus moves from one
// element to another WITHIN the same page (confirmed by tracing: opening
// run-button's DropdownMenu makes FocusScope move focus into the menu, and
// jsdom dispatches `window` "blur" for that internal move alone). Real
// browsers only fire window blur when the OS takes focus away from the whole
// window. Radix's Menu root listens for window blur to close the menu on a
// real alt-tab-away, so jsdom's spurious version closes every DropdownMenu
// (and Select) the instant it opens — this is what made "Run from here"
// unreachable: the menu opened and closed within the same click. A jsdom test
// process never actually loses OS focus, so dropping the event here is more
// accurate than jsdom's own behavior, not a workaround for a real dismissal.
window.addEventListener(
  "blur",
  (event) => {
    event.stopImmediatePropagation();
  },
  true
);
