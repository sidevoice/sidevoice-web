import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ACTS, type ActLayer, type Stage } from "./rig.js";
import { LiveCreature } from "./host";

/* The host turns a creature's state into the rig's act layers, as the creator does (creator.js applyMode, setBase,
 * startWork, idleStep, playMood): the busy cogs while it works, the working style or the pastime its state has on the go
 * as the base act, its clock from the step's start, a pastime for its spell, a mood over all of it. The rig is faked
 * (the test's DOM has no WebGL); its act registry (ACTS, filled by acts.js) is the real one. */

interface Call { layer: string; name: string | null; opts?: { dur?: number; hold?: boolean } }
function fakeStage() {
  const calls: Call[] = [];
  const layers: Record<string, ActLayer> = {};
  const c = {
    layers, root: { position: { constructor: Object }, traverse() {} }, minY: -0.6, body: { geometry: { boundingBox: { min: { x: 0, y: 0, z: 0 }, max: { x: 1, y: 1, z: 1 } } } }, ended: [],
    setAct(layer: string, name: string | null, opts: { dur?: number; hold?: boolean } = {}) {
      calls.push({ layer, name, opts });
      delete layers[layer];
      if (!name) return null;
      const def = ACTS[name];
      return (layers[layer] = { name, t0: null, hold: !!opts.hold, dur: opts.dur !== undefined ? opts.dur : def.dur });
    },
    act: (layer: string) => layers[layer]?.name ?? null,
  };
  const draws: Array<{ t: number; still: boolean; k?: Record<string, number | null>; extra?: Record<string, unknown> }> = [];
  const stage = {
    camera: { aspect: 1.5, updateProjectionMatrix() {} },
    renderer: {},
    w: 1152, h: 768,
    setRenderSize(w: number, h: number) { this.w = w; this.h = h; },
    items: [],
    add: (spec: object, canvas: HTMLCanvasElement) => ({ c, canvas, spec, opts: {}, off: 0 }),
    draw: (item: { opts: { extra?: Record<string, unknown> } }, t: number, _lvl: number, still: boolean) => {
      draws.push({ t, still, extra: { ...item.opts.extra }, k: Object.fromEntries(Object.entries(layers).map(([name, L]) => [name, L.t0 == null ? null : Math.round((t - L.t0) * 1e6) / 1e6])) });
    },
    scene: { remove() {} },
  };
  return { stage: stage as unknown as Stage, c, calls, layers, draws };
}

let rig: ReturnType<typeof fakeStage>;
let live: LiveCreature;
const nowS = () => performance.now() / 1000;
const make = (opts: Partial<ConstructorParameters<typeof LiveCreature>[1]> = {}) => {
  live = new LiveCreature(rig.stage, { seed: "t-login", canvas: document.createElement("canvas"), framing: "scene", scene: { zoom: 1.32, lookY: 0.3 }, ...opts });
  return live;
};
const base = () => rig.calls.filter((x) => x.layer === "base");

beforeEach(() => { vi.useFakeTimers({ now: 1_800_000_000_000 }); rig = fakeStage(); });
afterEach(() => { live?.dispose(); vi.useRealTimers(); vi.restoreAllMocks(); });

test("the acts are registered: twelve moods, five working styles, nine pastimes and the cogs", () => {
  const names = Object.keys(ACTS);
  for (const w of ["crank", "hammer", "files", "type", "think"]) expect(names).toContain("work-" + w);
  for (const r of ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"]) expect(names).toContain("rest-" + r);
  for (const m of ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"]) expect(ACTS[m].kind).toBe("mood");
  expect(names).toContain("cogs");
  // the microphone hero's act, for mic-hero.ts (appended after the export)
  expect(names).toContain("mic");
  // not ported: the desk (sidevoice-web#476), the shells, the voice lines
  for (const out of ["desk", "work-desk", "shell-read", "voice-lines"]) expect(names).not.toContain(out);
});

test("working: the cogs, then its style as the base act, both on the clock of the step's start", () => {
  const since = Date.now() - 3_000;
  make({ mood: "working", step: { work: "hammer", since, until: since + 12_000 } });
  // the creator's order: the cogs come on with the state, the style after them
  expect(rig.calls.map((x) => [x.layer, x.name])).toEqual([["cogs", "cogs"], ["base", "work-hammer"]]);
  // a working style loops until the next one (no spell of its own)
  expect(rig.layers.base.dur).toBeNull();
  expect(nowS() - rig.layers.base.t0!).toBeCloseTo(3, 2);
  expect(rig.layers.cogs.t0).toBe(rig.layers.base.t0);
  // the next style: the base is built again; the cogs keep turning
  const next = since + 12_000;
  vi.setSystemTime(next);
  live.setStep({ work: "think", since: next, until: next + 9_000 });
  expect(rig.layers.base.name).toBe("work-think");
  expect(nowS() - rig.layers.base.t0!).toBeCloseTo(0, 2);
  expect(rig.calls.filter((x) => x.layer === "cogs")).toHaveLength(1);
  // the same step again builds nothing
  live.setStep({ work: "think", since: next, until: next + 9_000 });
  live.setMood("working", { step: { work: "think", since: next, until: next + 9_000 } });
  expect(base()).toHaveLength(2);
});

test("resting: a pastime runs for its spell and half a second more (the rotation moves on first); quiet has no act", () => {
  const since = Date.now();
  make({ mood: "idle", step: { idle: "quiet", since } });
  expect(rig.layers.base).toBeUndefined();
  live.setStep({ idle: "fish", since, until: since + 41_250 });
  expect(rig.layers.base).toMatchObject({ name: "rest-fish", dur: 41.75, hold: false });
  live.setStep({ idle: "quiet", since: since + 41_250 });
  expect(rig.layers.base).toBeUndefined();
  // a pastime given no spell runs its own (the creator's pressed pastime): the stretch 3.2 s, the fishing on and on
  live.setStep({ idle: "stretch", since: Date.now() });
  expect(rig.layers.base).toMatchObject({ name: "rest-stretch", dur: 3.2 });
  live.setStep({ idle: "fish", since: Date.now() });
  expect(rig.layers.base).toMatchObject({ name: "rest-fish", dur: null });
  expect(rig.layers.cogs).toBeUndefined();
});

test("only working shows a style and only idle a pastime: listening, speaking and present have no base act; offline clears every act", () => {
  // Entering listening, the reference drops the base act and the cogs at once (creator.js applyMode: setCogs, setBase(null)),
  // even while the state keeps what it had for its entrance (avatar-state.ts `enter`): the startle is the transition.
  const since = Date.now();
  make({ mood: "listening", step: { work: "crank", idle: "juggle", since } });
  expect(rig.layers.base).toBeUndefined();
  for (const mood of ["speaking", "present"] as const) { live.setMood(mood, { step: { work: "crank", idle: "juggle", since } }); expect(rig.layers.base).toBeUndefined(); }
  live.setMood("idle", { step: { idle: "juggle", since } });
  expect(rig.layers.base?.name).toBe("rest-juggle");
  live.playMood("love", { hold: true });
  expect(rig.layers.mood?.name).toBe("love");
  live.setMood("offline");
  expect(Object.keys(rig.layers)).toEqual([]);
  // offline plays no mood
  live.playMood("happy");
  expect(rig.layers.mood).toBeUndefined();
});

test("a name the rig has no act for shows nothing (no unknown act is built)", () => {
  make({ mood: "working", step: { work: "read", since: Date.now() } });
  expect(rig.layers.base).toBeUndefined();
});

test("moods play over whatever it does, for their own seconds, or held; null ends one", () => {
  make({ mood: "working", step: { work: "type", since: Date.now() } });
  live.playMood("love");
  expect(rig.layers.mood).toMatchObject({ name: "love", dur: 3.2, hold: false });
  expect(rig.layers.base.name).toBe("work-type");
  live.playMood("proud", { dur: 5 });
  expect(rig.layers.mood).toMatchObject({ name: "proud", dur: 5 });
  live.playMood("sad", { hold: true });
  expect(rig.layers.mood).toMatchObject({ name: "sad", hold: true });
  live.playMood(null);
  expect(rig.layers.mood).toBeUndefined();
});

test("held still, a timed mood still ends on time (no frame comes to end it); moving, the rig ends it itself", () => {
  make({ mood: "idle", moving: false });
  live.playMood("happy");
  vi.advanceTimersByTime(2_900);
  expect(rig.layers.mood?.name).toBe("happy");
  vi.advanceTimersByTime(200);
  expect(rig.layers.mood).toBeUndefined();
  live.setMoving(true);
  live.playMood("happy");
  vi.advanceTimersByTime(3_100);
  // the rig's own frames end it, fading it out over its last 0.35 s
  expect(rig.layers.mood?.name).toBe("happy");
});

test("frameAt draws a fixed moment of everything it acts out: moving at t, or its key pose with the acts at t", () => {
  make({ mood: "working", step: { work: "hammer", since: Date.now() } });
  live.frameAt(2.5);
  expect(rig.layers.base.t0).toBe(0);
  expect(rig.layers.cogs.t0).toBe(0);
  expect(rig.draws.at(-1)).toMatchObject({ t: 2.5, still: false, k: { cogs: 2.5, base: 2.5 } });
  live.frameAt(0.98, true);
  expect(rig.layers.base.keyAt).toBe(0.98);
  expect(rig.draws.at(-1)).toMatchObject({ t: 0, still: true });
});

test("the first acts a renderer draws are drawn first at the reference's first two frames of them, so act outlines compile in its order", () => {
  // a creature drawn mid-way through a working style: its first frame is 7.3 s in, the cogs' puff showing
  const since = Date.now() - 7_300;
  make({ mood: "working", step: { work: "hammer", since, until: since + 12_000 } });
  live.frameAt(7.3);
  // k = 0 and a frame later for every act (as the creator's first frames, where the props show before the puff), then the
  // frame asked for: the three drawn in one task, the last one kept
  expect(rig.draws.map((d) => d.k)).toEqual([{ cogs: 0, base: 0 }, { cogs: 0.033333, base: 0.033333 }, { cogs: 7.3, base: 7.3 }]);
  expect(rig.layers.base.t0).toBe(0);
  // once per renderer: the next style is drawn straight away
  live.setStep({ work: "think", since: Date.now(), until: Date.now() + 9_000 });
  live.frameAt(1.5);
  expect(rig.draws.slice(3).map((d) => d.k)).toEqual([{ cogs: 1.5, base: 1.5 }]);
});

test("a renderer whose first acts are drawn still (reduced motion) compiles them in the key pose, as the reference's does", () => {
  make({ mood: "working", step: { work: "crank", since: Date.now() } });
  live.frameAt(0.5, true);
  live.frameAt(2);
  expect(rig.draws.map((d) => d.still)).toEqual([true, false]);
});

/** performance.now (the host's clock: frames, the startle) held where the test puts it. */
function holdClock() {
  let ms = 1_000_000;
  vi.spyOn(performance, "now").mockImplementation(() => ms);
  return (by: number) => { ms += by; vi.advanceTimersByTime(by); };
}
/** What the last frame was given over the state's own pose: the startle's expression and hop. */
const lastExtra = () => rig.draws.at(-1)?.extra ?? {};

test("entering listening from working, the style and the cogs go at once and it startles as the creator does: surprised, a hop, 0.55 s", () => {
  const tick = holdClock();
  make({ mood: "working", step: { work: "hammer", since: Date.now() } });
  expect(Object.keys(rig.layers).sort()).toEqual(["base", "cogs"]);
  // the room stamped the change now; the state keeps the hammer for the 2D entrance, and says when it came in
  live.setMood("listening", { step: { work: "hammer", since: Date.now(), entered: Date.now() } });
  expect(rig.layers).toEqual({});
  tick(225);
  live.frameAt(0);
  expect(lastExtra().expr).toBe("surprised");
  // the creator's hop: -sin(min(1, k / 0.45) π) · 9 · 1.1, at its top half-way through
  expect(lastExtra().dy).toBeCloseTo(-9 * 1.1, 6);
  tick(300);
  live.frameAt(0);
  expect(lastExtra().expr).toBe("surprised");
  expect(lastExtra().dy).toBeCloseTo(0, 6);
  tick(50);
  live.frameAt(0);
  expect(lastExtra()).toEqual({});
});

test("a barge-in on its speech startles it too, as the reference's interrupt() does, from the shared moment, once", () => {
  const tick = holdClock();
  make({ mood: "speaking", step: {} });
  const entered = Date.now();
  live.setMood("listening", { step: { since: entered, entered } });
  tick(100);
  live.frameAt(0);
  expect(lastExtra().expr).toBe("surprised");
  expect(lastExtra().dy).toBeCloseTo(-Math.sin((0.1 / 0.45) * Math.PI) * 9 * 1.1, 6);
  // the same entrance told again (a new state object, the same stamp) does not startle again
  tick(500);
  live.setMood("listening", { step: { since: entered, entered } });
  live.setStep({ since: entered, entered });
  live.frameAt(0);
  expect(lastExtra()).toEqual({});
});

test("a copy drawn late plays what is left of the startle: mounted 480 ms in, past the 2D entrance's 420 ms, the last 70 ms", () => {
  const tick = holdClock();
  const entered = Date.now() - 480;
  make({ mood: "listening", step: { since: entered, entered } });
  live.frameAt(0);
  // surprised still; the hop landed at 0.45 s
  expect(lastExtra().expr).toBe("surprised");
  expect(lastExtra().dy).toBeCloseTo(0, 6);
  tick(80);
  live.frameAt(0);
  expect(lastExtra()).toEqual({});
  // one that hears of it 300 ms in startles in step with it
  const other = new LiveCreature(rig.stage, { seed: "t-login", canvas: document.createElement("canvas"), framing: "scene", scene: { zoom: 1.32, lookY: 0.3 }, mood: "listening", step: { since: Date.now() - 300, entered: Date.now() - 300 } });
  other.frameAt(0);
  expect(lastExtra().dy).toBeCloseTo(-Math.sin((0.3 / 0.45) * Math.PI) * 9 * 1.1, 6);
  other.dispose();
  // and one 600 ms in, none: it is over
  make({ mood: "listening", step: { since: Date.now() - 600, entered: Date.now() - 600 } });
  live.frameAt(0);
  expect(lastExtra()).toEqual({});
});

test("no entrance, no startle: listening as its first state (the state says when it came in, or nothing)", () => {
  holdClock();
  make({ mood: "listening", step: { since: Date.now() } });
  live.frameAt(0);
  expect(lastExtra()).toEqual({});
});

test("held still, it is drawn again only when what it shows changes: its rest restamped while quiet asks for no frame", () => {
  make({ mood: "idle", moving: false, step: { idle: "quiet", since: Date.now() } });
  live.frameAt(0, true);
  expect(live.wantsFrames()).toBe(false);
  // the room restamps its rest (an interaction), the state object is new: the same drawing, no frame asked for
  live.setMood("idle", { step: { idle: "quiet", since: Date.now() + 1500 } });
  live.setStep({ idle: "quiet", since: Date.now() + 3000 });
  expect(live.wantsFrames()).toBe(false);
  // a change of what it shows is drawn once: a new state, or a working style coming on
  live.setMood("working", { step: { work: "crank", since: Date.now() } });
  expect(live.wantsFrames()).toBe(true);
  live.frameAt(0, true);
  expect(live.wantsFrames()).toBe(false);
  live.setMood("working", { step: { work: "crank", since: Date.now() - 1 } });
  expect(live.wantsFrames()).toBe(true);
});
