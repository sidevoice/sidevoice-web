import { expect, it, vi } from "vitest";

/* The eye patch's strap is one clean band across the head (operator, 2026-11-13: "una cinta doble y rayas raras encima de la
 * cabeza", at work, with the cogs and the crank's machine, and typing). The strap is ink and lies 0.012 off the head; the inverted
 * hull the rig draws round a part (rig.js addOutline: the same mesh, back faces, pushed out along its normals) sank into the head
 * there and came out of it only as a sliver above the strap and as depth-fighting stripes along it, in every pose (plainest
 * where the head tips). An ink part is its own outline (the patch's lens and the monocle's cord are built without one), so the
 * patch adds no hull. The rig runs here as it does in the page, with a renderer that draws nothing (the test's DOM has no WebGL). */

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<Record<string, unknown>>();
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0, autoUpdate: true };
    setPixelRatio() {}
    setSize() {}
  }
  return { ...three, WebGLRenderer };
});

/** A 2D context that draws nothing (the rig paints its textures with one): every method answers with another such thing. */
const blank = (): unknown => new Proxy(function () {}, { get: (_t, key) => (key === "data" ? new Uint8ClampedArray(4) : key === "width" ? 0 : key === Symbol.toPrimitive ? () => 0 : blank()), set: () => true, apply: () => blank() });
vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => blank()) as never);

import "./accessories.js";
import { Stage } from "./rig.js";
import { rigSpec, type CreatureChoice } from "./catalogue";

interface Obj { isMesh?: boolean; userData: Record<string, unknown>; children: Obj[]; geometry?: { attributes: { position: { count: number } } } }

/** The bunny of the report (round, cream, bunny ears), with `eyewear`. */
const bunny = (eyewear: string): CreatureChoice => ({ body: "round", color: "#e9e4da", accent: "#e86a8a", iris: "#2f9a96", eyes: "normal", ears: "bunny", head: "none", face: "none", eyewear });

/** Every mesh the creature is built of, as the rig holds them: the parts, and the ink hulls (`userData.outline`) hung on them. */
function meshes(eyewear: string) {
  const stage = new Stage("paint", 256) as unknown as { add(spec: object, canvas: HTMLCanvasElement, opts: object): { c: { root: Obj } } };
  const { c } = stage.add(rigSpec(bunny(eyewear)), document.createElement("canvas"), { turn: 0, off: 0 });
  const parts: Obj[] = [], hulls: Obj[] = [];
  const visit = (o: Obj) => { if (o.isMesh) (o.userData.outline ? hulls : parts).push(o); o.children.forEach(visit); };
  visit(c.root);
  return { parts, hulls };
}

it("the eye patch is built (the lens, its rim and the strap), so the check below has something to hold", () => {
  const plain = meshes("none"), patched = meshes("eye patch");
  expect(patched.parts.length - plain.parts.length).toBe(3);
});

it("the eye patch adds no ink hull: its strap is one band with no second one over the head", () => {
  const plain = meshes("none"), patched = meshes("eye patch");
  expect(patched.hulls.length).toBe(plain.hulls.length);
});
