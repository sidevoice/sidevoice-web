import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* Where WebGL is missing, refused or taken away, the host says so (creaturesDrawable, onCreaturesChange) instead of
 * leaving canvases empty for the rest of the page's life. It tries again on a later mount, and when a lost context comes
 * back it gives the stage a new renderer and draws again. The rig is mocked: the test's DOM has no WebGL, so the stages
 * here are stand-ins whose renderers can be refused, lost and given back. */

const rig = vi.hoisted(() => ({
  refuse: false,
  made: [] as Array<{ renderer: FakeRenderer; draws: number; kind: "scene" | "face"; w: number; h: number; draw: (item: { spec: { state?: string; expr?: string } }, t: number, level: number, still: boolean) => void }>,
  /** What each draw was asked to show: its state (a pose) and its expression. */
  drawn: [] as Array<{ state?: string; expr?: string; still: boolean }>,
}));
interface FakeRenderer { domElement: HTMLCanvasElement; setSize: (width?: number, height?: number) => void; getContext: () => { isContextLost: () => boolean }; forceContextLoss: () => void; dispose: () => void; disposed: boolean }

vi.mock("./rig.js", () => {
  const renderer = (): FakeRenderer => {
    const r: FakeRenderer = { domElement: document.createElement("canvas"), setSize() {}, getContext: () => ({ isContextLost: () => false }), forceContextLoss() {}, dispose() { r.disposed = true; }, disposed: false };
    return r;
  };
  class Stage {
    renderer: FakeRenderer;
    kind: "scene" | "face";
    w = 256;
    h = 256;
    draws = 0;
    items: unknown[] = [];
    scene = { remove() {} };
    camera = { aspect: 1, updateProjectionMatrix() {} };
    /** As the real stage's: the renderer takes the size (and says so). */
    setRenderSize(w: number, h: number) { if (this.w === w && this.h === h) return; this.w = w; this.h = h; this.renderer.setSize(w, h); }
    constructor(_look: string, _px: number, mode?: string, _opts?: object) {
      if (rig.refuse) throw new Error("THREE.WebGLRenderer: Error creating WebGL context.");
      this.kind = mode === "wide" ? "scene" : "face";
      this.renderer = renderer();
      rig.made.push(this);
    }
    add(spec: object, canvas: HTMLCanvasElement, opts: object) {
      const item = { c: { root: { traverse() {} }, layers: {}, act: () => null, setAct() {} }, canvas, spec, opts, off: 0 };
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
/** The page's stage for `kind`: the first made (a new renderer later is moved into it). */
const stageFor = (kind: "scene" | "face") => rig.made.find((stage) => stage.kind === kind)!;
/** The stage's creature, framed by hand (the test's DOM lays nothing out to place it by). */
const onStage = { seed: "t1", framing: "scene" as const, scene: { zoom: 1, lookY: 0 }, moving: false };

test("without WebGL nothing is drawn and the page is told so; a mount a while later tries again", async () => {
  const told = vi.fn();
  host.onCreaturesChange(told);
  expect(host.creaturesDrawable("face")).toBe(true); // not tried yet
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).toBeNull();
  expect(host.creaturesDrawable("face")).toBe(false);
  expect(told).toHaveBeenCalledTimes(1);
  expect(await host.faceImage("t1", "neutral")).toBeNull();
  // WebGL can be had now (a context refused for a moment): not tried again at once...
  webgl();
  expect(host.canDrawCreatures("face")).toBe(false);
  expect(rig.made).toHaveLength(0);
  // ...but by a mount a while later.
  clock += 10_000;
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).not.toBeNull();
  expect(host.creaturesDrawable("face")).toBe(true);
  expect(told).toHaveBeenCalledTimes(2);
});

test("a context refused is not drawn into: the page is told, and both stages are tried again later", () => {
  webgl();
  rig.refuse = true;
  expect(host.canDrawCreatures("scene")).toBe(false);
  expect(host.canDrawCreatures("face")).toBe(false);
  expect(host.creaturesDrawable("scene")).toBe(false);
  expect(host.creaturesDrawable("face")).toBe(false);
  rig.refuse = false;
  clock += 10_000;
  expect(host.canDrawCreatures("scene")).toBe(true);
  expect(host.canDrawCreatures("face")).toBe(true);
  expect(rig.made.map((stage) => stage.kind)).toEqual(["scene", "face"]);
});

test("a sharp live face is drawn on a stage of its own, its canvas and renderer as many device pixels as its box (capped)", () => {
  webgl();
  const dpr = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  const box = (px: number) => { const element = canvas(); element.getBoundingClientRect = () => new DOMRect(0, 0, px, px); return element; };
  const sizes: Array<[number, number]> = [];
  const small = box(100);
  const live = mount({ seed: "t1", canvas: small, framing: "face", sharp: true })!;
  const card = rig.made.find((stage) => stage.kind === "face")!;
  card.renderer.setSize = (w = 0, h = 0) => { sizes.push([w, h]); };
  expect(rig.made).toHaveLength(1); // the card's stage, not the still faces'
  expect([small.width, small.height]).toEqual([200, 200]);
  expect(live.tick(0)).toBe(true);
  expect(sizes).toEqual([[200, 200]]);
  // A second screen's pixel ratio, and a box beyond the cap.
  dpr.mockReturnValue(3);
  const large = box(400);
  const second = mount({ seed: "t2", canvas: large, framing: "face", sharp: true })!;
  expect([large.width, large.height]).toEqual([512, 512]);
  second.tick(0);
  expect(sizes.at(-1)).toEqual([512, 512]);
  // A still face is unchanged: 144 px, on the faces' stage.
  const still = mount({ seed: "t3", canvas: box(40), framing: "face" })!;
  expect(still.drawnBy(card as never)).toBe(false);
  expect(rig.made).toHaveLength(2);
});

test("a lost context draws nothing; when it is back the stage gets a new renderer and the creature is drawn again", () => {
  webgl();
  const told = vi.fn();
  host.onCreaturesChange(told);
  const live = mount({ seed: "t1", canvas: canvas(), framing: "face", moving: false })!;
  const face = stageFor("face");
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
  expect(rig.made).toHaveLength(2);
  expect(face.renderer).toBe(rig.made[1].renderer);
  expect(old.disposed).toBe(true);
  expect(live.wantsFrames()).toBe(true);
  expect(live.tick(2)).toBe(true);
  expect(face.draws).toBe(2);
  // A brief loss never told the page it could not draw.
  expect(told).not.toHaveBeenCalled();
  expect(host.creaturesDrawable("face")).toBe(true);
  // The new renderer is watched in turn.
  expect(lose(face).defaultPrevented).toBe(true);
});

test("a context not given back in time counts as missing: waiting faces get none, and its return brings creatures back", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  webgl();
  const told = vi.fn();
  host.onCreaturesChange(told);
  expect(host.canDrawCreatures("face")).toBe(true);
  const face = stageFor("face");
  lose(face);
  const still = host.faceImage("t1", "neutral");
  vi.advanceTimersByTime(3000);
  expect(host.creaturesDrawable("face")).toBe(false);
  expect(told).toHaveBeenCalledTimes(1);
  await expect(still).resolves.toBeNull();
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).toBeNull();
  giveBack(face);
  expect(host.creaturesDrawable("face")).toBe(true);
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

test("each stage answers for itself: the faces' renderer down leaves the stage's creature drawn, and the other way round", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  webgl();
  const told = vi.fn();
  host.onCreaturesChange(told);
  const live = mount({ ...onStage, canvas: canvas() })!;
  expect(host.canDrawCreatures("face")).toBe(true);
  const scene = stageFor("scene"), face = stageFor("face");
  expect(live.tick(0)).toBe(true);
  // The faces' context is lost and not given back.
  lose(face);
  vi.advanceTimersByTime(3000);
  expect(told).toHaveBeenCalledTimes(1);
  expect(host.creaturesDrawable("face")).toBe(false);
  expect(await host.faceImage("t1", "neutral")).toBeNull();
  expect(mount({ seed: "t1", canvas: canvas(), framing: "face" })).toBeNull();
  // The stage's creature is still drawn, and another can be mounted there.
  expect(host.creaturesDrawable("scene")).toBe(true);
  live.redraw();
  expect(live.wantsFrames()).toBe(true);
  expect(live.tick(1)).toBe(true);
  expect(scene.draws).toBe(2);
  expect(mount({ ...onStage, canvas: canvas() })).not.toBeNull();
  // The faces' renderer back, and the stage's lost for good: the faces are drawn, the stage's creature is not.
  giveBack(face);
  lose(scene);
  vi.advanceTimersByTime(3000);
  expect(host.creaturesDrawable("face")).toBe(true);
  expect(host.creaturesDrawable("scene")).toBe(false);
  expect(await host.faceImage("t1", "neutral")).not.toBeNull();
  expect(live.tick(2)).toBe(false);
});

test("a face asked for at once is rendered before drawFace returns, kept, and painted; with its context lost it waits for it instead", () => {
  webgl();
  expect(host.canDrawCreatures("face")).toBe(true);
  const painted = (element: HTMLCanvasElement) => { const calls: string[] = []; element.getContext = (() => ({ clearRect() {}, drawImage() { calls.push("drawn"); } })) as never; return calls; };
  const first = canvas(), firstCalls = painted(first), drawn = vi.fn();
  host.drawFace(first, "t1", "neutral", undefined, { now: true, drawn });
  expect(rig.drawn).toEqual([{ state: "idle", expr: "neutral", still: true }]);
  expect(firstCalls).toEqual(["drawn"]);
  expect(drawn).toHaveBeenCalledTimes(1);
  // Kept: the next one is put from what was rendered, not rendered again.
  const second = canvas(); painted(second);
  host.drawFace(second, "t1", "neutral", undefined, { now: true, drawn });
  expect(rig.drawn).toHaveLength(1);
  expect(drawn).toHaveBeenCalledTimes(2);
  // A lost context renders blank: the face is queued, not painted, until the context is back.
  lose(stageFor("face"));
  const third = canvas(), thirdCalls = painted(third), later = vi.fn();
  host.drawFace(third, "t1", "happy", undefined, { now: true, drawn: later });
  expect(rig.drawn).toHaveLength(1);
  expect(thirdCalls).toEqual([]);
  expect(later).not.toHaveBeenCalled();
});

/** A stage canvas in the page whose box is `w` × `h` css px. */
function tile(w: number, h: number) {
  const element = canvas();
  element.getBoundingClientRect = () => new DOMRect(0, 0, w, h);
  element.getContext = (() => null) as never; // (a dispose clears it)
  return element;
}

test("the stage's canvas holds the pixels its tile shows (the pixel ratio to 2, to 960 px tall), and its renderer is sized to it", () => {
  webgl();
  const dpr = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
  const phone = tile(364, 655);
  const live = mount({ ...onStage, canvas: phone })!;
  expect([phone.width, phone.height]).toEqual([533, 960]);
  expect(live.tick(0)).toBe(true);
  const scene = stageFor("scene");
  expect([scene.w, scene.h]).toEqual([533, 960]);
  // A desktop at pixel ratio 1 draws what it shows, not 960 px.
  dpr.mockReturnValue(1);
  const desk = tile(1118, 628);
  const second = mount({ ...onStage, canvas: desk })!;
  expect([desk.width, desk.height]).toEqual([1118, 628]);
  expect(second.tick(0)).toBe(true);
  expect([scene.w, scene.h]).toEqual([1118, 628]);
});

test("when the governor steps down, the canvas takes fewer pixels in the very task that draws it, so it is never shown cleared", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
  const element = tile(364, 655);
  const live = mount({ ...onStage, canvas: element })!;
  const scene = stageFor("scene"), seen: Array<[number, number]> = [], draw = scene.draw.bind(scene);
  scene.draw = (...args: Parameters<typeof draw>) => { seen.push([element.width, element.height]); draw(...args); };
  expect(live.tick(0)).toBe(true);
  host.creatureQuality.pin(3); // 0.6 of the full size
  expect(live.wantsFrames()).toBe(true); // asked for a frame, to size the canvas in the task that draws it
  expect([element.width, element.height]).toEqual([533, 960]); // not yet: nothing is shown cleared in between
  expect(live.tick(1)).toBe(true);
  expect(seen).toEqual([[533, 960], [320, 576]]); // what the frame drew into
  expect([scene.w, scene.h]).toEqual([320, 576]);
  host.creatureQuality.pin(null);
  expect(live.tick(2)).toBe(true);
  expect(seen.at(-1)).toEqual([533, 960]);
});

test("only a creature that moves is judged by the governor: held still, or the poster, its frames are not motion", () => {
  webgl();
  expect(mount({ ...onStage, canvas: tile(364, 655), moving: false })!.animates()).toBe(false);
  const live = mount({ ...onStage, canvas: tile(364, 655), moving: true })!;
  expect(live.animates()).toBe(true);
  live.setMoving(false);
  expect(live.animates()).toBe(false);
  live.setMood("offline");
  live.setMoving(true);
  expect(live.animates()).toBe(false); // the poster stands in for it
});
