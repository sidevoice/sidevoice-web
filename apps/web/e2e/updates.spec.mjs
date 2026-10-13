import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The desktop app's update. Where the room says it is VARIANTS `update-notice`: A, the default, a pill floating over
 * the stage's tile at its top; B, at the end of the conversation's title row. Whatever it says — ready, available, a
 * download or an install that failed — in English or Spanish, with a long version, it stays in its place at a laptop's
 * widths, its words cut short, never its action, and the room never moves for it. In Updates, the app's row and its
 * action fit a 320px screen in either language, whatever its state. The updater is the desktop app's
 * (sidevoice-desktop #56), faked in the page with its status pushed as the app would, in manual mode: one found shows
 * at once. */

const VERSION = "12.345.6789-beta.12+build.20261013.abcdef0";
const STATES = [
  { state: "ready", version: VERSION },
  { state: "available", version: VERSION },
  { state: "downloading", version: VERSION, progress: 0.42 },
  { state: "available", version: VERSION, error: { code: "update-download-failed" } },
  { state: "ready", version: VERSION, error: { code: "update-install-failed" } },
];
const label = (status) => `${status.state}${status.error ? " " + status.error.code : ""}`;

async function withUpdater(page, language, first = STATES[0], notice = "pill") {
  await page.addInitScript(({ language, first, notice }) => {
    localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: language }));
    // Where the room says it (VARIANTS `update-notice`), beside the harness's own picks.
    let picked = {};
    try { picked = JSON.parse(localStorage.getItem("sidevoice.variants") || "{}") ?? {}; } catch { /* None picked. */ }
    localStorage.setItem("sidevoice.variants", JSON.stringify({ ...picked, "update-notice": notice }));
    let now = first;
    const listeners = new Set();
    window.__pushUpdate = (next) => { now = next; for (const listener of listeners) listener(next); };
    window.__sidevoiceDesktop = { host: {
      build: { channel: "release", version: "0.9.0", commit: "abcdef0123456789", date: "2026-10-13T08:00:00Z" },
      updater: {
        settings: async () => ({ mode: "manual" }), setMode: async (mode) => ({ mode }),
        status: async () => now, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
        check: async () => now, download: async () => now, restart: async () => undefined,
      },
    } };
  }, { language, first, notice });
}

/** Whether Updates fits its screen: nothing in it past the viewport's edges or its card's padding, nothing scrolling
 *  sideways. A ground drawn into the padding on purpose (an update's line, lit by a landing: its negative margin) may
 *  reach that far, never past the card. */
const fits = (pane) => {
  const width = document.documentElement.clientWidth;
  const out = [...pane.querySelectorAll("*")].filter((element) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0) return false;
    const card = element.closest(".updates-settings");
    const inner = card && card !== element ? card.getBoundingClientRect() : null;
    const pad = inner ? parseFloat(getComputedStyle(card).paddingRight) : 0;
    const bleed = Math.min(pad, Math.max(0, -parseFloat(getComputedStyle(element).marginRight) || 0));
    return box.left < -0.5 || box.right > width + 0.5 || (inner && box.right > inner.right - pad + bleed + 0.5);
  }).map((element) => element.className || element.tagName);
  return { out, paneFits: pane.scrollWidth <= pane.clientWidth + 1, pageFits: document.documentElement.scrollWidth <= width + 1 };
};

for (const language of ["en", "es"]) {
  test(`Updates fits 320px in ${language}: the app's row and its action, whatever its state`, async ({ page }) => {
    await installHarness(page);
    await withUpdater(page, language, STATES[1]);
    await page.setViewportSize({ width: 320, height: 720 });
    await page.goto("/voice/");
    await page.locator("#settings-open").click();
    await page.locator("#settings-updates").click();
    // The page slid in: the list of sections gone, nothing moving.
    await expect(page.locator(".settings-nav")).toBeHidden();
    await expect(page.locator(".settings-content")).not.toHaveAttribute("data-motion", /./);
    const pane = page.locator("#pane-updates");
    const row = pane.locator("#updates-app");
    await expect(pane.locator(".app-update-settings")).toBeVisible();
    for (const status of STATES) {
      await page.evaluate((next) => window.__pushUpdate(next), status);
      await expect(row).toHaveAttribute("data-state", status.state);
      if (status.state === "downloading") await expect(row.getByRole("progressbar")).toBeVisible();
      else await expect(row.getByRole("button")).toBeVisible();
      expect(await pane.evaluate(fits), label(status)).toEqual({ out: [], paneFits: true, pageFits: true });
    }
  });
}

/** Whether `element` sits inside the page's width and nothing in it scrolls sideways. */
const inPage = (element) => {
  const width = document.documentElement.clientWidth;
  const box = element.getBoundingClientRect();
  const out = [...element.querySelectorAll("*")].filter((child) => { const inner = child.getBoundingClientRect(); return inner.width > 0 && (inner.left < -0.5 || inner.right > width + 0.5 || inner.right > box.right + 0.5); })
    .map((child) => child.className || child.tagName);
  return { out, inside: box.left >= -0.5 && box.right <= width + 0.5, noSpill: element.scrollWidth <= element.clientWidth + 1, pageFits: document.documentElement.scrollWidth <= width + 1 };
};


/** Where the room's notice sits (VARIANTS `update-notice`): A, over the stage's tile at its top; B, at the end of the
 *  title row, after the conversation's name and its machine (with no conversation on the stage, as A). Either inside
 *  the page, its × at its end and inside it, its action whole and its words cut short before it, clear of the
 *  conversation's name. */
const noticeFits = (notice) => {
  const width = document.documentElement.clientWidth;
  const box = notice.getBoundingClientRect();
  const hide = notice.querySelector(".update-notice-hide");
  const action = notice.querySelector(".update-notice-line > .ui-button");
  const text = notice.querySelector(".update-notice-text").getBoundingClientRect();
  const tile = document.querySelector(".stage-tile").getBoundingClientRect();
  const row = notice.closest(".stage-title");
  const before = row ? [...row.children].filter((child) => !child.contains(notice)).map((child) => child.getBoundingClientRect()) : [];
  return {
    inside: box.left >= -0.5 && box.right <= width + 0.5,
    hideLast: notice.lastElementChild === hide,
    hideInside: hide.getBoundingClientRect().left >= box.left - 0.5 && hide.getBoundingClientRect().right <= box.right + 0.5,
    actionWhole: action.scrollWidth <= action.clientWidth + 1,
    wordsBeforeAction: text.right <= action.getBoundingClientRect().left + 0.5,
    clear: row ? before.every((other) => other.width === 0 || box.left >= other.right - 0.5)
      : box.left >= tile.left - 0.5 && box.right <= tile.right + 0.5 && box.top >= tile.top - 0.5,
    pageFits: document.documentElement.scrollWidth <= width + 1,
  };
};
/** Where the room stands — its stage's tile, its title row — which the notice never moves. */
const roomBox = () => {
  const tile = document.querySelector(".stage-tile").getBoundingClientRect();
  const title = document.querySelector(".stage-title")?.getBoundingClientRect();
  return { tileTop: tile.top, tileHeight: tile.height, titleHeight: title?.height ?? 0 };
};

for (const language of ["en", "es"]) {
  for (const width of [1024, 1280]) {
    for (const notice of ["pill", "title"]) {
      test(`${notice === "pill" ? "A, the pill" : "B, the title row"} at ${width}px in ${language}: in its place, its × at its end, its action whole, the room unmoved, whatever it says`, async ({ page }) => {
        await installHarness(page);
        await withUpdater(page, language, { state: "idle" }, notice);
        await page.setViewportSize({ width, height: 800 });
        await page.goto("/voice/");
        await expect(page.locator(".stage-tile")).toBeVisible();
        const before = await page.evaluate(roomBox);
        const shown = page.locator(".update-notice:not([data-leaving])");
        for (const status of STATES) {
          await page.evaluate((next) => window.__pushUpdate(next), status);
          // Manual, as this app is: a download's progress is Updates' to show, never the room's.
          if (status.state === "downloading") { await expect(page.locator(".update-notice")).toHaveCount(0); continue; }
          await expect(shown).toBeVisible();
          await expect(shown.locator(".update-notice-text")).toHaveAttribute("title", new RegExp(VERSION.replace(/[.+]/g, "\\$&")));
          expect(await shown.evaluate(noticeFits), label(status)).toEqual({ inside: true, hideLast: true, hideInside: true, actionWhole: true, wordsBeforeAction: true,
            clear: true, pageFits: true });
          expect(await page.evaluate(roomBox), label(status)).toEqual(before);
        }
      });
    }
  }
}

test("the notice's Download acts in place, its download said in Updates only; the next one waiting shows meanwhile, a machine behind, which lands on its Copy in Updates", async ({ page }) => {
  await installHarness(page);
  // The paired machine says its Sidevoice is behind (contract gap #57).
  await page.route("**/api/host/status", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } }) }));
  await withUpdater(page, "en", STATES[1]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/voice/");
  const shown = page.locator(".update-notice:not([data-leaving])");
  await expect(shown.locator(".update-notice-text")).toHaveText(`Version ${VERSION} available`);
  await shown.getByRole("button", { name: "Download" }).click();
  await page.evaluate((version) => window.__pushUpdate({ state: "downloading", version, progress: 0.3 }), VERSION);
  // Downloading: the room says nothing of the app's; the next one waiting shows, the machine's.
  await expect(shown.locator(".update-notice-text")).toHaveText(/needs an update$/);
  await shown.getByRole("button", { name: "See updates" }).click();
  await expect(page.locator("#language-settings")).toBeVisible();
  await expect(page.locator("#settings-updates")).toHaveAttribute("aria-current", "page");
  const copy = page.locator("[id^='updates-machine-'] button").first();
  await expect(copy).toBeFocused();
  await expect(copy).toBeInViewport();
});
