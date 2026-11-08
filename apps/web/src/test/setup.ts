import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach, beforeEach } from "vitest";
import { markSetUp } from "./onboarding";
import { speakWith } from "../state/room-session-state.js";
import { translator } from "../i18n/translator";

afterEach(cleanup);

// A store made without the room's (a state test's own) speaks as the room's does (state/room-store.ts).
speakWith((key, params) => translator()(key, params));

// Every test starts on a device whose first setup is finished, so the room renders; the setup's own tests start from
// an empty record (features/onboarding).
beforeEach(markSetUp);

// Store updates outside an event handler are what the runtime does all day; act() needs to know this is a test.
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperty(HTMLElement.prototype, "scrollTo", {
  configurable: true,
  value: () => undefined,
});

// A select's open list brings its chosen option into view; jsdom lays nothing out to scroll.
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  value: () => undefined,
});


class TestResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(globalThis, "ResizeObserver", {
  configurable: true,
  value: TestResizeObserver,
});

// jsdom has no media queries: the waveform bubble needs them present, not real.
Object.defineProperty(window, "matchMedia", {
  configurable: true,
  writable: true,
  value: (media: string) => ({ media, matches: false, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false }),
});
