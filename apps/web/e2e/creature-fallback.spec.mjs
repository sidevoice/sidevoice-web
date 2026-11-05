import { expect, test } from "@playwright/test";
import { installHarness, stageFramed } from "./harness.mjs";

/* A creature never leaves an empty box (features/avatar/creature/fallback.ts). In a browser that gives no WebGL, every
 * copy of the agent shows its fallback: its body colour in a plain outline, standing where the creature stands. When the
 * browser takes a context away and gives it back, the creature is drawn again as it was. */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

async function stage(page) {
  await page.addInitScript(() => localStorage.setItem("sidevoice.motion", "still"));
  await installHarness(page, { participants: { first: [conversation("t1", "sidevoice-core"), conversation("t2", "sidevoice-web")] } });
  await page.goto("/voice/");
  await page.locator("#participants").getByText("sidevoice-core").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
}

/** What a canvas shows now, as a data URL; "" while it is blank. */
const pixels = (locator) => locator.evaluate((canvas) => {
  const blank = document.createElement("canvas");
  blank.width = canvas.width; blank.height = canvas.height;
  const now = canvas.toDataURL();
  return now === blank.toDataURL() ? "" : now;
});

test("in a browser without WebGL, the stage's agent and its thumbnails show the fallback, not an empty box", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      return /webgl/.test(kind) ? null : getContext.call(this, kind, ...rest);
    };
  });
  await stage(page);
  const agent = page.locator(".stage-agent[data-style=creature]");
  await expect(agent).toHaveAttribute("data-fallback");
  await expect(agent.locator("> canvas")).toBeHidden();
  const outline = agent.locator("svg.creature-fallback path");
  await expect(outline).toBeVisible();
  // In the creature's body colour, where the creature stands: in the figure's box, from its crown to its feet.
  const color = await agent.evaluate((element) => getComputedStyle(element).getPropertyValue("--av-color").trim());
  expect(await outline.evaluate((path) => getComputedStyle(path).fill)).toBe(await page.evaluate((c) => { const s = document.createElement("span"); s.style.color = c; document.body.append(s); const v = getComputedStyle(s).color; s.remove(); return v; }, color));
  const [box, shape] = await Promise.all([agent.boundingBox(), outline.boundingBox()]);
  expect(shape.height / box.height).toBeGreaterThan(0.6);
  expect(Math.abs(shape.x + shape.width / 2 - (box.x + box.width / 2))).toBeLessThan(2);
  // Accessible as the creature: the same image and label.
  await expect(agent).toHaveAttribute("role", "img");
  const thumbnail = page.locator("#participants .sv-avatar[data-style=creature]").first();
  await expect(thumbnail).toHaveAttribute("data-fallback");
  await expect(thumbnail.locator("svg.creature-fallback")).toBeVisible();
});

test("a context the browser takes away and gives back: the creature is drawn again, as it was", async ({ page }) => {
  // The page's WebGL contexts, kept so the test can take one away as the browser does.
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    window.__contexts = [];
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      const context = getContext.call(this, kind, ...rest);
      if (context && /webgl/.test(kind) && !window.__contexts.includes(context)) window.__contexts.push(context);
      return context;
    };
  });
  await stage(page);
  test.skip(!await page.evaluate(() => window.__contexts.length), "this browser gives no WebGL");
  const agent = page.locator(".stage-agent[data-style=creature] > canvas");
  await expect.poll(() => pixels(agent), { timeout: 15_000 }).not.toBe("");
  // What it is drawn as is what its framing is solved to (a trial render a frame, over by itself): taken before, the pixels
  // compared with are those of a creature about to be framed again.
  await stageFramed(page);
  const before = await pixels(agent);
  const losing = await page.evaluate(() => {
    window.__lose = window.__contexts.map((gl) => gl.getExtension("WEBGL_lose_context"));
    window.__lose.forEach((extension) => extension?.loseContext());
    return window.__lose.filter(Boolean).length;
  });
  test.skip(!losing, "this browser cannot take a context away on request");
  // Taken away for a moment: the canvas keeps its last frame, and no fallback flickers in.
  await page.waitForTimeout(300);
  expect(await pixels(agent)).toBe(before);
  await expect(page.locator(".stage-agent")).not.toHaveAttribute("data-fallback");
  // Given back: each stage gets a new renderer (a new context), and the creature is drawn again.
  await page.evaluate(() => window.__lose.forEach((extension) => extension?.restoreContext()));
  // Not counted against how many were taken away: one of them was already lost when the test took them (the browser logs
  // "context restoration not allowed" for it), and nothing gives it back. The two stages the page draws on, the creature's
  // and the faces', each hold a context again.
  await expect.poll(() => page.evaluate(() => window.__contexts.filter((gl) => !gl.isContextLost()).length)).toBeGreaterThanOrEqual(2);
  // The new renderer draws what the old one did: redrawn at another size, then at this one, the same pixels.
  const size = page.viewportSize();
  await page.setViewportSize({ width: size.width - 180, height: size.height + 40 });
  await expect.poll(async () => { const now = await pixels(agent); return now !== "" && now !== before; }, { timeout: 10_000 }).toBe(true);
  await page.setViewportSize(size);
  await expect.poll(() => pixels(agent), { timeout: 10_000 }).toBe(before);
});

test("only the faces' context taken away and not given back: the thumbnails show the fallback, the stage's creature stays", async ({ page }) => {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    window.__contexts = [];
    HTMLCanvasElement.prototype.getContext = function (kind, ...rest) {
      const context = getContext.call(this, kind, ...rest);
      if (context && /webgl/.test(kind) && !window.__contexts.includes(context)) window.__contexts.push(context);
      return context;
    };
  });
  await stage(page);
  test.skip(!await page.evaluate(() => window.__contexts.length), "this browser gives no WebGL");
  const agent = page.locator(".stage-agent[data-style=creature]");
  const thumbnail = page.locator("#participants .sv-avatar[data-style=creature]").first();
  await expect.poll(() => pixels(agent.locator("> canvas")), { timeout: 15_000 }).not.toBe("");
  await expect.poll(() => pixels(thumbnail.locator("> canvas")), { timeout: 15_000 }).not.toBe("");
  // The faces' stage renders 256 px squares; the stage's, 1152 × 768.
  const losing = await page.evaluate(() => {
    const faces = window.__contexts.find((gl) => gl.drawingBufferWidth === 256 && gl.drawingBufferHeight === 256);
    window.__lose = faces?.getExtension("WEBGL_lose_context") ?? null;
    window.__lose?.loseContext();
    return !!window.__lose;
  });
  test.skip(!losing, "this browser cannot take a context away on request");
  await expect(thumbnail).toHaveAttribute("data-fallback", { timeout: 10_000 });
  await expect(agent).not.toHaveAttribute("data-fallback");
  expect(await pixels(agent.locator("> canvas"))).not.toBe("");
  // Given back: the thumbnails are faces again.
  await page.evaluate(() => window.__lose.restoreContext());
  await expect(thumbnail).not.toHaveAttribute("data-fallback", { timeout: 10_000 });
  await expect.poll(() => pixels(thumbnail.locator("> canvas")), { timeout: 15_000 }).not.toBe("");
});
