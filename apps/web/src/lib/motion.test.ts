import { afterEach, beforeEach, expect, test, vi } from "vitest";

/* Each test loads the module afresh: the page decides once, and a GPU probe stands for the page. */
const fresh = async () => { vi.resetModules(); return import("./motion"); };
/** A WebGL context whose renderer is `renderer` (null: no context at all). */
const webgl = (renderer: string | null) => vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(renderer === null ? null : {
  getExtension: (name: string) => (name === "WEBGL_debug_renderer_info" ? { UNMASKED_RENDERER_WEBGL: 1 } : null),
  getParameter: () => renderer, RENDERER: 2,
} as unknown as RenderingContext);
let info: ReturnType<typeof vi.spyOn>;

beforeEach(() => { info = vi.spyOn(console, "info").mockImplementation(() => {}); });
afterEach(() => { localStorage.clear(); vi.restoreAllMocks(); delete document.documentElement.dataset.motion; });

test("with a GPU the drawings move: said on the page's root and logged once, with the renderer", async () => {
  webgl("Apple M2");
  const { motion, startMotion } = await fresh();
  expect(motion()).toBe("still");
  startMotion();
  expect(motion()).toBe("gpu");
  expect(document.documentElement.dataset.motion).toBe("gpu");
  startMotion();
  expect(info).toHaveBeenCalledTimes(1);
  expect(info).toHaveBeenCalledWith("[sidevoice] drawings move as GPU layers: GPU: Apple M2");
});

test("without hardware acceleration, or drawing in software, they hold still, and say why", async () => {
  webgl(null);
  let m = await fresh();
  m.startMotion();
  expect(m.motion()).toBe("still");
  expect(info).toHaveBeenLastCalledWith("[sidevoice] drawings hold still: no hardware-accelerated WebGL");
  for (const renderer of ["Google SwiftShader", "llvmpipe (LLVM 17.0.6, 256 bits)", "Microsoft Basic Render Driver"]) {
    webgl(renderer);
    m = await fresh();
    m.startMotion();
    expect(m.motion()).toBe("still");
    expect(info).toHaveBeenLastCalledWith(`[sidevoice] drawings hold still: software renderer (${renderer})`);
  }
});

test("set by hand it is what the setting says; a change of decision is heard", async () => {
  webgl(null);
  const { MOTION_KEY, motion, startMotion, subscribeMotion } = await fresh();
  const heard = vi.fn();
  subscribeMotion(heard);
  localStorage.setItem(MOTION_KEY, "gpu");
  startMotion();
  expect(motion()).toBe("gpu");
  expect(info).toHaveBeenLastCalledWith(`[sidevoice] drawings move as GPU layers: set by ${MOTION_KEY}`);
  localStorage.setItem(MOTION_KEY, "still");
  startMotion();
  expect(motion()).toBe("still");
  expect(heard).toHaveBeenCalledTimes(2);
});

test("under reduced motion they hold still, and move again when it is turned off", async () => {
  webgl("Apple M2");
  let reduce = true, changed: (() => void) | undefined;
  vi.spyOn(window, "matchMedia").mockImplementation((media: string) => ({
    media, get matches() { return media.includes("reduce") && reduce; }, onchange: null, addListener() {}, removeListener() {}, dispatchEvent: () => false,
    addEventListener: (_: string, listener: () => void) => { changed = listener; }, removeEventListener() {},
  }) as unknown as MediaQueryList);
  const { motion, startMotion } = await fresh();
  startMotion();
  expect(motion()).toBe("still");
  expect(info).toHaveBeenLastCalledWith("[sidevoice] drawings hold still: reduced motion");
  reduce = false;
  changed?.();
  expect(motion()).toBe("gpu");
});
