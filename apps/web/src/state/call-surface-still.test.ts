import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { creatureFromSeed } from "../features/avatar/creature/catalogue";

/* A native call surface's still is the creature's face, or, where the page cannot draw creatures, the fallback the page
 * shows in the creature's body colour: never nothing for the rest of the call. A host that did not load gives no still
 * yet, and the publisher asks again with the next change. The host is mocked, and so is the 2D canvas (jsdom has none). */

const host = vi.hoisted(() => ({ fail: false, face: null as HTMLCanvasElement | null }));
const loadHost = vi.hoisted(() => () => {
  if (host.fail) throw new Error("Failed to fetch dynamically imported module");
  return { faceImage: async () => host.face };
});
vi.mock("../features/avatar/creature/host", loadHost);

let painted: string[] = [];
beforeEach(() => {
  vi.resetModules();
  vi.doMock("../features/avatar/creature/host", loadHost);
  Object.assign(host, { fail: false, face: null });
  painted = [];
  vi.spyOn(console, "warn").mockImplementation(() => {});
  const context = {
    beginPath() {}, moveTo() {}, bezierCurveTo() {}, closePath() {},
    set fillStyle(color: string) { painted.push("fill " + color); },
    fill() { painted.push("fill"); },
    drawImage() { painted.push("face"); },
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation((() => context) as never);
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(() => "data:image/png;base64,UE5H");
});
afterEach(() => { vi.restoreAllMocks(); });

test("the still is the creature's face where the page can draw it", async () => {
  host.face = document.createElement("canvas");
  const { renderStill } = await import("./call-surface-still");
  expect(await renderStill("t-login", 240)).toEqual({ png: "UE5H", px: 240, k: 1 });
  expect(painted).toEqual(["face"]);
});

test("where the page cannot draw creatures, the still is the fallback in the creature's body colour", async () => {
  const { renderStill } = await import("./call-surface-still");
  expect(await renderStill("t-login", 240)).toEqual({ png: "UE5H", px: 240, k: 1 });
  expect(painted).toEqual(["fill " + creatureFromSeed("t-login").color, "fill"]);
});

test("a host that did not load gives no still yet, and the next ask loads it", async () => {
  host.fail = true;
  const { renderStill } = await import("./call-surface-still");
  expect(await renderStill("t-login", 240)).toBeNull();
  expect(painted).toEqual([]);
  host.fail = false;
  host.face = document.createElement("canvas");
  expect(await renderStill("t-login", 240)).toEqual({ png: "UE5H", px: 240, k: 1 });
});

test("a still that cannot be drawn says why, once per still and reason", async () => {
  const { renderStill } = await import("./call-surface-still");
  // The creature's code does not load: told, once.
  host.fail = true;
  expect(await renderStill("t1", 108)).toBeNull();
  expect(await renderStill("t1", 108)).toBeNull();
  expect(console.warn).toHaveBeenCalledWith("[sidevoice] call surface: no still for t1 at 108px:", expect.any(Error));
  const told = vi.mocked(console.warn).mock.calls.filter(([said]) => String(said).startsWith("[sidevoice] call surface")).length;
  expect(told).toBe(1);
  // It loads, but the canvas gives no PNG: another reason, told once too.
  host.fail = false;
  host.face = document.createElement("canvas");
  vi.mocked(HTMLCanvasElement.prototype.toDataURL).mockImplementation(() => "data:,");
  expect(await renderStill("t1", 108)).toBeNull();
  expect(await renderStill("t1", 108)).toBeNull();
  const reasons = vi.mocked(console.warn).mock.calls.filter(([said]) => String(said).startsWith("[sidevoice] call surface"));
  expect(reasons).toHaveLength(2);
  expect(String(reasons[1][1])).toContain("the canvas gave no PNG");
});
