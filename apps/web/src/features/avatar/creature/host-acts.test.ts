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
  const draws: Array<{ t: number; still: boolean }> = [];
  const stage = {
    camera: { aspect: 1.5, updateProjectionMatrix() {} },
    items: [],
    add: (spec: object, canvas: HTMLCanvasElement) => ({ c, canvas, spec, opts: {}, off: 0 }),
    draw: (_item: unknown, t: number, _lvl: number, still: boolean) => { draws.push({ t, still }); },
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
afterEach(() => { live?.dispose(); vi.useRealTimers(); });

test("the acts are registered: twelve moods, five working styles, nine pastimes and the cogs", () => {
  const names = Object.keys(ACTS);
  for (const w of ["crank", "hammer", "files", "type", "think"]) expect(names).toContain("work-" + w);
  for (const r of ["stretch", "water", "juggle", "soup", "fish", "bubbles", "music", "read", "nap"]) expect(names).toContain("rest-" + r);
  for (const m of ["happy", "laugh", "love", "surprised", "angry", "sad", "confused", "dizzy", "excited", "shy", "proud", "scared"]) expect(ACTS[m].kind).toBe("mood");
  expect(names).toContain("cogs");
  // not ported: the desk (sidevoice-web#476), the shells, the mic hero, the voice lines
  for (const out of ["desk", "work-desk", "shell-read", "mic", "voice-lines"]) expect(names).not.toContain(out);
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
  expect(rig.draws.at(-1)).toEqual({ t: 2.5, still: false });
  live.frameAt(0.98, true);
  expect(rig.layers.base.keyAt).toBe(0.98);
  expect(rig.draws.at(-1)).toEqual({ t: 0, still: true });
});
