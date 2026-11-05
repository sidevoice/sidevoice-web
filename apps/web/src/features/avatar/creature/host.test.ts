import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* Where WebGL is missing, refused or taken away, the host says so (creaturesDrawable, onCreaturesChange) instead of
 * leaving canvases empty for the rest of the page's life. It tries again on a later mount, and when a lost context comes
 * back it gives the stage a new renderer and draws again. The rig is mocked: the test's DOM has no WebGL, so the stages
 * here are stand-ins whose renderers can be refused, lost and given back. */

const rig = vi.hoisted(() => ({
  refuse: false,
  made: [] as Array<{ renderer: FakeRenderer; draws: number }>,
  /** What each draw was asked to show: its state (a pose) and its expression. */
  drawn: [] as Array<{ state?: string; expr?: string; still: boolean }>,
}));
interface FakeRenderer { domElement: HTMLCanvasElement; setSize: () => void; getContext: () => { isContextLost: () => boolean }; forceContextLoss: () => void; dispose: () => void; disposed: boolean }

vi.mock("./rig.js", () => {
  const renderer = (): FakeRenderer => {
    const r: FakeRenderer = { domElement: document.createElement("canvas"), setSize() {}, getContext: () => ({ isContextLost: () => false }), forceContextLoss() {}, dispose() { r.disposed = true; }, disposed: false };
    return r;
  };
  class Stage {
    renderer: FakeRenderer;
    w = 256;
    h = 256;
    draws = 0;
    items: unknown[] = [];
    scene = { remove() {} };
    camera = { aspect: 1, updateProjectionMatrix() {} };
    constructor() {
      if (rig.refuse) throw new Error("THREE.WebGLRenderer: Error creating WebGL context.");
      this.renderer = renderer();
      rig.made.push(this);
    }
    add(spec: object, canvas: HTMLCanvasElement, opts: object) {
      const item = { c: { root: { traverse() {} }, act: () => null, setAct() {} }, canvas, spec, opts, off: 0 };
      this.items.push(item);
      return item;
    }
    draw(item: { spec: { state?: string; expr?: string } }, _t: number, _level: number, still: boolean) {
      this.draws += 1;
      rig.drawn.push({ state: item.spec.state, expr: item.spec.expr, still });
    }
  }
  return { Stage, ACTS: {} };
});
vi.mock("./accessories.js", () => ({}));
vi.mock("./acts.js", () => ({}));

type Host = typeof import("./host");
let host: Host;
let clock = 0;
beforeEach(async () => {
  vi.resetModules();
  rig.refuse = false;
  rig.made.length = 0;
  rig.drawn.length = 0;
  clock = 1000;
  vi.spyOn(performance, "now").mockImplementation(() => clock);
  vi.spyOn(console, "warn").mockImplementation(() => {});
  host = await import("./host");
});
/** The creatures a test mounted, let go of after it, so none draws on into the next test. */
const mounted: Array<{ dispose(): void }> = [];
const mount = (opts: Parameters<Host["mountCreature"]>[0]) => { const live = host.mountCreature(opts); if (live) mounted.push(live); return live; };
afterEach(() => { for (const live of mounted.splice(0)) live.dispose(); for (const element of canvases.splice(0)) element.remove(); vi.unstubAllGlobals(); vi.useRealTimers(); vi.restoreAllMocks(); });

const webgl = () => vi.stubGlobal("WebGLRenderingContext", function WebGLRenderingContext() {});
/** A canvas in the page with a box, as a creature's is. */
const canvases: HTMLCanvasElement[] = [];
function canvas() {
  const element = document.createElement("canvas");
  element.getClientRects = () => [new DOMRect(0, 0, 144, 144)] as unknown as DOMRectList;
  document.body.append(element);
  canvases.push(element);
  return element;
}
const lose = (stage: (typeof rig.made)[number]) => {
  const event = new Event("webglcontextlost", { cancelable: true });
  stage.renderer.domElement.dispatchEvent(event);
  return event;
};
const giveBack = (stage: (typeof rig.made)[number]) => stage.renderer.domElement.dispatchEvent(new Event("webglcontextrestored"));

test("without WebGL nothing is drawn and the page is told so; a mount a while later tries again", async () => {
  const told = vi.fn();
  host.onCreaturesChange(told);
  expect(host.creaturesDrawable()).toBe(true); // not tried yet
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).toBeNull();
  expect(host.creaturesDrawable()).toBe(false);
  expect(told).toHaveBeenCalledTimes(1);
  expect(await host.faceImage("t1", "neutral")).toBeNull();
  // WebGL can be had now (a context refused for a moment): not tried again at once...
  webgl();
  expect(host.canDrawCreatures()).toBe(false);
  expect(rig.made).toHaveLength(0);
  // ...but by a mount a while later.
  clock += 10_000;
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).not.toBeNull();
  expect(host.creaturesDrawable()).toBe(true);
  expect(told).toHaveBeenCalledTimes(2);
});

test("a context refused is not drawn into: the page is told, and both stages are tried again later", () => {
  webgl();
  rig.refuse = true;
  expect(host.canDrawCreatures()).toBe(false);
  expect(host.creaturesDrawable()).toBe(false);
  rig.refuse = false;
  clock += 10_000;
  expect(host.canDrawCreatures()).toBe(true);
  expect(rig.made).toHaveLength(2);
});

test("a lost context draws nothing; when it is back the stage gets a new renderer and the creature is drawn again", () => {
  webgl();
  const told = vi.fn();
  host.onCreaturesChange(told);
  const live = mount({ seed: "t1", canvas: canvas(), framing: "face", moving: false })!;
  const face = rig.made[1];
  expect(live.tick(0)).toBe(true);
  expect(face.draws).toBe(1);
  // Lost: asked back (default prevented), and nothing is drawn meanwhile; the canvas keeps its last frame.
  expect(lose(face).defaultPrevented).toBe(true);
  live.redraw();
  expect(live.wantsFrames()).toBe(false);
  expect(live.tick(1)).toBe(false);
  expect(face.draws).toBe(1);
  // Back: a new renderer (made as the stage made its own) takes the lost one's place, and the creature is drawn again.
  const old = face.renderer;
  giveBack(face);
  expect(rig.made).toHaveLength(3);
  expect(face.renderer).toBe(rig.made[2].renderer);
  expect(old.disposed).toBe(true);
  expect(live.wantsFrames()).toBe(true);
  expect(live.tick(2)).toBe(true);
  expect(face.draws).toBe(2);
  // A brief loss never told the page it could not draw.
  expect(told).not.toHaveBeenCalled();
  expect(host.creaturesDrawable()).toBe(true);
  // The new renderer is watched in turn.
  expect(lose(face).defaultPrevented).toBe(true);
});

test("a context not given back in time counts as missing: waiting faces get none, and its return brings creatures back", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  webgl();
  const told = vi.fn();
  host.onCreaturesChange(told);
  expect(host.canDrawCreatures()).toBe(true);
  const face = rig.made[1];
  lose(face);
  const still = host.faceImage("t1", "neutral");
  vi.advanceTimersByTime(3000);
  expect(host.creaturesDrawable()).toBe(false);
  expect(told).toHaveBeenCalledTimes(1);
  await expect(still).resolves.toBeNull();
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).toBeNull();
  giveBack(face);
  expect(host.creaturesDrawable()).toBe(true);
  expect(told).toHaveBeenCalledTimes(2);
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).not.toBeNull();
});

test("a still face is the idle key pose with its state's expression, as the reference draws every still face", async () => {
  webgl();
  for (const expr of ["neutral", "happy", "surprised"]) expect(await host.faceImage("t1", expr)).not.toBeNull();
  expect(rig.drawn).toEqual([
    { state: "idle", expr: "neutral", still: true },
    { state: "idle", expr: "happy", still: true },
    { state: "idle", expr: "surprised", still: true },
  ]);
});
