import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The microphone's chevron and the panel it opens (features/call/AudioDevices), in real browsers: drawn right above
 * the chevron, its left edge on the microphone pill's (Meet's), not across the call's bar; only the microphone and the
 * speaker in it. Escape closes it and gives focus back to the chevron, a click outside closes it, and with a mouse
 * resting on the chevron opens it and leaving both the chevron and the panel closes it. */

async function room(page) {
  await installHarness(page);
  await page.goto("/voice/");
  const toggle = page.getByRole("button", { name: "Microphone and speaker" });
  await expect(toggle).toBeVisible();
  return { toggle, panel: page.locator("#audio-devices") };
}

/** Where the panel is against the chevron: the gap between the panel's foot and the chevron's top, how far their left
 *  edges are apart, and whether the panel is on top where it is drawn. */
async function placement(page, toggle, panel) {
  await expect(panel).toBeVisible();
  // Radix places it once it has measured it: wait until it stops moving.
  let box = await panel.boundingBox(), before;
  do { before = box; await page.waitForTimeout(50); box = await panel.boundingBox(); } while (box.x !== before.x || box.y !== before.y);
  const chevron = await toggle.boundingBox();
  const onTop = await page.evaluate(({ x, y }) => !!document.elementFromPoint(x, y)?.closest("#audio-devices"), { x: box.x + box.width / 2, y: box.y + box.height / 2 });
  return { gap: chevron.y - (box.y + box.height), left: box.x - chevron.x, box, chevron, onTop };
}

test("the chevron's panel opens right above it, its left edge on the microphone's pill, with only the microphone and the speaker", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  const { toggle, panel } = await room(page);
  await toggle.click();
  const { gap, left, box, onTop } = await placement(page, toggle, panel);
  expect(gap, "just above the chevron").toBeGreaterThanOrEqual(12);
  expect(gap, "just above the chevron").toBeLessThanOrEqual(24);
  expect(Math.abs(left), "aligned with the chevron").toBeLessThanOrEqual(4);
  expect(box.width, "compact, not the bar's width").toBeLessThanOrEqual(320);
  expect(onTop).toBe(true);
  // Each picker is named by its icon and its accessible name, with no text label of its own.
  await expect(panel.getByRole("combobox", { name: "Microphone" })).toBeVisible();
  await expect(panel.getByRole("combobox", { name: "Speaker" })).toBeVisible();
  await expect(panel.getByRole("combobox")).toHaveCount(2);
  // No refresh and no close: the list is read on opening and follows the devices; it closes on its own.
  await expect(panel.getByRole("button")).toHaveCount(0);
  // The chevron closes it again.
  await toggle.click();
  await expect(panel).toBeHidden();
});

test("from the keyboard it opens with focus in it, and Escape closes it and gives focus back to the chevron", async ({ page }) => {
  const { toggle, panel } = await room(page);
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(panel).toBeVisible();
  // Focus goes into it (the panel itself while the list is still being read, else its first select).
  await expect.poll(() => page.evaluate(() => !!document.activeElement?.closest("#audio-devices"))).toBe(true);
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  await page.keyboard.press("ArrowUp");
  await expect(panel).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(toggle).toBeFocused();
});

test("a click outside closes it", async ({ page }) => {
  const { toggle, panel } = await room(page);
  await toggle.click();
  await expect(panel).toBeVisible();
  const chevron = await toggle.boundingBox();
  await page.mouse.click(chevron.x + 300, chevron.y - 300);
  await expect(panel).toBeHidden();
});

test("with a mouse, resting on the chevron opens it; the way up to the panel keeps it; leaving both closes it", async ({ page }) => {
  const { toggle, panel } = await room(page);
  await page.mouse.move(2, 2);
  await toggle.hover();
  await expect(panel).toBeVisible();
  // Opened by the pointer, it takes no focus.
  expect(await page.evaluate(() => !!document.activeElement?.closest("#audio-devices"))).toBe(false);
  const { box, chevron } = await placement(page, toggle, panel);
  // Up from the chevron, across the gap, into the panel: it stays.
  await page.mouse.move(chevron.x + chevron.width / 2, box.y + box.height / 2, { steps: 8 });
  await page.waitForTimeout(600);
  await expect(panel).toBeVisible();
  // Away from both: gone after a moment.
  await page.mouse.move(2, 2, { steps: 4 });
  await expect(panel).toBeHidden();
  // A click on one the pointer opened holds it: leaving no longer closes it.
  await toggle.hover();
  await expect(panel).toBeVisible();
  await toggle.click();
  await page.mouse.move(2, 2, { steps: 4 });
  await page.waitForTimeout(600);
  await expect(panel).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("a tap opens it above the call's controls, the screen's width, and a tap outside closes it", async ({ page }) => {
    const { toggle, panel } = await room(page);
    await toggle.tap();
    const { gap, box, onTop } = await placement(page, toggle, panel);
    expect(gap).toBeGreaterThanOrEqual(12);
    expect(gap).toBeLessThanOrEqual(24);
    expect(box.x).toBeGreaterThanOrEqual(11);
    expect(box.x + box.width).toBeLessThanOrEqual(390 - 11);
    expect(box.width).toBeGreaterThanOrEqual(390 - 24 - 1);
    expect(onTop).toBe(true);
    await page.touchscreen.tap(195, 120);
    await expect(panel).toBeHidden();
  });
});
