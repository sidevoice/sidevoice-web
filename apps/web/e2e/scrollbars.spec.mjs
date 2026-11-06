import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";
import { conversation } from "./motion-states.mjs";

// Playwright hides Chromium's scrollbars by default. These checks must exercise the real scrollport.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
const people = Array.from({ length: 20 }, (_, i) => conversation(i + 1));
// A few, for the specs that need the list to fit the window first: a card is two lines of a conversation's creature and
// state (about 90 px with its gap), so twenty need 1800 px and more; eight fit in a 1800 px window with the rest of the sidebar.
const few = people.slice(0, 8);

async function openList(page, theme = "light", list = people) {
  await installHarness(page, { participants: { first: list } });
  await page.addInitScript((theme) => {
    localStorage.setItem("sidevoice.appearance", theme);
    localStorage.setItem("sidevoice.motion", "still");
  }, theme);
  await page.goto("/voice/");
  await page.locator("#participants .participant-row").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

// The sidebar's layout (phone, compact desktop, desktop) is React state fed by media queries, and it lags setViewportSize by
// a frame or more, much more while the creature's software GL holds the thread. A layout that changes puts the open list
// away, so a list seen open just after the resize may be the old layout's, about to close. Wait for the new layout to have
// taken over: nothing open, and the compact one at its rail.
const layoutAt = (width) => (width < 560 ? "phone" : width < 900 ? "compact" : "desktop");
let layoutNow = "desktop";
async function resize(page, width) {
  await page.setViewportSize({ width, height: 700 });
  const layout = layoutAt(width);
  if (layout !== layoutNow) {
    layoutNow = layout;
    await page.waitForFunction((layout) => {
      const aside = document.querySelector("#conversations");
      return !aside.hasAttribute("data-open") && (layout !== "compact" || aside.hasAttribute("data-collapsed"));
    }, layout, { timeout: 30_000 });
  }
}

async function expand(page) {
  const sidebar = page.locator("#conversations");
  // Retried as a whole, but a toggle is pressed only while it says the list is closed: a second press on a list that is
  // already opening would close it again.
  await expect(async () => {
    const closed = page.locator('[aria-controls="conversations"][aria-expanded="false"]:visible');
    if (await closed.count()) await closed.first().click({ timeout: 2_000 });
    await expect(sidebar.locator(".participant-copy").first()).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

const geometry = (page) => page.locator("#participants").evaluate((el) => {
  const rect = el.getBoundingClientRect();
  const card = el.querySelector(".participant-row").getBoundingClientRect();
  return { gap: rect.left + el.clientLeft + el.clientWidth - card.right, cardWidth: card.width,
    horizontalOverflow: el.scrollWidth - el.clientWidth, overflow: el.scrollHeight > el.clientHeight };
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: expanded cards leave room for the scrollbar through window resizes`, async ({ page }, testInfo) => {
    // Six sizes, each with a screenshot, and each resize has the stage solve its framing again on the pixels: the creature's
    // trial renders (about 70 ms a frame in a software GL) share the thread this spec reads the list's geometry on.
    test.setTimeout(240_000);
    layoutNow = "desktop";
    await page.setViewportSize({ width: 1100, height: 700 });
    await openList(page, theme);
    for (const width of [1440, 1100, 900, 899, 700, 390]) {
      await resize(page, width);
      await expand(page);
      const list = page.locator("#participants");
      await expect.poll(async () => (await geometry(page)).gap, { timeout: 30_000 }).toBeGreaterThanOrEqual(16);
      expect((await geometry(page)).horizontalOverflow).toBe(0);
      for (const fraction of [0, 0.5, 1]) {
        await list.evaluate((el, fraction) => { el.scrollTop = (el.scrollHeight - el.clientHeight) * fraction; }, fraction);
        expect((await geometry(page)).gap).toBeGreaterThanOrEqual(16);
      }
      await list.evaluate((el) => { el.scrollTop = 0; });
      await page.locator('#participants .person').first().click();
      // Selecting a conversation dismisses a modal list; reopen it for the evidence.
      await expand(page);
      const bounds = await list.boundingBox();
      // Exercise overlay painting too: a resting macOS/WebKit scrollbar can be completely invisible.
      await page.mouse.move(bounds.x + bounds.width - 5, bounds.y + 80);
      await page.mouse.wheel(0, 10);
      await page.waitForTimeout(100);
      await page.screenshot({ path: testInfo.outputPath(`${theme}-${width}.jpg`), quality: 80 });
    }
  });
}

test("classic scrollbar appearance does not change card width", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 1800 });
  await openList(page, "light", few);
  const before = await geometry(page);
  expect(before.overflow).toBe(false);
  await page.setViewportSize({ width: 1100, height: 400 });
  expect((await geometry(page)).overflow).toBe(true);
  expect((await geometry(page)).cardWidth).toBeCloseTo(before.cardWidth, 1);
});

test("cards keep their width without scrollbar-gutter support", async ({ page }) => {
  // Model an older CSS parser: discard the unknown declaration and take the unsupported-feature branch.
  // Patching window.CSS.supports alone would not affect the stylesheet's @supports evaluation.
  await page.route("**/*.css", async (route) => {
    const response = await route.fetch();
    const css = (await response.text())
      .replace(/@supports\s+not\s*\(scrollbar-gutter\s*:\s*stable\s*\)/g, "@supports (display: block)")
      .replace(/scrollbar-gutter\s*:\s*stable\s*;?/g, "");
    await route.fulfill({ response, body: css });
  });
  await page.setViewportSize({ width: 1100, height: 1800 });
  await openList(page, "light", few);
  const list = page.locator("#participants");
  const before = await geometry(page);
  expect(before.overflow).toBe(false);
  await expect(list).toHaveCSS("overflow-y", "scroll");
  await expect(list).toHaveCSS("scrollbar-gutter", "auto");
  await page.setViewportSize({ width: 1100, height: 400 });
  expect((await geometry(page)).overflow).toBe(true);
  expect((await geometry(page)).cardWidth).toBeCloseTo(before.cardWidth, 1);
  expect((await geometry(page)).gap).toBeGreaterThanOrEqual(16);
});

test("the overflowing rail keeps its avatars visible and the list scrolls from the keyboard", async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 400 });
  await openList(page);
  await page.locator(".sidebar-collapse").click();
  await expect(page.locator("#conversations")).toHaveAttribute("data-collapsed", "true");
  await expect.poll(() => page.locator("#participants").evaluate((el) => {
    const avatar = el.querySelector(".conversation-avatar").getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    return avatar.right <= rect.left + el.clientLeft + el.clientWidth && avatar.left >= rect.left + el.clientLeft;
  })).toBe(true);
  const last = page.locator("#participants .person").last();
  await last.focus();
  await expect(last).toBeInViewport();
  await expect.poll(() => page.locator("#participants").evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expect(last).toHaveAttribute("aria-pressed", "true");
});
