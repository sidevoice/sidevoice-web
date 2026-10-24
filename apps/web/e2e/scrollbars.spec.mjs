import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";
import { conversation } from "./motion-states.mjs";

// Playwright hides Chromium's scrollbars by default. These checks must exercise the real scrollport.
test.use({ launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] } });
const people = Array.from({ length: 20 }, (_, i) => conversation(i + 1));

async function openList(page, theme = "light") {
  await installHarness(page, { participants: { first: people } });
  await page.addInitScript((theme) => {
    localStorage.setItem("sidevoice.appearance", theme);
    localStorage.setItem("sidevoice.motion", "still");
  }, theme);
  await page.goto("/voice/");
  await page.locator("#participants .participant-row").first().waitFor();
  await page.evaluate(() => document.fonts.ready);
}

async function expand(page) {
  const sidebar = page.locator("#conversations");
  if (await sidebar.getAttribute("data-collapsed")) {
    await page.locator(".sidebar-collapse").click();
  } else if (await page.getByRole("button", { name: /^All conversations/ }).isVisible()) {
    await page.getByRole("button", { name: /^All conversations/ }).click();
  }
  await expect(sidebar.locator(".participant-copy").first()).toBeVisible();
}

const geometry = (page) => page.locator("#participants").evaluate((el) => {
  const rect = el.getBoundingClientRect();
  const card = el.querySelector(".participant-row").getBoundingClientRect();
  return { gap: rect.left + el.clientLeft + el.clientWidth - card.right, cardWidth: card.width,
    horizontalOverflow: el.scrollWidth - el.clientWidth, overflow: el.scrollHeight > el.clientHeight };
});

for (const theme of ["light", "dark"]) {
  test(`${theme}: expanded cards leave room for the scrollbar through window resizes`, async ({ page }, testInfo) => {
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1100, height: 700 });
    await openList(page, theme);
    for (const width of [1440, 1100, 900, 899, 700, 390]) {
      await page.setViewportSize({ width, height: 700 });
      await expand(page);
      const list = page.locator("#participants");
      await expect.poll(async () => (await geometry(page)).gap).toBeGreaterThanOrEqual(16);
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
  await openList(page);
  const before = await geometry(page);
  expect(before.overflow).toBe(false);
  await page.setViewportSize({ width: 1100, height: 400 });
  expect((await geometry(page)).overflow).toBe(true);
  expect((await geometry(page)).cardWidth).toBeCloseTo(before.cardWidth, 1);
});

test("native and themed appearances switch live without changing the layout", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1100, height: 700 });
  await openList(page);
  const list = page.locator("#participants");
  await expect(list).toHaveCSS("scrollbar-color", "auto");
  const before = await geometry(page);
  await page.evaluate(() => {
    localStorage.setItem("sidevoice.variants", JSON.stringify({ scrollbars: "themed" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "sidevoice.variants" }));
  });
  await expect.poll(() => list.evaluate((el) => getComputedStyle(el).scrollbarColor)).not.toBe("auto");
  expect((await geometry(page)).cardWidth).toBeCloseTo(before.cardWidth, 1);
  await page.locator('#participants .person').first().click();
  for (const theme of ["light", "dark"]) {
    await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; }, theme);
    const bounds = await list.boundingBox();
    await page.mouse.move(bounds.x + bounds.width - 5, bounds.y + 80);
    await page.mouse.wheel(0, 10);
    await page.waitForTimeout(100);
    await page.screenshot({ path: testInfo.outputPath(`themed-${theme}.jpg`), quality: 80 });
  }
  await page.evaluate(() => {
    localStorage.setItem("sidevoice.variants", JSON.stringify({ scrollbars: "native" }));
    window.dispatchEvent(new StorageEvent("storage", { key: "sidevoice.variants" }));
  });
  await expect(list).toHaveCSS("scrollbar-color", "auto");
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
