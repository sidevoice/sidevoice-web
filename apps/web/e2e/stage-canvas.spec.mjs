import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The canvas the agent is drawn on keeps its form factor's shape, whatever room the tile has: 16:9 on a web page, a
 * square on a phone, centred in the tile with bands around it (call-view.css --stage-ratio, useSceneScale). */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

async function canvasOnStage(page, phone) {
  await installHarness(page, { participants: { first: [conversation("t1", "sidevoice-core")] } });
  await page.goto("/voice/");
  if (phone) await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-core").first().click();
  const canvas = page.locator(".stage-tile[data-mood] > .stage-canvas");
  await expect(canvas).toBeVisible();
  const tile = await page.locator(".stage-tile[data-mood]").boundingBox();
  await expect.poll(async () => { const box = await canvas.boundingBox(); return box.width < tile.width - 2 || box.height < tile.height - 2; }).toBe(true);
  return { tile, box: await canvas.boundingBox() };
}

for (const [label, viewport, ratio] of [["a web page, 16:9", { width: 1280, height: 800 }, 16 / 9], ["a short, wide window, still 16:9", { width: 1600, height: 640 }, 16 / 9], ["a phone, square", { width: 390, height: 844 }, 1]]) {
  test(`on ${label}: the canvas keeps its shape, centred in the tile`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { tile, box } = await canvasOnStage(page, viewport.width < 900);
    expect(Math.abs(box.width / box.height - ratio)).toBeLessThan(0.02);
    // As large as fits: one side meets the tile's (inside its 1px border).
    expect(Math.min(tile.width - box.width, tile.height - box.height)).toBeLessThanOrEqual(3);
    // Centred: the bands on either side are equal.
    expect(Math.abs((box.x - tile.x) - (tile.x + tile.width - box.x - box.width))).toBeLessThanOrEqual(2);
    expect(Math.abs((box.y - tile.y) - (tile.y + tile.height - box.y - box.height))).toBeLessThanOrEqual(2);
  });
}


test("the stage carries no voice-model chips: the title opens what the call runs on, the models among it", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await canvasOnStage(page, false);
  await expect(page.locator(".stage-tile .voice-chip, .stage-title .voice-chip")).toHaveCount(0);
  await page.locator(".stage-title .stage-heading").click();
  const details = page.locator(".call-details");
  await expect(details).toBeVisible();
  await expect(details.locator(".voice-model").first()).toBeVisible();
});
