import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { avatarFor } from "./avatar-spec";
import type { AvatarState } from "./avatar-state";
import { creatureFromSeed } from "./creature/catalogue";
import { FALLBACK_PATH } from "./creature/fallback";

/* A creature never leaves an empty box. Where it cannot be drawn (no WebGL, a context lost and not given back) or its code
 * did not load, its fallback stands in. It says what the creature says, and the creature comes back when it can be drawn
 * again. The creature host is mocked: its load can fail, and it can say creatures cannot be drawn. */

const host = vi.hoisted(() => ({
  failLoads: 0,
  loads: 0,
  drawable: true,
  /** The stages that are down while the other draws ("scene", "face"). */
  down: new Set<string>(),
  watchers: new Set<() => void>(),
  lives: [] as { opts: Record<string, unknown>; disposed: boolean }[],
  faces: [] as { seed: string; expr: string }[],
}));
/** The host as a page loads it: each load counted, the first `failLoads` failing as a dropped chunk does. */
const loadHost = vi.hoisted(() => () => {
  host.loads += 1;
  if (host.failLoads > 0) { host.failLoads -= 1; throw new Error("Failed to fetch dynamically imported module"); }
  return {
    creaturesDrawable: (framing: string) => host.drawable && !host.down.has(framing),
    onCreaturesChange: (watcher: () => void) => { host.watchers.add(watcher); return () => { host.watchers.delete(watcher); }; },
    mountCreature: (opts: Record<string, unknown>) => {
      if (!host.drawable || host.down.has(opts.framing as string)) return null;
      const live = { opts, disposed: false };
      host.lives.push(live);
      return { setMood() {}, setMoving() {}, dispose: () => { live.disposed = true; } };
    },
    drawFace: (_canvas: HTMLCanvasElement, seed: string, expr: string) => {
      if (host.drawable && !host.down.has("face")) host.faces.push({ seed, expr });
      return () => {};
    },
  };
});
vi.mock("./creature/host", loadHost);

type Avatar = typeof import("./CharacterAvatar").CharacterAvatar;
let CharacterAvatar: Avatar;
beforeEach(async () => {
  // A page of its own each time: the host's load is the page's, once.
  vi.resetModules();
  vi.doMock("./creature/host", loadHost);
  Object.assign(host, { failLoads: 0, loads: 0, drawable: true });
  host.watchers.clear();
  host.down.clear();
  host.lives.length = 0;
  host.faces.length = 0;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  ({ CharacterAvatar } = await import("./CharacterAvatar"));
});
afterEach(() => { vi.restoreAllMocks(); });

const spec = avatarFor("t-login");
const idle: AvatarState = { mood: "idle" };
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
/** Lets the page run until `done` (a dynamic import resolves through the test runner's module loader, not in one turn). */
const until = async (done: () => boolean) => { for (let i = 0; i < 200 && !done(); i++) await settle(); };
const tell = () => act(() => { for (const watcher of host.watchers) watcher(); });
const stage = (label = "Agent, idle") => <div className="stage-tile"><CharacterAvatar spec={spec} state={idle} size="stage" scene live label={label} /></div>;

/** The fallback in `avatar`, as it stands in: the creature's outline, in its body colour, saying what the creature says. */
function expectFallback(avatar: Element, label: string) {
  expect(avatar).toHaveAttribute("data-fallback");
  expect(avatar).toHaveAttribute("role", "img");
  expect(avatar).toHaveAttribute("aria-label", label);
  expect((avatar as HTMLElement).style.getPropertyValue("--av-color")).toBe(creatureFromSeed("t-login").color);
  expect(avatar.querySelector("svg.creature-fallback path")).toHaveAttribute("d", FALLBACK_PATH);
  expect(avatar.querySelector("svg.creature-fallback")).toHaveAttribute("aria-hidden", "true");
}

test("a creature whose code failed to load shows its fallback; the next creature mounted loads it, and both are drawn", async () => {
  host.failLoads = 1;
  const first = render(stage());
  const avatar = first.container.querySelector(".sv-avatar")!;
  await until(() => avatar.hasAttribute("data-fallback"));
  expectFallback(avatar, "Agent, idle");
  expect(host.lives).toHaveLength(0);
  // A later mount does not inherit the failure: it loads the host, and the creature already there is drawn too.
  const second = render(<CharacterAvatar spec={spec} state={idle} size="small" mouth="still" label="Agent" />);
  await until(() => host.lives.length > 0 && host.faces.length > 0);
  expect(host.loads).toBe(2);
  expect(avatar).not.toHaveAttribute("data-fallback");
  expect(avatar.querySelector(".creature-fallback")).toBeNull();
  expect(host.lives).toHaveLength(1);
  expect(host.faces).toHaveLength(1);
  expect(second.container.firstElementChild).not.toHaveAttribute("data-fallback");
});

test("a creature on the page tries the load again after a while", async () => {
  host.failLoads = 1;
  const view = render(stage());
  await until(() => !!view.container.querySelector(".sv-avatar[data-fallback]"));
  expect(view.container.querySelector(".sv-avatar")).toHaveAttribute("data-fallback");
  expect(host.loads).toBe(1);
  // The first retry comes a second later.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 1000)); });
  await until(() => host.lives.length > 0);
  expect(host.loads).toBe(2);
  expect(view.container.querySelector(".sv-avatar")).not.toHaveAttribute("data-fallback");
  expect(host.lives).toHaveLength(1);
});

test("where no WebGL can be had, every copy shows the fallback, accessible as the creature", async () => {
  host.drawable = false;
  const scene = render(stage());
  const face = render(<CharacterAvatar spec={spec} state={idle} size="small" mouth="still" label="Agent, idle" />);
  await until(() => !!scene.container.querySelector("[data-fallback]") && !!face.container.querySelector("[data-fallback]"));
  expectFallback(scene.container.querySelector(".sv-avatar")!, "Agent, idle");
  expectFallback(face.container.firstElementChild!, "Agent, idle");
  // The canvas stays (hidden by styles/call.css), so the creature can come back into it.
  expect(scene.container.querySelector(".sv-avatar > canvas")).not.toBeNull();
  expect(host.lives).toHaveLength(0);
  expect(host.faces).toHaveLength(0);
});

test("a context lost and not given back shows the fallback; given back, the creature is built again", async () => {
  const view = render(stage());
  await until(() => host.lives.length > 0);
  const avatar = view.container.querySelector(".sv-avatar")!;
  expect(avatar).not.toHaveAttribute("data-fallback");
  expect(host.lives).toHaveLength(1);
  host.drawable = false;
  tell();
  expectFallback(avatar, "Agent, idle");
  expect(host.lives[0].disposed).toBe(true);
  host.drawable = true;
  tell();
  expect(avatar).not.toHaveAttribute("data-fallback");
  expect(host.lives).toHaveLength(2);
  expect(host.lives[1].disposed).toBe(false);
});

test("only the copies whose stage is down show the fallback: the faces' renderer down leaves the stage's creature", async () => {
  const scene = render(stage());
  const face = render(<CharacterAvatar spec={spec} state={idle} size="small" mouth="still" label="Agent, idle" />);
  await until(() => host.lives.length > 0 && host.faces.length > 0);
  host.down.add("face");
  tell();
  expect(scene.container.querySelector(".sv-avatar")).not.toHaveAttribute("data-fallback");
  expect(host.lives[0].disposed).toBe(false);
  expectFallback(face.container.firstElementChild!, "Agent, idle");
  // The faces' renderer back: the still face is drawn again; the stage's creature was never built again.
  host.down.delete("face");
  tell();
  expect(face.container.firstElementChild).not.toHaveAttribute("data-fallback");
  expect(host.faces).toHaveLength(2);
  expect(host.lives).toHaveLength(1);
});

test("the load's retry is let go of with the last creature: nothing keeps running for a page that shows none", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    host.failLoads = 1;
    const view = render(stage());
    for (let i = 0; i < 200 && !view.container.querySelector("[data-fallback]"); i++) await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(view.container.querySelector(".sv-avatar")).toHaveAttribute("data-fallback");
    expect(vi.getTimerCount()).toBe(1);
    view.unmount();
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});

test("a load that fails after the last creature is gone schedules no retry", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  try {
    host.failLoads = 1;
    const warn = vi.mocked(console.warn);
    // Unmounted while the load is still on its way; it fails afterwards.
    render(stage()).unmount();
    for (let i = 0; i < 200 && !warn.mock.calls.some(([said]) => String(said).includes("cannot load the creatures")); i++) await act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
    expect(host.loads).toBe(1);
    expect(warn).toHaveBeenCalledWith("[creature] cannot load the creatures:", expect.any(String));
    expect(vi.getTimerCount()).toBe(0);
  } finally { vi.useRealTimers(); }
});
