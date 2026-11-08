import { expect, it, vi } from "vitest";

/* The key light's shadow map is not the reference's 1024², and three.js filters a shadow over `radius` texels of it: the
 * filter's reach in the world is radius / mapSize. A map of another size takes the radius in proportion, or the floor's
 * shadow edge (and the creature's own cast shadows) would be as many times wider as the map is smaller. The real Stage
 * runs here, with a renderer that draws nothing (the test's DOM has no WebGL). */

vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<Record<string, unknown>>(); // (the project has no types for three)
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0 };
    setPixelRatio() {}
    setSize() {}
  }
  return { ...three, WebGLRenderer };
});

import { Stage } from "./rig.js";

interface Keyed { key: { shadow: { radius: number; mapSize: { x: number; y: number } } } }
const shadow = (stage: Stage) => (stage as unknown as Keyed).key.shadow;
/** The filter's reach across the shadow map (a share of it): the same share of the same camera is the same size in the world. */
const reach = (stage: Stage) => shadow(stage).radius / shadow(stage).mapSize.x;
/** The reference's: a 1024² map filtered over 6 texels. */
const REFERENCE = 6 / 1024;

it("the stage's 512² map is filtered over 3 texels, the reach the reference's 6 over 1024² has", () => {
  for (const px of [256, 384, 768]) { // the page's stages: faces, the microphone hero, the scene's tile
    const stage = new Stage("paint", px);
    expect(stage.shadowPx).toBe(512);
    expect(shadow(stage).mapSize.x).toBe(512);
    expect(shadow(stage).radius).toBe(3);
    expect(reach(stage)).toBe(REFERENCE);
  }
});

it("setShadowPx keeps the reach whatever the map: 1024² is filtered over 6 texels, 2048² over 12, back to 512² over 3", () => {
  const stage = new Stage("paint", 256);
  for (const [px, radius] of [[1024, 6], [2048, 12], [512, 3]] as const) {
    expect(stage.setShadowPx(px)).toBe(true);
    expect(shadow(stage).mapSize.x).toBe(px);
    expect(shadow(stage).mapSize.y).toBe(px);
    expect(shadow(stage).radius).toBe(radius);
    expect(reach(stage)).toBe(REFERENCE);
  }
  expect(stage.setShadowPx(512)).toBe(false); // unchanged
});
