import { expect, it, vi } from "vitest";

/* A creature is never cut at the edge of the box it is drawn in, at any size or shape of that box (operator, 2026-11-10: a wide
 * body in headphones in a conversation's card, its headphone cup and its shadow sliced at the same x). Every framing is fitted to
 * what the creature reaches (extent.ts): a still face to the pose it holds, a moving one and the stage to every act it can play.
 * Here the real rig and the real acts are posed as a frame poses them, and every pose is checked by its vertices (not the points
 * the fit kept), its ink and its shadow on the floor included, against the camera the product draws it with. The renderer draws
 * nothing (the test's DOM has no WebGL). */

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<Record<string, unknown>>();
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0, autoUpdate: true };
    autoClear = true;
    setPixelRatio() {}
    setSize() {}
    render() {}
    clearDepth() {}
  }
  return { ...three, WebGLRenderer };
});

/** A 2D context that draws nothing (the rig paints its textures with one): every method answers with another such thing. */
const blank = (): unknown => new Proxy(function () {}, { get: (_t, key) => (key === "data" ? new Uint8ClampedArray(4) : key === "width" ? 0 : key === Symbol.toPrimitive ? () => 0 : blank()), set: () => true, apply: () => blank() });
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => blank()) as never);

import "./accessories.js";
import "./acts.js";
import { Stage, type StageItem } from "./rig.js";
import { BODIES, rigSpec, type CreatureChoice, type RigSpec } from "./catalogue";
import { aimAt, holds, posedPoints } from "./extent";
import { FACE, fittedFace } from "./host";
import { MIC_HERO } from "./mic-hero-spec";
import { STAGE_PX, ZOOM } from "./mic-hero";

type Item = StageItem<RigSpec>;
const base: CreatureChoice = { body: "round", color: "#58c46a", accent: "#7a56c0", iris: "#3d78c4", ears: "none", head: "none", face: "none", eyewear: "none", eyes: "normal" };
/** The operator's report: a rounded-square green body in purple headphones. */
const REPORTED: CreatureChoice = { ...base, body: "box", head: "headphones" };
/** Lets the test's worker breathe between long stretches of posing (it reports to the runner meanwhile). */
const breathe = () => new Promise((resolve) => setTimeout(resolve, 0));
/** The widest and tallest of what a creature can wear: what reaches past the face render's square (and the shadows they throw). */
const WIDEST = [["head", "straw hat"], ["head", "cowboy hat"], ["head", "pirate hat"], ["head", "horned helmet"], ["head", "mortarboard"], ["head", "headphones"],
  ["head", "wizard hat"], ["head", "top hat"], ["head", "robot"], ["ears", "bunny"], ["ears", "cat"]] as const;
/** What is checked: every body in headphones and in the widest brim (the report's, and the widest still face found), and every one of
 *  WIDEST on the boxy and the wide bodies, whose corners reach furthest. */
const STILLS: CreatureChoice[] = [...BODIES.flatMap((body) => [{ ...base, body, head: "headphones" }, { ...base, body, head: "straw hat" }]),
  ...["box", "can", "wide", "round"].flatMap((body) => WIDEST.map(([slot, label]) => ({ ...base, body, [slot]: label })))];

it("a still face holds the whole creature, its ink and its shadow, every body in headphones and the widest hats and ears", async () => {
  const stage = new Stage("paint", 256);
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = 144;
  const cut: string[] = [];
  let stepped = 0, checked = 0;
  for (const choice of STILLS) {
    if (checked % 10 === 0) await breathe();
    const item = stage.add(rigSpec(choice), canvas, { ...FACE, off: 0 }) as Item;
    // (the expression moves the eyes and the mouth, inside the body: the idle key pose is what reaches furthest)
    for (const expr of ["neutral"]) {
      // as host.ts renderFace draws it: the idle key pose with the expression, stepped back only where it reaches past the square
      item.spec.state = "idle"; item.spec.expr = expr; item.opts = { ...FACE, off: 0, extra: {} };
      stage.pose(item, 0, 0, true);
      const zoom = fittedFace(stage, item, FACE, posedPoints(item.c));
      if (zoom > FACE.zoom) stepped++;
      const camera = aimAt(stage, item.c, 1)({ ...item.opts, zoom });
      checked++;
      if (!holds(camera, posedPoints(item.c, { stride: 2 }))) cut.push(`${choice.body} ${choice.head} ${choice.ears} ${expr} (zoom ${zoom.toFixed(3)})`);
    }
    stage.scene.remove(item.c.root);
    stage.items = stage.items.filter((x) => x !== item);
  }
  expect(checked).toBe(STILLS.length);
  expect(cut).toEqual([]);
  // the fit is what holds them: some reach past the face render's own square
  expect(stepped).toBeGreaterThan(0);
}, 300_000);

it("a creature that fits the face render keeps it exactly; the one in the report is stepped back only as far as it needs", () => {
  const stage = new Stage("paint", 256);
  const zoomOf = (choice: CreatureChoice) => {
    const item = stage.add(rigSpec(choice), document.createElement("canvas"), { ...FACE, off: 0 }) as Item;
    item.spec.state = "idle"; item.spec.expr = "neutral"; item.opts = { ...FACE, off: 0, extra: {} };
    stage.pose(item, 0, 0, true);
    return fittedFace(stage, item, FACE, posedPoints(item.c));
  };
  expect(zoomOf(base)).toBe(FACE.zoom);
  const wide = zoomOf({ ...base, body: "can", head: "straw hat" });
  expect(wide).toBeGreaterThan(FACE.zoom);
  expect(wide).toBeLessThan(FACE.zoom * 1.4);
});

it("the microphone hero holds every state, its transition, its ink and its shadow inside its square", async () => {
  const stage = new Stage("paint", STAGE_PX);
  const cut: string[] = [];
  let camera: ReturnType<ReturnType<typeof aimAt>> | null = null;
  for (const state of ["prompt", "requesting", "granted", "denied", "missing"]) for (const mood of [null, "excited", "sad", "confused"]) for (const moving of [true, false]) {
    await breathe();
    const item = stage.add({ ...MIC_HERO }, document.createElement("canvas"), { off: 0, zoom: ZOOM }) as unknown as Item;
    camera ??= aimAt(stage, item.c, 1)({ off: 0, zoom: ZOOM });
    // as mic-hero.ts draws it: the large preview moving (the idle state under the act), the small heroes still (a neutral face)
    item.spec.state = moving ? "idle" : undefined; item.spec.expr = moving ? undefined : "neutral";
    item.c.setAct("base", "mic", { state });
    if (mood) item.c.setAct("mood", mood, { dur: 1.3 });
    for (let t = 0.03; t <= (moving ? 6 : 0.03); t += 0.13) {
      stage.pose(item, t, 0, !moving);
      if (!holds(camera, posedPoints(item.c))) cut.push(`${state} ${mood ?? ""} ${moving ? "moving" : "still"} at ${t.toFixed(2)} s`);
    }
    stage.scene.remove(item.c.root);
    stage.items = [];
  }
  expect(cut.slice(0, 5)).toEqual([]);
}, 300_000);
