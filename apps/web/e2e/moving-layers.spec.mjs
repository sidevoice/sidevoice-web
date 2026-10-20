import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* What moves on the stage moves as GPU layers (web#278): with the GPU, the agent, its backdrop and its desk are drawn in
 * layers (features/avatar/layers.ts) and every animation they run is on an HTML element, none on an SVG one, which
 * WebKit would repaint every frame (desktop#149). The thumbnails hold still. Without the GPU nothing there moves. */

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

test("with the GPU the stage's agent moves in layers, nothing on SVG; its thumbnails hold still", async ({ page }) => {
  await stage(page, "gpu");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "gpu");
  await expect(page.locator(".stage-agent > [data-layers]")).toHaveCount(1);
  await expect.poll(() => running(page, ".stage-agent")).toMatchObject({ svg: 0 });
  expect((await running(page, ".stage-agent")).all).toBeGreaterThan(0);
  // Its scene too (what of the backdrop and the desk moves).
  expect((await running(page, ".stage-scene")).svg).toBe(0);
  // A thumbnail is one still SVG.
  const thumbnail = page.locator("#participants .sv-avatar").first();
  await expect(thumbnail.locator("> svg")).toHaveCount(1);
  expect(await running(page, "#participants")).toMatchObject({ svg: 0 });
});

test("without the GPU the stage's agent is one still SVG, as everywhere else", async ({ page }) => {
  await stage(page, "still");
  await expect(page.locator("html")).toHaveAttribute("data-motion", "still");
  await expect(page.locator(".stage-agent > svg")).toHaveCount(1);
  await expect(page.locator("[data-layers]")).toHaveCount(0);
  expect(await running(page, ".stage-scene")).toMatchObject({ all: 0 });
});
