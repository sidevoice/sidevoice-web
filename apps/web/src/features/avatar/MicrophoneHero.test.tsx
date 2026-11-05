import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* The microphone hero holds its WebGL context and draws only while it is shown: Settings keeps every section mounted,
 * the hidden ones `hidden`, so a hero in Settings › Permissions must not take a context or draw frames while another
 * section is open, and must let them go when the person leaves Permissions. The creature host is mocked (the test's DOM
 * has no WebGL), and so is layout: a hidden hero has no box, a shown one its 112 px. */

const host = vi.hoisted(() => ({
  mounted: [] as Array<{ state: string; disposed: boolean; states: string[] }>,
  loads: 0,
}));
vi.mock("./creature-loader", () => {
  const fake = {
    mountMicHero: ({ state }: { state: string }) => {
      const hero = { state, disposed: false, states: [] as string[] };
      host.mounted.push(hero);
      return { setState: (s: string) => { hero.states.push(s); }, setMoving() {}, dispose: () => { hero.disposed = true; } };
    },
  };
  const loading = { host: fake, failed: false }; // one snapshot, as the loader keeps it
  return {
    creatureHostNow: () => loading,
    watchCreatureHost: () => () => {},
    loadCreatureHost: () => { host.loads += 1; return Promise.resolve(fake); },
  };
});

import { MicrophoneHero } from "./MicrophoneHero";

/* layout: whether the hero has a box, and the box observers to tell */
let shown = false;
const observers = new Set<() => void>();
class TestResizeObserver {
  constructor(private callback: () => void) {}
  observe() { observers.add(this.tell); }
  unobserve() {}
  disconnect() { observers.delete(this.tell); }
  tell = () => this.callback();
}
beforeEach(() => {
  host.mounted.length = 0;
  host.loads = 0;
  shown = false;
  observers.clear();
  vi.stubGlobal("ResizeObserver", TestResizeObserver);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const size = shown && this.classList.contains("mic-hero") ? 112 : 0;
    return { width: size, height: size, top: 0, left: 0, right: size, bottom: size, x: 0, y: 0, toJSON() {} } as DOMRect;
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

/** The page shows or hides the hero (a section opened or left): its box changes and its observer says so. */
const show = (now: boolean) => act(() => { shown = now; for (const tell of [...observers]) tell(); });

test("hidden (another Settings section open), the hero takes no context and loads nothing", () => {
  render(<MicrophoneHero state="prompt" />);
  expect(host.mounted).toHaveLength(0);
  expect(host.loads).toBe(0);
});

test("shown, it is mounted; left, it lets its stage go; shown again, it is mounted again in the state now", () => {
  const view = render(<MicrophoneHero state="prompt" />);
  show(true);
  expect(host.mounted.map((h) => [h.state, h.disposed])).toEqual([["prompt", false]]);
  // the state changes while shown: the hero acts it out
  view.rerender(<MicrophoneHero state="granted" />);
  expect(host.mounted[0].states).toEqual(["granted"]);
  // the person leaves Permissions (the section is hidden, still mounted): the hero is let go
  show(false);
  expect(host.mounted[0].disposed).toBe(true);
  // a change while hidden draws nothing
  view.rerender(<MicrophoneHero state="denied" />);
  expect(host.mounted).toHaveLength(1);
  // back to Permissions: a hero again, in the state it is in now
  show(true);
  expect(host.mounted.map((h) => [h.state, h.disposed])).toEqual([["prompt", true], ["denied", false]]);
  // the screen goes: the hero with it
  view.unmount();
  expect(host.mounted[1].disposed).toBe(true);
});
