import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* The offline poster's photo is the creature rendered on the scene's stage (creature/host.ts posterPortrait). Where that
 * stage cannot draw, the photo is the fallback's outline; once it can again, the poster is drawn again with the creature:
 * when the host says the stage is back (onCreaturesChange), and, for a context taken for a moment and given back before
 * the host counts it as down, on a few tries a second apart. The host and the painter are mocked: the test's DOM has
 * neither WebGL nor a 2D canvas. */

const host = vi.hoisted(() => ({
  drawable: true,
  portrait: null as null | { img: object; box: [number, number, number, number] },
  asked: 0,
  watchers: new Set<() => void>(),
  painted: [] as Array<{ portrait: unknown } | null>,
}));
vi.mock("./creature-loader", () => {
  const fake = {
    posterPortrait: () => { host.asked += 1; return host.portrait; },
    creaturesDrawable: () => host.drawable,
    onCreaturesChange: (watcher: () => void) => { host.watchers.add(watcher); return () => { host.watchers.delete(watcher); }; },
  };
  const loading = { host: fake, failed: false };
  return { creatureHostNow: () => loading, watchCreatureHost: () => () => {}, loadCreatureHost: () => Promise.resolve(fake) };
});
vi.mock("./scene/stage-paint", async (original) => ({
  ...(await original<typeof import("./scene/stage-paint")>()),
  StagePainter: class { set(input: { poster: { portrait: unknown } | null }) { host.painted.push(input.poster); } dispose() {} },
}));

import { StageBackdrop } from "./StageScene";

const words = { title: "WANTED", status: "ONLINE OR PAUSED", fine: ["A", "B", "C"] as [string, string, string] };
const PORTRAIT = { img: {}, box: [0, 0, 10, 10] as [number, number, number, number] };
const lastPhoto = () => host.painted.at(-1)?.portrait ?? null;

beforeEach(() => {
  host.drawable = true; host.portrait = null; host.asked = 0; host.watchers.clear(); host.painted.length = 0;
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

test("its stage down, the poster's photo is the fallback; the host saying the stage can draw again brings the creature back", () => {
  host.drawable = false;
  render(<StageBackdrop seed="fp-1|t-week" tone="#6cc4a4" poster={{ words, language: "en" }} />);
  expect(host.painted.at(-1)).not.toBeNull();
  expect(lastPhoto()).toBeNull();
  // down: no tries of its own (the host tells when it is back)
  for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(1000); });
  expect(host.asked).toBe(1);
  // the stage's context is back
  host.drawable = true; host.portrait = PORTRAIT;
  act(() => { for (const watcher of [...host.watchers]) watcher(); });
  expect(lastPhoto()).toBe(PORTRAIT);
});

test("a context taken for a moment (the stage not counted down): the portrait is asked for again, a second apart, a few times", () => {
  render(<StageBackdrop seed="fp-1|t-week" tone="#6cc4a4" poster={{ words, language: "en" }} />);
  expect(lastPhoto()).toBeNull();
  act(() => { vi.advanceTimersByTime(1000); });
  expect(host.asked).toBe(2);
  host.portrait = PORTRAIT;
  act(() => { vi.advanceTimersByTime(1000); });
  expect(lastPhoto()).toBe(PORTRAIT);
  // drawn: nothing asked any more
  const asked = host.asked;
  for (let i = 0; i < 10; i++) act(() => { vi.advanceTimersByTime(1000); });
  expect(host.asked).toBeLessThanOrEqual(asked + 1);
  expect(lastPhoto()).toBe(PORTRAIT);
});

test("tries stop after a few: a stage that never comes back is not asked for every second", () => {
  render(<StageBackdrop seed="fp-1|t-week" tone="#6cc4a4" poster={{ words, language: "en" }} />);
  for (let i = 0; i < 30; i++) act(() => { vi.advanceTimersByTime(1000); });
  expect(host.asked).toBe(6);
  expect(lastPhoto()).toBeNull();
});

test("no poster, no portrait asked for", () => {
  render(<StageBackdrop seed="fp-1|t-week" tone="#6cc4a4" />);
  act(() => { vi.advanceTimersByTime(5000); });
  expect(host.asked).toBe(0);
  expect(host.painted.at(-1)).toBeNull();
});
