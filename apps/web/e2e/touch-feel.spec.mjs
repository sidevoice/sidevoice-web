import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* On a phone the page answers a finger as an app does (styles/app.css and each control's :active): no grey flash, no
 * rubber band of the whole page, the chrome not selectable while what is said and typed is, a press shown at once,
 * and small icon buttons reaching a finger's 44px. */

test.use({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true });

const conversation = { thread_id: "t1", title: "sidevoice-web", available: true, reach: { state: "listening" }, harness: "claude-code" };

async function joined(page) {
  await installHarness(page, { participants: { first: [conversation] } });
  await page.goto("/voice/");
  await page.getByRole("button", { name: /Choose a conversation/ }).first().click();
  await page.locator("#participants").getByText("sidevoice-web").first().click();
  await page.locator(".stage-tile[data-mood]").waitFor();
}

test("the page is a screen: no tap flash, no rubber band, the chrome not selectable, the conversation and the text box are", async ({ page }) => {
  await joined(page);
  const hover = await page.evaluate(() => matchMedia("(hover: none) and (pointer: coarse)").matches);
  test.skip(!hover, "this engine's touch emulation does not report a touch screen");
  await page.locator("#transcript-toggle").click();
  await expect(page.locator("#transcript[data-open]")).toBeVisible();
  const styles = await page.evaluate(() => {
    const css = (node) => getComputedStyle(node);
    const select = (node) => css(node).webkitUserSelect || css(node).userSelect;
    return {
      highlight: css(document.querySelector("button")).webkitTapHighlightColor,
      overscroll: css(document.documentElement).overscrollBehaviorY,
      header: select(document.querySelector(".room-header")),
      composer: select(document.querySelector("#text-message")),
    };
  });
  expect(styles.highlight).toBe("rgba(0, 0, 0, 0)");
  expect(styles.overscroll).toBe("none");
  expect(styles.header).toBe("none");
  expect(styles.composer).toBe("text");
});

test("a pressed control shows it at once, and a small icon button takes a finger 44px wide", async ({ page }) => {
  await joined(page);
  const add = page.locator(".room-header .header-new");
  const box = await add.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const before = await add.evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.mouse.down();
  const pressed = await add.evaluate((node) => getComputedStyle(node).backgroundColor);
  await page.mouse.up();
  await page.keyboard.press("Escape");
  expect(pressed).not.toBe(before);

  await page.locator("#transcript-toggle").click();
  const close = page.locator(".transcript-close");
  await expect(close).toBeVisible();
  // Measured once the sheet has risen.
  await expect.poll(() => page.locator("#transcript").evaluate((node) => getComputedStyle(node).transform)).toBe("none");
  const reach = await close.evaluate((node) => {
    const box = node.getBoundingClientRect();
    const at = (x, y) => node.contains(document.elementFromPoint(x, y));
    return { width: box.width, edges: [at(box.left - 3, box.top + box.height / 2), at(box.right + 3, box.top + box.height / 2), at(box.left + box.width / 2, box.top - 3), at(box.left + box.width / 2, box.bottom + 3)] };
  });
  expect(reach.width).toBeLessThan(44);
  expect(reach.edges).toEqual([true, true, true, true]);
});
