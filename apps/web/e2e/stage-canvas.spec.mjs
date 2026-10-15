import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The stage is a slide: the tile keeps its form factor's shape, whatever room its slot has — 16:9 on a web page, a
 * square on a phone — as large as the slot allows and centred in it with the app's own ground around it, the canvas
 * filling the tile (call-view.css --stage-ratio, useSceneScale). */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

async function canvasOnStage(page, phone) {
  await installHarness(page, { participants: { first: [conversation("t1", "sidevoice-core")] } });
  await page.goto("/voice/");
  if (phone) await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-core").first().click();
  const slot = page.locator(".stage-slot");
  const tileLocator = page.locator(".stage-tile[data-mood]");
  const canvas = tileLocator.locator("> .stage-canvas");
  await expect(canvas).toBeVisible();
  // Until it is fitted, the tile fills the slot: wait for it to take its shape.
  await expect.poll(async () => { const t = await tileLocator.boundingBox(), r = await slot.boundingBox(); return t.width < r.width - 2 || t.height < r.height - 2; }).toBe(true);
  return { slot: await slot.boundingBox(), tile: await tileLocator.boundingBox(), canvas: await canvas.boundingBox() };
}

for (const [label, viewport, ratio] of [["a web page, 16:9", { width: 1280, height: 800 }, 16 / 9], ["a short, wide window, still 16:9", { width: 1600, height: 640 }, 16 / 9], ["a phone, square", { width: 390, height: 844 }, 1]]) {
  test(`on ${label}: the tile keeps its shape, centred in its slot`, async ({ page }) => {
    await page.setViewportSize(viewport);
    const { slot, tile, canvas } = await canvasOnStage(page, viewport.width < 900);
    expect(Math.abs(tile.width / tile.height - ratio)).toBeLessThan(0.02);
    // As large as fits: one side meets the slot's.
    expect(Math.min(slot.width - tile.width, slot.height - tile.height)).toBeLessThanOrEqual(3);
    // Centred: the bands on either side are equal.
    expect(Math.abs((tile.x - slot.x) - (slot.x + slot.width - tile.x - tile.width))).toBeLessThanOrEqual(2);
    expect(Math.abs((tile.y - slot.y) - (slot.y + slot.height - tile.y - tile.height))).toBeLessThanOrEqual(2);
    // The canvas fills the tile, inside its 1px border.
    expect(Math.abs(canvas.width - tile.width)).toBeLessThanOrEqual(3);
    expect(Math.abs(canvas.height - tile.height)).toBeLessThanOrEqual(3);
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
