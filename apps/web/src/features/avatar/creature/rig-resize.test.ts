import { expect, it, vi } from "vitest";

/* The scene host builds its Stage fixed (host.ts MAKE): it sizes the renderer itself (setRenderSize, from the canvas it shows, sizeStage)
 * and then draws. A trial framing is drawn into a smaller canvas (a pixel to the css px) that may be of nearly the visible canvas's
 * shape or of any other: draw() must never resize the stage's renderer (the big backing store) to a trial's shape and back; only
 * setRenderSize, with the visible canvas, does. The real Stage runs, with a renderer that draws nothing. */

const sizes: Array<[number, number]> = [];
vi.mock("three", async (importOriginal) => {
  const three = await importOriginal<Record<string, unknown>>();
  class WebGLRenderer {
    domElement = document.createElement("canvas");
    shadowMap = { enabled: false, type: 0, autoUpdate: true };
    autoClear = true;
    setPixelRatio() {}
    setSize(w: number, h: number) { sizes.push([w, h]); }
    render() {}
    clearDepth() {}
  }
  return { ...three, WebGLRenderer };
});

import { Stage } from "./rig.js";

// A 2D context that takes any drawing (the creature paints its textures into canvases) and gives back nothing.
const context = (): unknown => new Proxy(function () {}, { get: (_t, key) => (key === "createLinearGradient" || key === "createRadialGradient" ? () => ({ addColorStop() {} }) : context()), apply: () => context(), set: () => true });
HTMLCanvasElement.prototype.getContext = (() => context()) as never;

const canvas = (w: number, h: number) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };

it("a fixed stage is sized by the host from the canvas it shows, and a trial canvas of any shape draws without resizing it", () => {
  const stage = new Stage("paint", 768, "wide", { fixed: true }); // as the scene host makes it
  const shown = canvas(3196, 1752), item = stage.add({ body: "blob", state: "idle" }, shown, { turn: 0, off: 0 });
  stage.camera.aspect = 3196 / 1752;
  sizes.length = 0;
  stage.setRenderSize(shown.width, shown.height); // the host's sizeStage
  expect(sizes).toEqual([[3196, 1752]]);
  sizes.length = 0;
  for (const [w, h] of [[1598, 876], [1597, 876], [1598, 877], [959, 526], [958, 525], [1000, 1000]]) {
    item.canvas = canvas(w, h);
    stage.draw(item, 0, 0, true);
  }
  expect(sizes).toEqual([]); // not even for a canvas of another shape
  stage.setRenderSize(shown.width, shown.height); // the same canvas: nothing to do
  expect(sizes).toEqual([]);
  stage.setRenderSize(1118, 628); // the visible canvas changed
  expect(sizes).toEqual([[1118, 628]]);
});
