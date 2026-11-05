import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* On a phone the creature's eyes follow the finger over the stage's tile (T23). The browser keeps the touch for that: a
 * drag is not taken for a scroll, which would cancel the pointer after its first move and drop the gaze. */

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

test("a finger dragged over the stage stays the creature's: every move reaches it, none is cancelled", async ({ page, browserName }) => {
  await installHarness(page, { participants: { first: [{ thread_id: "t1", title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" }] } });
  await page.goto("/voice/");
  await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  const tile = page.locator(".stage-tile[data-mood]");
  await tile.waitFor();
  await expect(page.locator(".stage-agent[data-style=creature]")).toHaveCount(1);
  expect(await tile.evaluate((element) => getComputedStyle(element).touchAction)).toBe("none");
  // A real finger, as the browser takes it, is Chromium's to give (DevTools input).
  test.skip(browserName !== "chromium", "touch input is driven through Chromium's DevTools");
  await tile.evaluate((element) => {
    window.__events = [];
    for (const type of ["pointerdown", "pointermove", "pointerup", "pointercancel"]) element.addEventListener(type, () => window.__events.push(type), true);
  });
  const box = await tile.boundingBox();
  const x = box.x + box.width * 0.3, from = box.y + box.height * 0.9, to = box.y + box.height * 0.1;
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y: from, id: 1 }] });
  for (let i = 1; i <= 12; i += 1) await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: from + (to - from) * i / 12, id: 1 }] });
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  const events = await page.evaluate(() => window.__events);
  expect(events).not.toContain("pointercancel");
  expect(events.filter((type) => type === "pointermove").length).toBeGreaterThanOrEqual(12);
  expect(events.at(-1)).toBe("pointerup");
});
