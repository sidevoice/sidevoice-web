import { afterAll, beforeAll, expect, test } from "vitest";
import { installCanvas2d, recordingContext, type Call } from "../../../test/canvas-2d";
import { frameOf, hangOf, type PosterBox } from "./backdrops.js";
import { layPoster, PH, posterArt, posterBounty, posterMoves, posterPlace, posterSeed, PW, type LayOptions } from "./poster.js";

/* The offline wanted poster (poster.js, the design reference's creator's, line for line): a size smaller everywhere
 * (×0.84) so it clears the agent's name, placed where a backdrop asks for it, hung from what the backdrop has (a tack, a
 * nail, the scene's own mount, or afloat), and moving on its own only on the clouds and in space, at the reference's
 * timings. */

let restore: () => void;
beforeAll(() => { restore = installCanvas2d(); });
afterAll(() => restore());

const W = 1709, H = 960, FEET = 741.69;

test("a size smaller everywhere: 0.84 of the largest that fits the tile, centred, desktop or phone", () => {
  const desk = posterPlace(W, H, "beach", FEET);
  expect(desk.pk).toBeCloseTo(0.84 * Math.min(0.86, (W * 0.9) / 610, (H * 0.9) / 880));
  expect(desk.cx).toBe(W / 2);
  expect(desk.cy).toBe(H / 2 + 4);
  expect(desk.box).toEqual({ cx: W / 2, top: desk.cy - (PH / 2) * desk.pk, bottom: desk.cy + (PH / 2) * desk.pk, half: (PW / 2) * desk.pk });
  // a phone's narrow tile: the width decides
  const phone = posterPlace(534, 960, "beach", 700);
  expect(phone.pk).toBeCloseTo(0.84 * ((534 * 0.9) / 610));
});

test("on the bookshelf, pinned to the wall between the units (top 86, bottom 262 of the frame), a size smaller about its centre", () => {
  const f = frameOf(W, H, FEET), p = posterPlace(W, H, "bookshelf", FEET);
  expect(hangOf("bookshelf")).toBe("pin");
  expect(p.cx).toBeCloseTo(f.tx + 400 * f.s);
  expect(p.cy).toBeCloseTo(f.ty + ((86 + 262) / 2) * f.s);
  expect(p.box.bottom - p.box.top).toBeCloseTo(0.84 * (262 - 86) * f.s);
  // the room: on the wall between the window and the shelf
  const r = posterPlace(W, H, "room", FEET);
  expect(r.cy).toBeCloseTo(f.ty + ((66 + 226) / 2) * f.s);
  expect(r.box.bottom - r.box.top).toBeCloseTo(0.84 * (226 - 66) * f.s);
});

test("its paper and bounty are rolled from the creature, as the reference's creator rolls them; the bounty in the interface's language", () => {
  const seed = posterSeed({ body: "round", color: "#6cc4a4", accent: "#e86a8a", iris: "#3d78c4", ears: "cat", head: "none", face: "none" });
  expect(seed).toBe("round|#6cc4a4|#e86a8a|#3d78c4|cat|none|none");
  // the reference's own figure for this creature
  expect(posterBounty(seed, "en")).toBe("859,000,000-");
  expect(posterBounty(seed, "es")).toBe("859.000.000-");
});

test("only the clouds and space move the poster on their own", () => {
  const moving = ["tone", "plain", "sunset", "lagoon", "mountains", "beach", "city", "space", "forest", "room", "clouds", "night", "underwater", "candy", "aurora", "bookshelf", "meadow"]
    .filter((id) => posterMoves(id, hangOf(id)));
  expect(moving).toEqual(["space", "clouds"]);
});

const words = { title: "WANTED", status: "ONLINE OR PAUSED", fine: ["A", "B", "C"] as [string, string, string] };

/** The poster laid on backdrop `id` at moment `t`: the calls on the tile's canvas, and the boxes its mount was drawn for. */
function lay(id: string, t: number) {
  const place = posterPlace(W, H, id, FEET), { ctx, calls } = recordingContext(W, H), boxes: Array<[PosterBox, number]> = [];
  const art = document.createElement("canvas"), ground = document.createElement("canvas");
  const o: LayOptions = { W, PX: H, id, hang: hangOf(id), place, art, ground, drawBg: (box, at) => { boxes.push([box, at]); } };
  layPoster(ctx, o, t);
  return { place, calls, boxes };
}
const rotations = (calls: Call[]) => calls.filter(([name]) => name === "rotate").map(([, [a]]) => a as number);
const tacks = (calls: Call[]) => calls.filter(([name, [v]]) => name === "set:fillStyle" && v === "#d8434e").length;

test("on a wall it hangs from a tack in its top-left corner, drooping to the right; in the forest a nail at its top centre", () => {
  const pin = lay("plain", 0);
  expect(rotations(pin.calls)).toEqual([0.03]);
  expect(tacks(pin.calls)).toBe(1);
  const nail = lay("forest", 0);
  expect(rotations(nail.calls)).toEqual([-0.022]);
  expect(tacks(nail.calls)).toBe(1);
  // on a scene's own mount, no tack
  expect(tacks(lay("mountains", 0).calls)).toBe(0);
});

test("on the clouds the balloons bob and the poster sways under them: 4·pk up and down, ±0.02 rad about its tilt", () => {
  // at rest: the backdrop as drawn for the poster at rest, the poster tilted -0.022
  const rest = lay("clouds", 0);
  expect(rest.boxes).toEqual([]);
  expect(rotations(rest.calls)).toEqual([-0.022]);
  // at t, the backdrop (its balloons on the clock) drawn for the poster moved by sin(1.1t)·4·pk, the tilt -0.022 + 0.02·sin(0.8t)
  const t = Math.PI / 2 / 1.1, moved = lay("clouds", t), pk = moved.place.pk;
  expect(moved.boxes).toHaveLength(1);
  const [box, at] = moved.boxes[0];
  expect(at).toBe(t);
  expect(box.top - moved.place.box.top).toBeCloseTo(4 * pk);
  expect(rotations(moved.calls)[0]).toBeCloseTo(-0.022 + 0.02 * Math.sin(0.8 * t));
});

test("in space it floats on a tether, tumbling slowly, a little satellite holding it", () => {
  const at = (t: number) => lay("space", t);
  expect(rotations(at(0).calls)[0]).toBeCloseTo(-0.1);
  expect(rotations(at(3).calls)[0]).toBeCloseTo(-0.1 + 0.07 * Math.sin(0.5 * 3));
  // the satellite: its gold body and its panels, turning with the clock
  expect(at(3).calls.some(([name, [v]]) => name === "set:fillStyle" && v === "#f0c25a")).toBe(true);
  expect(rotations(at(3).calls)[1]).toBeCloseTo(-0.25 + Math.sin(0.4 * 3) * 0.12);
});

test("the art is drawn once, at its scale, with a margin for its drop shadow", () => {
  const art = posterArt(null, 0.5, "seed", words, "123,000,000-");
  expect([art.width, art.height]).toEqual([Math.ceil((PW + 80) * 0.5), Math.ceil((PH + 80) * 0.5)]);
});
