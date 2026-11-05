import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* What moves on the stage (web#278): the agent is its creature, one canvas its rig draws into (features/avatar/creature/).
 * With the GPU it is drawn live, about thirty frames a second; without it, it holds still in its state's key pose and asks
 * for no frame. Nothing it shows is a CSS animation, and nothing at all runs on an SVG element (which WebKit would repaint
 * every frame, desktop#149). The thumbnails are still faces either way. */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

async function stage(page, motion) {
  await page.addInitScript((how) => localStorage.setItem("sidevoice.motion", how), motion);
  await installHarness(page, { participants: { first: [conversation("t1", "sidevoice-core"), conversation("t2", "sidevoice-web")] } });
  await page.goto("/voice/");
  await page.locator("#participants").getByText("sidevoice-core").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
}

/** The CSS animations running under `selector` (not the transitions of a change of state): how many, and how many on
 *  SVG elements. */
const running = (page, selector) => page.evaluate((selector) => {
  const all = document.getAnimations().filter((a) => "animationName" in a && a.playState === "running" && a.effect?.target?.closest(selector));
  return { all: all.length, svg: all.filter((a) => a.effect.target instanceof SVGElement).length };
}, selector);

/** Whether this browser gives the page WebGL at all (the creature needs it; without it its fallback stands in). */
const webgl = (page) => page.evaluate(() => !!document.createElement("canvas").getContext("webgl"));
const noWebgl = async (page) => {
  test.info().annotations.push({ type: "skip-pixels", description: "this browser gives no WebGL: the creature's fallback stands in" });
  await expect(page.locator(".stage-agent[data-style=creature] svg.creature-fallback")).toBeVisible();
};

/** What a canvas shows now, as a data URL; "" while it is blank. */
const pixels = (locator) => locator.evaluate((canvas) => {
  const blank = document.createElement("canvas");
  blank.width = canvas.width; blank.height = canvas.height;
  const now = canvas.toDataURL();
  return now === blank.toDataURL() ? "" : now;
});

test("with the GPU the stage's agent is its creature, drawn live on one canvas; nothing runs on SVG; its thumbnails are still faces", async ({ page }) => {
  await stage(page, "gpu");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "gpu");
  const agent = page.locator(".stage-agent[data-style=creature] > canvas");
  await expect(agent).toHaveCount(1);
  expect(await running(page, ".stage-scene")).toMatchObject({ svg: 0 });
  if (!await webgl(page)) return noWebgl(page);
  // It is drawn, and it moves: what it shows changes from one moment to the next (its breathing, its blinks).
  await expect.poll(() => pixels(agent), { timeout: 15_000 }).not.toBe("");
  const before = await pixels(agent);
  await expect.poll(() => pixels(agent), { timeout: 10_000 }).not.toBe(before);
  // A thumbnail is a still face: a canvas, drawn once.
  const thumbnail = page.locator("#participants .sv-avatar[data-style=creature] > canvas").first();
  await expect.poll(() => pixels(thumbnail), { timeout: 15_000 }).not.toBe("");
  expect(await running(page, "#participants")).toMatchObject({ svg: 0 });
});

test("without the GPU the stage's agent holds still in its key pose: drawn once, no frame asked for", async ({ page }) => {
  await stage(page, "still");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "still");
  const agent = page.locator(".stage-agent[data-style=creature] > canvas");
  await expect(agent).toHaveCount(1);
  const drawn = await webgl(page);
  if (drawn) await expect.poll(() => pixels(agent), { timeout: 15_000 }).not.toBe("");
  else await noWebgl(page);
  const still = await pixels(agent);
  // Nothing runs: no CSS animation in the scene, and no animation frame asked for while nothing changes.
  expect(await running(page, ".stage-scene")).toMatchObject({ all: 0 });
  const frames = await page.evaluate(() => new Promise((resolve) => {
    let n = 0;
    const raf = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) => { n += 1; return raf(callback); };
    setTimeout(() => resolve(n), 1500);
  }));
  expect(frames).toBe(0);
  expect(await pixels(agent)).toBe(still);
});

test("switching conversations, the stage never shows the previous conversation's creature", async ({ page }) => {
  await stage(page, "still");
  const agent = page.locator(".stage-agent[data-style=creature] > canvas");
  if (!await webgl(page)) return noWebgl(page);
  await expect.poll(() => pixels(agent), { timeout: 30_000 }).not.toBe("");
  // A coarse print of what the first creature looks like; then, every frame from the switch on, what the canvas shows.
  const print = () => {
    const c = document.querySelector(".stage-agent[data-style=creature] > canvas"), g = c?.width ? c.getContext("2d") : null;
    if (!g) return "";
    const d = g.getImageData(0, 0, c.width, c.height).data, out = [];
    for (let y = 0; y < 36; y++) for (let x = 0; x < 64; x++) { const i = (Math.floor((y + 0.5) * c.height / 36) * c.width + Math.floor((x + 0.5) * c.width / 64)) * 4; out.push(d[i] >> 4, d[i + 3] >> 4); }
    return out.join(",");
  };
  const before = await page.evaluate(`(${print})()`);
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  const seen = await page.evaluate(([print, before]) => new Promise((done) => {
    const take = new Function(`return (${print})()`), t0 = performance.now(), out = [];
    // only once the stage is the new conversation's (the agent's label names it)
    const sample = () => { if (document.querySelector(".stage-agent")?.getAttribute("aria-label")?.includes("sidevoice-web")) out.push(take() === before); if (performance.now() - t0 < 4000) requestAnimationFrame(sample); else done(out); };
    requestAnimationFrame(sample);
  }), [String(print), before]);
  expect(seen.length).toBeGreaterThan(0);
  expect(seen.filter(Boolean).length, "frames showing the previous creature after the switch").toBe(0);
});
