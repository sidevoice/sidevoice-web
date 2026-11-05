import { afterAll, beforeAll, expect, test } from "vitest";
import { installCanvas2d, recordingContext } from "../../../test/canvas-2d";
import { creatureFromSeed } from "../creature/catalogue";
import { BACKDROPS, drawBackdrop, frameOf, hangOf } from "./backdrops.js";
import { backdropOf } from "./stage-paint";

/* The stage's backdrops (backdrops.js, the design reference's, line for line): the product's catalogue in its order, the
 * seeded pick the reference's creator makes, how the offline poster hangs on each, and the frame that puts the scene's
 * ground under the creature's feet. The pixels themselves are held to the reference by the captures in the PR (a pixel
 * diff of the reference's canvas and the lab's). */

let restore: () => void;
beforeAll(() => { restore = installCanvas2d(); });
afterAll(() => restore());

const IDS = ["tone", "plain", "sunset", "lagoon", "mountains", "beach", "city", "space", "forest", "room", "clouds", "night", "underwater", "candy", "aurora", "bookshelf", "meadow"];

test("the catalogue is the product's 17, in its order (the seeded pick depends on it)", () => {
  expect(Object.keys(BACKDROPS)).toEqual(IDS);
  expect(IDS.filter((id) => BACKDROPS[id].kind === "plain")).toEqual(["tone", "plain", "sunset", "lagoon"]);
  // the tone tint stays exactly as it was: no vignette over it
  expect(IDS.filter((id) => BACKDROPS[id].flat)).toEqual(["tone"]);
});

test("a creature's backdrop is the reference creator's pick for it: its body, colour and accent seed it", () => {
  // Expected values from the frozen reference (backdrops.js backdropFromSeed over creator.js's seeded stream, backdropName).
  const cases: Array<[{ body: string; color: string; accent: string }, string]> = [
    [{ body: "round", color: "#f2cf5b", accent: "#6fa6dc" }, "clouds"],
    [{ body: "round", color: "#6cc4a4", accent: "#e86a8a" }, "bookshelf"],
    [{ body: "onion", color: "#e8826a", accent: "#3d4fa8" }, "tone"],
    [{ body: "pill", color: "#f2a7c3", accent: "#3d4fa8" }, "meadow"],
    [{ body: "slime", color: "#a58bd8", accent: "#f0b45a" }, "bookshelf"],
    [{ body: "wide", color: "#c9d66b", accent: "#9fb2c6" }, "sunset"],
    [{ body: "egg", color: "#f2a7c3", accent: "#6fa6dc" }, "space"],
    [{ body: "box", color: "#5e6b7a", accent: "#f2cf5b" }, "meadow"],
  ];
  for (const [choice, id] of cases) expect(backdropOf(choice)).toBe(id);
});

test("a conversation's backdrop follows its creature: the same on every reload, a quarter of them the tone tint", () => {
  const seeds = Array.from({ length: 800 }, (_, i) => `fp-1|thread-${i}`);
  const picks = seeds.map((seed) => backdropOf(creatureFromSeed(seed)));
  expect(seeds.map((seed) => backdropOf(creatureFromSeed(seed)))).toEqual(picks);
  const tone = picks.filter((id) => id === "tone").length / picks.length;
  expect(tone).toBeGreaterThan(0.2);
  expect(tone).toBeLessThan(0.3);
  // every other backdrop comes up
  expect(new Set(picks)).toEqual(new Set(IDS));
});

test("the poster hangs from each backdrop's mount: a tack on walls and plain grounds, a nail in the forest, afloat in space", () => {
  expect(Object.fromEntries(IDS.map((id) => [id, hangOf(id)]))).toEqual({
    tone: "pin", plain: "pin", sunset: "pin", lagoon: "pin", mountains: "mount", beach: "mount", city: "mount", space: "float", forest: "nail",
    room: "pin", clouds: "mount", night: "mount", underwater: "mount", candy: "mount", aurora: "mount", bookshelf: "pin", meadow: "mount",
  });
  expect(hangOf("unknown")).toBe("pin");
  // The room and the bookshelf place a smaller poster in their scene (frame units): on the bookshelf, pinned to the wall
  // between the units (T14).
  expect(BACKDROPS.room.poster).toEqual({ cx: 404, top: 66, bottom: 226 });
  expect(BACKDROPS.bookshelf.poster).toEqual({ cx: 400, top: 86, bottom: 262 });
  expect(IDS.filter((id) => BACKDROPS[id].poster)).toEqual(["room", "bookshelf"]);
});

test("the frame covers the tile, never cropped inside its middle 420, its ground line on the creature's feet", () => {
  // a desktop tile: as tall as the frame, centred
  const desk = frameOf(1440, 960);
  expect(desk.s).toBeCloseTo(960 / 440);
  expect(desk.tx).toBeCloseTo(720 - 400 * (960 / 440));
  expect(desk.ty).toBeCloseTo(0);
  // a portrait (phone) tile: the middle 420 span its width
  const phone = frameOf(480, 960);
  expect(phone.s).toBeCloseTo(480 / 420);
  expect(phone.tx + 190 * phone.s).toBeCloseTo(0);
  // the feet given: the ground line (y 357) on them
  const f = frameOf(1440, 960, 700);
  expect(f.ty + 357 * f.s).toBeCloseTo(700);
});

/** How many things a drawing filled and stroked. */
function marks(id: string, o: Parameters<typeof drawBackdrop>[4] = {}) {
  const { ctx, calls } = recordingContext(1440, 960);
  drawBackdrop(ctx, 1440, 960, id, { tone: "#6cc4a4", feet: 780, ...o });
  return calls.filter(([name]) => name === "fill" || name === "stroke" || name === "fillRect").length;
}

test("every backdrop draws, light and dark; a poster brings out what it hangs from, and only where there is one", () => {
  const poster = { cx: 720, top: 120, bottom: 760, half: 222 };
  const mounts = ["mountains", "beach", "city", "forest", "clouds", "night", "underwater", "candy", "aurora", "meadow"];
  for (const id of IDS) {
    for (const dark of [false, true]) expect(marks(id, { dark })).toBeGreaterThan(0);
    if (mounts.includes(id)) expect(marks(id, { poster })).toBeGreaterThan(marks(id));
    else expect(marks(id, { poster })).toBe(marks(id));
  }
});

test("the clouds' balloons move with the poster's clock; nothing else in a scene does", () => {
  const poster = { cx: 720, top: 120, bottom: 760, half: 222 };
  const at = (id: string, t: number) => { const { ctx, calls } = recordingContext(1440, 960); drawBackdrop(ctx, 1440, 960, id, { tone: "#6cc4a4", feet: 780, poster, t }); return JSON.stringify(calls); };
  expect(at("clouds", 1.5)).not.toBe(at("clouds", 0));
  for (const id of ["mountains", "city", "forest", "underwater", "candy"]) expect(at(id, 1.5)).toBe(at(id, 0));
});
