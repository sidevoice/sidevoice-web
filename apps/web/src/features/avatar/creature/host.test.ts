import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { StageFrame } from "./stage-frame";

/* Where WebGL is missing, refused or taken away, the host says so (creaturesDrawable, onCreaturesChange) instead of
 * leaving canvases empty for the rest of the page's life. It tries again on a later mount, and when a lost context comes
 * back it gives the stage a new renderer and draws again. The rig is mocked: the test's DOM has no WebGL, so the stages
 * here are stand-ins whose renderers can be refused, lost and given back. */

const rig = vi.hoisted(() => ({
  refuse: false,
  made: [] as Array<{ renderer: FakeRenderer; draws: number; kind: "scene" | "face"; w: number; h: number; draw: (item: { spec: { state?: string; expr?: string } }, t: number, level: number, still: boolean) => void }>,
  /** What each draw was asked to show: its state (a pose) and its expression. */
  drawn: [] as Array<{ state?: string; expr?: string; still: boolean }>,
  /** What the framer says the creature reaches from the tile's middle (css px), null: not measured yet. */
  reach: null as number | null,
  /** The camera's view offsets set and cleared, in order. */
  views: [] as string[],
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
    camera = { aspect: 1, updateProjectionMatrix() {},
      setViewOffset: (fw: number, fh: number, x: number, y: number, w: number, h: number) => { rig.views.push([fw, fh, x, y, w, h].join(",")); },
      clearViewOffset: () => { rig.views.push("clear"); } };
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
// The framer solves a framing on the pixels it renders (a 2D readback this DOM does not have): here it answers nothing, and the
// host's own part of the stage's ask (its pixels) is what is tested.
vi.mock("./stage-framer", () => ({ StageFramer: class { hold() {} invalidate() {} step() { return null; } dispose() {} reach() { return rig.reach; } } }));
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
  rig.views.length = 0;
  rig.reach = null;
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

/** A framing that has been asked, as the stage asks it. */
const asked = (ask: Partial<{ phone: boolean; desktop: boolean }>) => { const frame = new StageFrame(); frame.ask({ w: 1598, h: 876, dx: 0, dy: 0, phone: false, desktop: false, rest: true, cards: null, opener: null, ...ask }); return frame; };

test("a moving stage whose framing says it is a desktop's is drawn at the screen's pixels past the phone's 900 k; a phone's, or none, keeps it", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  const desk = tile(1598, 876);
  mount({ ...onStage, moving: true, canvas: desk, frame: asked({ desktop: true }) });
  expect([desk.width, desk.height]).toEqual([2765, 1516]); // 2 device px to a css px
  const phone = tile(1598, 876);
  mount({ ...onStage, moving: true, canvas: phone, frame: asked({ phone: true }) });
  expect([phone.width, phone.height]).toEqual([1281, 702]);
  const none = tile(1598, 876);
  mount({ ...onStage, moving: true, canvas: none });
  expect([none.width, none.height]).toEqual([1281, 702]);
});

test("a phone on its side (the framing asks phone: false, the device is no desktop) keeps the phone's 900 k at any pixel ratio", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  const side = tile(844, 390);
  mount({ ...onStage, moving: true, canvas: side, frame: asked({ phone: false, desktop: false }) });
  expect(side.width * side.height).toBeLessThanOrEqual(900_000);
  expect([side.width, side.height]).toEqual([1394, 644]); // (not the 1688 x 780 the desktop's ceilings would give)
});

test("a held-still stage (reduced motion, no GPU) is drawn once at the phone's pixels, and at the desktop's when it moves", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  const element = tile(1598, 876);
  const live = mount({ ...onStage, moving: false, canvas: element, frame: asked({ desktop: true }) })!;
  expect([element.width, element.height]).toEqual([1281, 702]);
  live.setMoving(true);
  expect([element.width, element.height]).toEqual([2765, 1516]);
  live.setMoving(false);
  expect([element.width, element.height]).toEqual([1281, 702]);
});

test("the scene's ceilings follow what the stage asks, as it asks", () => {
  webgl();
  {
    vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
    const element = tile(1598, 876);
    const frame = new StageFrame();
    mount({ ...onStage, moving: true, canvas: element, frame });
    expect([element.width, element.height]).toEqual([1281, 702]); // not asked yet: the phone's ceilings
    frame.ask({ w: 1598, h: 876, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
    expect([element.width, element.height]).toEqual([2765, 1516]);
    frame.ask({ w: 1598, h: 876, dx: 0, dy: 0, phone: false, desktop: false, rest: true, cards: null, opener: null }); // turned on its side
    expect([element.width, element.height]).toEqual([1281, 702]);
    frame.ask({ w: 1598, h: 876, dx: 0, dy: 0, phone: false, desktop: true, rest: true, cards: null, opener: null });
    expect([element.width, element.height]).toEqual([2765, 1516]);
  }
});

test("when the governor steps down, the canvas takes fewer pixels in the very task that draws it, so it is never shown cleared", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
  const element = tile(364, 655);
  const live = mount({ ...onStage, canvas: element, moving: true })!; // (the governor steps on frames of motion)
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

test("a retier resizes and redraws only the creatures in motion: one held still is left as it was until something draws it", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(3);
  const heldCanvas = tile(364, 655), movingCanvas = tile(364, 655);
  const held = mount({ ...onStage, canvas: heldCanvas, moving: false })!;
  const moving = mount({ ...onStage, canvas: movingCanvas, moving: true })!;
  const scene = stageFor("scene"), drawnInto: HTMLCanvasElement[] = [], draw = scene.draw.bind(scene);
  scene.draw = (...args: Parameters<typeof draw>) => { drawnInto.push((args[0] as unknown as { canvas: HTMLCanvasElement }).canvas); draw(...args); };
  expect(held.tick(0)).toBe(true);
  expect(moving.tick(0)).toBe(true);
  drawnInto.length = 0;
  // Another creature's frames stepped the governor down (a pin is the same retier).
  host.creatureQuality.pin(3); // 0.6 of the full size
  expect(moving.wantsFrames()).toBe(true);
  expect(held.wantsFrames()).toBe(false); // not woken: nothing of it changed
  expect(held.tick(1)).toBe(false);
  expect([heldCanvas.width, heldCanvas.height]).toEqual([533, 960]); // not resized, so not cleared either
  expect(moving.tick(1)).toBe(true);
  expect([movingCanvas.width, movingCanvas.height]).toEqual([320, 576]);
  expect(drawnInto).toEqual([movingCanvas]); // the one drawing, and only it
  // Letting go of the pin is a retier too: still not woken.
  host.creatureQuality.pin(null);
  expect(held.wantsFrames()).toBe(false);
  expect([heldCanvas.width, heldCanvas.height]).toEqual([533, 960]);
  // Drawn for another reason (a change, the pointer), it takes the rung the governor is on then.
  host.creatureQuality.pin(3);
  held.redraw();
  expect(held.tick(2)).toBe(true);
  expect([heldCanvas.width, heldCanvas.height]).toEqual([320, 576]);
  expect(drawnInto).toEqual([movingCanvas, heldCanvas]);
});

test("the governor's step estimate sums the scenes drawn in a frame, and counts none that is held still", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(1);
  const stage = mount({ ...onStage, canvas: tile(600, 400), moving: true })!;
  const alone = host.drawnFill(1);
  expect(alone).toBe(stage.areaAt(1));
  expect(alone).toBeGreaterThan(0);
  // A second scene drawn in the same frame (a picture-in-picture): the frame fills both, at both rungs.
  const pip = mount({ ...onStage, canvas: tile(300, 200), moving: true })!;
  expect(host.drawnFill(1)).toBe(stage.areaAt(1) + pip.areaAt(1));
  expect(host.drawnFill(0.6)).toBe(stage.areaAt(0.6) + pip.areaAt(0.6));
  expect(host.drawnFill(0.6)).toBeGreaterThan(Math.max(stage.areaAt(0.6), pip.areaAt(0.6)));
  // A large scene held still is not drawn: it adds nothing (the largest alone skewed the estimate).
  const held = mount({ ...onStage, canvas: tile(1600, 900), moving: false })!;
  expect(held.areaAt(1)).toBeGreaterThan(stage.areaAt(1));
  expect(host.drawnFill(1)).toBe(stage.areaAt(1) + pip.areaAt(1));
  held.setMoving(true);
  expect(host.drawnFill(1)).toBe(stage.areaAt(1) + pip.areaAt(1) + held.areaAt(1));
  held.setMoving(false);
  pip.dispose();
  expect(host.drawnFill(1)).toBe(stage.areaAt(1));
  // The floating card's creature (a sharp live face, the "card" stage) is drawn in the frame too, at its canvas's pixels at every rung.
  const cardCanvas = tile(200, 200);
  const card = mount({ seed: "t3", canvas: cardCanvas, framing: "face", sharp: true, moving: true })!;
  const cardArea = cardCanvas.width * cardCanvas.height;
  expect(cardArea).toBeGreaterThan(0);
  expect(card.areaAt(0.6)).toBe(cardArea);
  expect(host.drawnFill(1)).toBe(stage.areaAt(1) + cardArea);
  expect(host.drawnFill(0.6)).toBe(stage.areaAt(0.6) + cardArea);
  // Held still, or offline (the poster), it is not drawn in motion: it adds none.
  card.setMoving(false);
  expect(host.drawnFill(1)).toBe(stage.areaAt(1));
  card.setMoving(true);
  card.setMood("offline");
  expect(host.drawnFill(1)).toBe(stage.areaAt(1));
  const still = mount({ seed: "t4", canvas: tile(200, 200), framing: "face", sharp: true, moving: false })!;
  expect(still.areaAt(1) > 0 && host.drawnFill(1) === stage.areaAt(1)).toBe(true);
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

/** A `matchMedia` whose queries can be told to change, as the page's do when a window is moved to another screen: the queries
 *  made, and the listeners on each (a `once` one hears a change only the first time). `change()` is the latest query changing. */
function mediaQueries() {
  interface Listener { fn: () => void; once: boolean }
  const made: Array<{ media: string; listeners: Listener[] }> = [];
  vi.stubGlobal("matchMedia", (media: string) => {
    const query = { media, listeners: [] as Listener[] };
    made.push(query);
    return {
      media,
      matches: true,
      addEventListener: (_type: string, fn: () => void, options?: { once?: boolean }) => { query.listeners.push({ fn, once: !!options?.once }); },
      removeEventListener: (_type: string, fn: () => void) => { query.listeners = query.listeners.filter((l) => l.fn !== fn); },
    };
  });
  const change = () => {
    const query = made.at(-1)!;
    for (const l of [...query.listeners]) { if (l.once) query.listeners = query.listeners.filter((x) => x !== l); l.fn(); }
  };
  return { made, change };
}

test("the stage's canvas follows the page's pixel ratio when its css box stays the same, as a window moved to another screen", () => {
  webgl();
  const dpr = vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(1);
  const screens = mediaQueries();
  const element = tile(364, 655);
  const live = host.mountCreature({ ...onStage, canvas: element })!;
  expect([element.width, element.height]).toEqual([364, 655]);
  expect(live.tick(0)).toBe(true);
  expect(live.wantsFrames()).toBe(false); // held still: nothing asks for a frame
  expect(screens.made.map((query) => query.media)).toEqual(["(resolution: 1dppx)"]);
  // To a 2x screen: the same css box, so the box observer says nothing; the canvas is refit and drawn again.
  dpr.mockReturnValue(2);
  screens.change();
  expect([element.width, element.height]).toEqual([533, 960]);
  expect(live.wantsFrames()).toBe(true);
  expect(live.tick(1)).toBe(true);
  expect([stageFor("scene").w, stageFor("scene").h]).toEqual([533, 960]);
  // Armed again for the new ratio, so the next move is heard too: back to 1x.
  expect(screens.made.map((query) => query.media)).toEqual(["(resolution: 1dppx)", "(resolution: 2dppx)"]);
  dpr.mockReturnValue(1);
  screens.change();
  expect([element.width, element.height]).toEqual([364, 655]);
  expect(live.tick(2)).toBe(true);
  // A ratio past 2 changes nothing of what the tile holds (it draws for 2 at most): nothing is redrawn.
  dpr.mockReturnValue(2);
  screens.change();
  expect(live.tick(3)).toBe(true);
  dpr.mockReturnValue(3);
  screens.change();
  expect([element.width, element.height]).toEqual([533, 960]);
  expect(live.wantsFrames()).toBe(false);
  expect(screens.made).toHaveLength(5);
  // Let go of with the creature: the query that is armed is not listened to any more.
  live.dispose();
  expect(screens.made.at(-1)!.listeners).toHaveLength(0);
});

test("a still face, whose pixels do not depend on the pixel ratio, does not watch it; a sharp one does", () => {
  webgl();
  const screens = mediaQueries();
  mount({ seed: "t1", canvas: tile(100, 100), framing: "face", moving: false });
  expect(screens.made).toHaveLength(0);
  mount({ seed: "t2", canvas: tile(100, 100), framing: "face", sharp: true, moving: false });
  expect(screens.made).toHaveLength(1);
});

/** A stage canvas laid out as styles/call.css does: `--crop` of the tile's `w` width, centred, `h` tall; the allocations counted. */
function cropped(w: number, h: number) {
  const element = canvas(), set = { width: 0, height: 0 };
  element.getBoundingClientRect = () => new DOMRect(0, 0, w * (Number(element.style.getPropertyValue("--crop")) || 1), h);
  element.getContext = (() => null) as never;
  for (const side of ["width", "height"] as const) {
    const own = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, side)!;
    Object.defineProperty(element, side, { get: () => own.get!.call(element), set: (v: number) => { set[side]++; own.set!.call(element, v); }, configurable: true });
  }
  return { element, set };
}

test("a desktop's scene canvas is only as wide as the creature reaches, at the screen's pixels, and is drawn through a window of the tile's camera", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  rig.reach = 200; // css px from the middle
  const { element } = cropped(1598, 876);
  const live = mount({ ...onStage, moving: true, canvas: element, frame: asked({ desktop: true }) })!;
  const share = Number(element.style.getPropertyValue("--crop"));
  expect(share).toBeCloseTo((2 * (200 * 1.1 + 14)) / 1598, 1);
  expect(share).toBeLessThan(0.5);
  expect(share * 64).toBeCloseTo(Math.round(share * 64), 6); // whole steps
  expect([element.width, element.height]).toEqual([Math.round(1598 * share * 2), 1752]); // 2 device px to a css px, the tile's whole height
  live.tick(0);
  const fullW = element.width / share;
  expect(rig.views).toEqual([[fullW, 1752, (fullW - element.width) / 2, 0, element.width, 1752].join(","), "clear"]); // windowed for the draw only
  expect(live.fullAspect()).toBeCloseTo(1598 / 876, 2);
  expect((stageFor("scene") as unknown as { camera: { aspect: number } }).camera.aspect).toBeCloseTo(1598 / 876, 2); // the tile's camera
});

test("the scene canvas is the whole tile where the creature is not measured, reaches most of it, is a phone's, or holds still", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  const unmeasured = cropped(1598, 876).element;
  mount({ ...onStage, moving: true, canvas: unmeasured, frame: asked({ desktop: true }) });
  expect(unmeasured.style.getPropertyValue("--crop")).toBe("");
  rig.reach = 700;
  const wide = cropped(1598, 876).element;
  mount({ ...onStage, moving: true, canvas: wide, frame: asked({ desktop: true }) });
  expect(wide.style.getPropertyValue("--crop")).toBe("");
  rig.reach = 200;
  const phone = cropped(1598, 876).element;
  mount({ ...onStage, moving: true, canvas: phone, frame: asked({ phone: true }) });
  expect(phone.style.getPropertyValue("--crop")).toBe("");
  const held = cropped(1598, 876).element;
  mount({ ...onStage, moving: false, canvas: held, frame: asked({ desktop: true }) });
  expect(held.style.getPropertyValue("--crop")).toBe("");
  expect(rig.views).not.toContain("clear");
});

test("the creature canvas is allocated again only when its size changes: not by a refit that finds the same box, nor a retier back to the same rung", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  rig.reach = 200;
  const { element, set } = cropped(1598, 876);
  const live = mount({ ...onStage, moving: true, canvas: element, frame: asked({ desktop: true }) })!;
  const once = { ...set };
  for (let n = 0; n < 5; n++) { live.redraw(); live.tick(n); }
  expect(set).toEqual(once); // frames, pokes: no allocation
  host.creatureQuality.pin(0); // the rung it is on
  live.tick(9);
  expect(set).toEqual(once);
  host.creatureQuality.pin(3);
  live.tick(10);
  expect(set.height).toBe(once.height + 1);
  expect(element.height).toBeLessThan(1752);
});

test("a draw that throws leaves the camera's view offset cleared, so the next draw, a trial or the poster is not windowed", () => {
  webgl();
  vi.spyOn(window, "devicePixelRatio", "get").mockReturnValue(2);
  rig.reach = 200;
  const { element } = cropped(1598, 876);
  const live = mount({ ...onStage, moving: true, canvas: element, frame: asked({ desktop: true }) })!;
  const scene = stageFor("scene");
  const draw = scene.draw.bind(scene);
  scene.draw = () => { throw new Error("a lost context mid-draw"); };
  rig.views.length = 0;
  expect(() => live.tick(0)).toThrow("a lost context mid-draw");
  expect(rig.views.length).toBe(2);
  expect(rig.views[0]).not.toBe("clear");
  expect(rig.views.at(-1)).toBe("clear");
  scene.draw = draw;
});
