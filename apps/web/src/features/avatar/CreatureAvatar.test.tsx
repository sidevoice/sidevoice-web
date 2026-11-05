import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { avatarFor } from "./avatar-spec";
import { stillAvatar, type AvatarState } from "./avatar-state";
import { MOTION_KEY, startMotion } from "../../lib/motion";
import { creatureFromSeed } from "./creature/catalogue";

/* A conversation's agent is its creature: a canvas the creature host draws into (creature/host.ts, mocked here: the
 * test's DOM has no WebGL). The stage's scene and a copy that moves get a live creature; every other copy a still face in
 * its state's expression. */

const host = vi.hoisted(() => {
  const lives: { opts: Record<string, unknown>; moods: string[]; steps: unknown[]; moving: boolean[]; disposed: boolean }[] = [];
  const faces: { seed: string; expr: string; cancelled: boolean; drawing?: { now?: boolean; drawn?: () => void } }[] = [];
  // How the mocked host paints a face asked for at once: rendered there and then ("now"), or later, by the test ("later").
  const paint = { mode: "now" as "now" | "later" };
  return { lives, faces, paint };
});
vi.mock("./creature/host", () => {
  return {
    creaturesDrawable: () => true,
    onCreaturesChange: () => () => {},
    mountCreature: (opts: Record<string, unknown>) => {
      const live = { opts, moods: [] as string[], steps: [] as unknown[], moving: [] as boolean[], disposed: false };
      host.lives.push(live);
      return {
        setMood: (m: string, o: { step?: unknown } = {}) => { live.moods.push(m); live.steps.push(o.step); },
        setMoving: (m: boolean) => live.moving.push(m), dispose: () => { live.disposed = true; },
      };
    },
    drawFace: (_canvas: HTMLCanvasElement, seed: string, expr: string, _choice?: unknown, drawing?: { now?: boolean; drawn?: () => void }) => {
      const face = { seed, expr, cancelled: false, drawing };
      host.faces.push(face);
      if (drawing?.now && host.paint.mode === "now") drawing.drawn?.();
      return () => { face.cancelled = true; };
    },
  };
});
const { CharacterAvatar } = await import("./CharacterAvatar");

const motion = (how: "gpu" | "still") => { localStorage.setItem(MOTION_KEY, how); act(() => startMotion()); };
/** The host is loaded on first use (a dynamic import): lets it land. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
beforeEach(() => { host.lives.length = 0; host.faces.length = 0; host.paint.mode = "now"; motion("gpu"); });
afterEach(() => { motion("still"); localStorage.clear(); });

const spec = avatarFor("t-login");
const state = (mood: AvatarState["mood"], extra: Partial<AvatarState> = {}): AvatarState => ({ mood, ...extra });

test("on the stage's scene it is a live creature in the tile, tinted with its body colour, saying its state", async () => {
  const view = render(<div className="stage-tile"><CharacterAvatar spec={spec} state={state("idle")} size="stage" scene live label="Agent, idle" /></div>);
  await settle();
  const avatar = view.container.querySelector(".sv-avatar")!;
  expect(avatar).toHaveAttribute("data-style", "creature");
  expect(avatar).toHaveAttribute("data-framing", "scene");
  expect(avatar).toHaveAttribute("data-avatar-state", "idle");
  expect(avatar).toHaveAttribute("role", "img");
  expect(avatar).toHaveAttribute("aria-label", "Agent, idle");
  expect((avatar as HTMLElement).style.getPropertyValue("--av-color")).toBe(creatureFromSeed("t-login").color);
  expect(avatar.querySelector("canvas")).not.toBeNull();
  expect(host.lives).toHaveLength(1);
  const [live] = host.lives;
  expect(live.opts).toMatchObject({ seed: "t-login", framing: "scene", mood: "idle", moving: true });
  // its eyes follow the pointer over the whole tile
  expect(live.opts.gazeFrom).toBe(view.container.querySelector(".stage-tile"));
  expect(host.faces).toHaveLength(0);
  // A new state is acted out by the same creature: it is not built again.
  view.rerender(<div className="stage-tile"><CharacterAvatar spec={spec} state={state("listening")} size="stage" scene live label="Agent, idle" /></div>);
  expect(host.lives).toHaveLength(1);
  expect(live.moods.at(-1)).toBe("listening");
  view.unmount();
  expect(live.disposed).toBe(true);
});

test("what its state has on the go reaches the creature with its state: the working style or the pastime, and when it began and ends", async () => {
  const since = 1_800_000_000_000, until = since + 12_000;
  const view = render(<div className="stage-tile"><CharacterAvatar spec={spec} state={state("working", { work: "hammer", since, until })} size="stage" scene live /></div>);
  await settle();
  const [live] = host.lives;
  expect(live.opts).toMatchObject({ mood: "working", step: { work: "hammer", since, until } });
  expect(view.container.querySelector(".sv-avatar")).toHaveAttribute("data-work", "hammer");
  // the next style: the same creature, told the new step with its state
  view.rerender(<div className="stage-tile"><CharacterAvatar spec={spec} state={state("working", { work: "think", since: until, until: until + 9_000 })} size="stage" scene live /></div>);
  expect(host.lives).toHaveLength(1);
  expect(live.moods.at(-1)).toBe("working");
  expect(live.steps.at(-1)).toEqual({ work: "think", idle: undefined, since: until, until: until + 9_000 });
  // resting at a pastime
  view.rerender(<div className="stage-tile"><CharacterAvatar spec={spec} state={state("idle", { idle: "fish", since: until, until: until + 40_000 })} size="stage" scene live /></div>);
  expect(live.moods.at(-1)).toBe("idle");
  expect(live.steps.at(-1)).toEqual({ work: undefined, idle: "fish", since: until, until: until + 40_000 });
  view.unmount();
});

test("held still, the stage's creature shows a rest quiet, never a pastime frozen mid-way; a working style in its key pose", async () => {
  motion("still");
  const view = render(<CharacterAvatar spec={spec} state={state("idle", { idle: "juggle", since: 1, until: 2 })} size="stage" scene live />);
  await settle();
  expect(host.lives[0].opts).toMatchObject({ mood: "idle", moving: false, step: { idle: "quiet" } });
  expect(view.container.firstElementChild).toHaveAttribute("data-idle", "quiet");
  view.rerender(<CharacterAvatar spec={spec} state={state("working", { work: "crank", since: 1, until: 2 })} size="stage" scene live />);
  expect(host.lives[0].steps.at(-1)).toMatchObject({ work: "crank" });
});

test("held still (no GPU, reduced motion), the stage's creature is still drawn, in its key pose", async () => {
  motion("still");
  const view = render(<CharacterAvatar spec={spec} state={state("speaking")} size="stage" scene live />);
  await settle();
  expect(host.lives).toHaveLength(1);
  expect(host.lives[0].opts).toMatchObject({ mood: "speaking", moving: false });
  expect(view.container.firstElementChild).toHaveAttribute("aria-hidden", "true");
});

test("a copy that holds still is a still face in its state's expression: only speaking smiles, unread is surprised", async () => {
  const faces = async (mood: AvatarState["mood"], extra: Partial<AvatarState> = {}) => {
    host.faces.length = 0;
    const view = render(<CharacterAvatar spec={spec} state={state(mood, extra)} size="small" mouth="still" />);
    await settle();
    const avatar = view.container.firstElementChild!;
    expect(avatar).toHaveAttribute("data-framing", "face");
    expect(avatar).toHaveAttribute("data-size", "sidebar");
    const expr = host.faces.at(-1)?.expr;
    view.unmount();
    return expr;
  };
  expect(await faces("idle")).toBe("neutral");
  expect(await faces("listening")).toBe("neutral");
  expect(await faces("speaking")).toBe("happy");
  expect(await faces("working")).toBe("neutral");
  expect(await faces("present")).toBe("neutral");
  expect(await faces("offline")).toBe("neutral");
  expect(await faces("idle", { unread: true })).toBe("surprised");
  expect(host.lives).toHaveLength(0);
  // Offline it says so, for its face to fade (styles/call.css).
  expect(render(<CharacterAvatar spec={spec} state={stillAvatar("offline")} size="small" />).container.firstElementChild).toHaveAttribute("data-offline");
});

test("a small copy is a still face even where it is asked to move (the card, the animated thumbnails)", async () => {
  const view = render(<CharacterAvatar spec={spec} state={state("working")} size="small" live mouth="playback" />);
  await settle();
  expect(host.lives).toHaveLength(0);
  expect(host.faces.at(-1)).toMatchObject({ seed: "t-login", expr: "neutral" });
  view.rerender(<CharacterAvatar spec={spec} state={state("speaking")} size="small" live mouth="playback" />);
  await settle();
  expect(host.faces.at(-2)?.cancelled).toBe(true);
  expect(host.faces.at(-1)).toMatchObject({ seed: "t-login", expr: "happy" });
});

test("the floating card's creature (liveFace) is a live, sharp face on the card stage: it moves with its state, still in its key pose when held", async () => {
  const view = render(<CharacterAvatar spec={spec} state={state("working", { work: "hammer", since: 1, until: 2 })} size="small" live liveFace mouth="playback" />);
  await settle();
  expect(host.faces).toHaveLength(0);
  expect(host.lives).toHaveLength(1);
  const [live] = host.lives;
  expect(live.opts).toMatchObject({ seed: "t-login", framing: "face", sharp: true, mood: "working", moving: true, step: { work: "hammer" } });
  expect(view.container.firstElementChild).toHaveAttribute("data-framing", "face");
  view.rerender(<CharacterAvatar spec={spec} state={state("speaking")} size="small" live liveFace mouth="playback" />);
  await settle();
  expect(live.moods.at(-1)).toBe("speaking");
  expect(host.lives).toHaveLength(1);
  // Held still (reduced motion, no GPU): still the host's creature, in its key pose, not a 144 px face.
  motion("still");
  await settle();
  expect(live.moving.at(-1)).toBe(false);
  expect(host.faces).toHaveLength(0);
  view.unmount();
  expect(live.disposed).toBe(true);
});

test("the person and the mascot are still the engine's drawings", async () => {
  const { PERSON_AVATAR, SIDEVOICE_MASCOT } = await import("./avatar-spec");
  for (const figure of [PERSON_AVATAR, SIDEVOICE_MASCOT]) {
    const avatar = render(<CharacterAvatar spec={figure} state={stillAvatar("present")} size="pip" />).container.firstElementChild!;
    await settle();
    expect(avatar).toHaveAttribute("data-style", "bichos");
    expect(avatar.querySelector("svg")).not.toBeNull();
  }
  expect(host.lives).toHaveLength(0);
  expect(host.faces).toHaveLength(0);
});

test("a face asked for at once (the transcript's) is painted before it shows: a cache miss rendered then and there, no outline left", async () => {
  const view = render(<CharacterAvatar spec={spec} state={state("present")} size="small" immediate />);
  const avatar = () => view.container.querySelector(".sv-avatar")!;
  await settle();
  // Loaded: asked for at once, painted then and there (a cache miss rendered before paint), so the outline is gone.
  expect(host.faces.at(-1)).toMatchObject({ seed: "t-login", expr: "neutral", drawing: { now: true } });
  expect(avatar()).not.toHaveAttribute("data-fallback");
  expect(avatar().querySelector(".creature-fallback")).toBeNull();
});

test("a face asked for at once that cannot be painted yet keeps its outline until it is; painted, it keeps its image while the next expression is drawn", async () => {
  host.paint.mode = "later";
  const view = render(<CharacterAvatar spec={spec} state={state("present")} size="small" immediate />);
  await settle();
  const avatar = () => view.container.querySelector(".sv-avatar")!;
  expect(avatar()).toHaveAttribute("data-fallback");
  act(() => host.faces.at(-1)!.drawing!.drawn!());
  expect(avatar()).not.toHaveAttribute("data-fallback");
  // Something unread: the surprised face is asked for; until it is painted the canvas keeps the face it had, not the outline.
  view.rerender(<CharacterAvatar spec={spec} state={state("present", { unread: true })} size="small" immediate />);
  expect(host.faces.at(-1)).toMatchObject({ expr: "surprised", drawing: { now: true } });
  expect(avatar()).not.toHaveAttribute("data-fallback");
});

test("every other still face is queued as before: nothing stands in while the code loads, and it is not asked for at once", async () => {
  const view = render(<CharacterAvatar spec={spec} state={state("present")} size="small" />);
  expect(view.container.querySelector(".sv-avatar")).not.toHaveAttribute("data-fallback");
  await settle();
  expect(host.faces.at(-1)?.drawing).toBeUndefined();
  expect(view.container.querySelector(".sv-avatar")).not.toHaveAttribute("data-fallback");
});
