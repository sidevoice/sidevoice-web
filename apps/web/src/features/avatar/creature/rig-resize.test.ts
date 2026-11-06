import { expect, it, vi } from "vitest";

/* A trial framing is drawn into a smaller canvas (a pixel to the css px) of nearly the visible canvas's shape: its sides are
 * whole pixels, so its aspect is off by up to a pixel's worth. That must not resize the stage's renderer (the big backing store)
 * to the trial's shape and back: only a canvas of another shape does. The real Stage runs, with a renderer that draws nothing. */

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

it("a trial canvas a pixel off the visible shape draws without resizing the renderer; another shape does", () => {
  const stage = new Stage("paint", 768);
  const shown = canvas(3196, 1752), item = stage.add({ body: "blob", state: "idle" }, shown, { turn: 0, off: 0 });
  stage.camera.aspect = 3196 / 1752;
  stage.setRenderSize(3196, 1752);
  sizes.length = 0;
  for (const [w, h] of [[1598, 876], [1597, 876], [1598, 877], [959, 526], [958, 525]]) {
    item.canvas = canvas(w, h);
    stage.camera.aspect = 3196 / 1752;
    stage.draw(item, 0, 0, true);
  }
  expect(sizes).toEqual([]);
  item.canvas = canvas(1000, 1000); // a canvas of another shape: the renderer follows it
  stage.draw(item, 0, 0, true);
  expect(sizes).toHaveLength(1);
});
