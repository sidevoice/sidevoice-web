import { beforeEach, expect, test, vi } from "vitest";

/* The microphone permission hero (mic-hero.ts): the reference's mostaza hero on a square stage of its own, acting out the
 * microphone's state with the `mic` act, and playing the transition into a new state while it moves (excited into
 * allowed, sad into blocked, confused into none found). The rig is mocked: the test's DOM has no WebGL. */

const rig = vi.hoisted(() => ({
  refuse: false,
  stages: [] as Array<{ px: number; mode?: string; released: boolean }>,
  acts: [] as Array<[layer: string, name: string | null, opts?: object]>,
  draws: [] as Array<{ state?: string; expr?: string; still: boolean }>,
  specs: [] as object[],
}));

vi.mock("./rig.js", () => {
  class Stage {
    renderer: { domElement: HTMLCanvasElement; getContext(): { isContextLost(): boolean }; forceContextLoss(): void; dispose(): void };
    items: unknown[] = [];
    scene = { remove() {} };
    record: { px: number; mode?: string; released: boolean };
    constructor(_look: string, px: number, mode?: string) {
      if (rig.refuse) throw new Error("THREE.WebGLRenderer: Error creating WebGL context.");
      const record: { px: number; mode?: string; released: boolean } = (this.record = { px, mode, released: false });
      this.renderer = { domElement: document.createElement("canvas"), getContext: () => ({ isContextLost: () => false }), forceContextLoss() { record.released = true; }, dispose() {} };
      rig.stages.push(record);
    }
    add(spec: object, canvas: HTMLCanvasElement, opts: object) {
      rig.specs.push({ ...spec, opts });
      const item = { c: { root: { traverse() {} }, setAct: (layer: string, name: string | null, o?: object) => { rig.acts.push([layer, name, o]); } }, canvas, spec, opts, off: 0 };
      this.items.push(item);
      return item;
    }
    draw(item: { spec: { state?: string; expr?: string } }, _t: number, _lvl: number, still: boolean) { rig.draws.push({ state: item.spec.state, expr: item.spec.expr, still }); }
  }
  return { Stage };
});
vi.mock("./accessories.js", () => ({}));
vi.mock("./acts.js", () => ({}));

type Hero = typeof import("./mic-hero");
let mod: Hero;
beforeEach(async () => {
  vi.resetModules();
  rig.refuse = false;
  rig.stages.length = rig.acts.length = rig.draws.length = rig.specs.length = 0;
  vi.stubGlobal("WebGLRenderingContext", class {});
  vi.stubGlobal("requestAnimationFrame", () => 1);
  vi.stubGlobal("cancelAnimationFrame", () => {});
  mod = await import("./mic-hero");
});

const canvas = () => { const c = document.createElement("canvas"); document.body.appendChild(c); return c; };
const moods = () => rig.acts.filter(([layer]) => layer === "mood").map(([, name, o]) => [name, (o as { dur?: number } | undefined)?.dur]);

test("the hero is the reference's: round, headphones, mostaza body, berenjena headphones, deep violet eyes, on a 384 px stage at zoom 1.05", () => {
  const c = canvas();
  mod.mountMicHero({ canvas: c, state: "prompt", moving: false });
  expect(rig.stages).toEqual([{ px: 384, mode: undefined, released: false }]);
  expect(rig.specs[0]).toMatchObject({ body: "round", parts: ["headphones"], color: "#e0a82e", accent: "#4a2f6b", iris: "#5a3a8a", level: "v1", eyeScale: 1.35, opts: { off: 0, zoom: 1.05 } });
  expect([c.width, c.height]).toEqual([224, 224]);
  // it acts the state out, a neutral face held still in the act's key pose
  expect(rig.acts[0]).toEqual(["base", "mic", { state: "prompt" }]);
  expect(rig.draws.at(-1)).toEqual({ state: undefined, expr: "neutral", still: true });
});

test("moving, a new state plays its transition first: excited into allowed, sad into blocked, confused into none found", () => {
  const hero = mod.mountMicHero({ canvas: canvas(), state: "prompt", moving: true })!;
  // the first state it shows is not a change: no transition
  expect(moods()).toEqual([[null, undefined]]);
  expect(rig.draws.at(-1)).toEqual({ state: "idle", expr: undefined, still: false });
  for (const [state, mood, dur] of [["granted", "excited", 1.3], ["denied", "sad", 1.2], ["missing", "confused", 1.3], ["requesting", null, undefined]] as const) {
    rig.acts.length = 0;
    hero.setState(state);
    // the act restarts (the hop plays again), then the mood over it
    expect(rig.acts[0]).toEqual(["base", "mic", { state }]);
    expect(moods()).toEqual([[mood, dur]]);
  }
  // held still, no transition: the state's key pose
  hero.setMoving(false);
  rig.acts.length = 0;
  hero.setState("granted");
  expect(moods()).toEqual([[null, 1.3]]);
  expect(rig.draws.at(-1)).toEqual({ state: undefined, expr: "neutral", still: true });
});

test("its stage is made with the first hero and let go with the last; none where WebGL cannot be had", () => {
  const a = mod.mountMicHero({ canvas: canvas(), state: "prompt", moving: false })!;
  const b = mod.mountMicHero({ canvas: canvas(), state: "granted", moving: false })!;
  expect(rig.stages).toHaveLength(1);
  a.dispose();
  expect(rig.stages[0].released).toBe(false);
  b.dispose();
  expect(rig.stages[0].released).toBe(true);
  mod.mountMicHero({ canvas: canvas(), state: "prompt", moving: false })!.dispose();
  expect(rig.stages).toHaveLength(2);
  rig.refuse = true;
  vi.spyOn(console, "warn").mockImplementation(() => {});
  expect(mod.mountMicHero({ canvas: canvas(), state: "prompt", moving: false })).toBeNull();
});
