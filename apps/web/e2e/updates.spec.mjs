import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The desktop app's update. Where the room says it is VARIANTS `update-notice`: C, the default, an update icon by
 * the brand whose popover acts in place or lands on Updates; B, a banner; A, the gear's mark; D, the sidebar's foot.
 * At the sidebar's foot (D) it is one row (UpdatesEntry's UpdateLine) that lands on Settings ›
 * Updates: whatever it says — ready, available, downloading, a download that failed — in English or Spanish, with a
 * long version, it stays inside the sidebar at a laptop's widths, its words cut short. Pressed, Settings opens on
 * Updates with the row's action (Download) in view and focused. In Updates, the app's row and its action fit a 320px
 * screen in either language, whatever its state. The updater is the desktop app's (sidevoice-desktop #56), faked in
 * the page with its status pushed as the app would. */

const VERSION = "12.345.6789-beta.12+build.20261013.abcdef0";
const STATES = [
  { state: "ready", version: VERSION },
  { state: "available", version: VERSION },
  { state: "downloading", version: VERSION, progress: 0.42 },
  { state: "available", version: VERSION, error: { code: "update-download-failed" } },
  { state: "ready", version: VERSION, error: { code: "update-install-failed" } },
];
const label = (status) => `${status.state}${status.error ? " " + status.error.code : ""}`;

async function withUpdater(page, language, first = STATES[0], notice = "foot") {
  await page.addInitScript(({ language, first, notice }) => {
    localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: language }));
    // Where the room says it (VARIANTS `update-notice`), beside the harness's own picks: the foot's row (D) unless a
    // test asks for another.
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

/** Where the row and what it holds sit against the sidebar's foot, in CSS pixels. */
const measure = (line) => {
  const foot = line.closest(".sidebar-foot");
  const sidebar = line.closest(".conversation-sidebar") ?? foot;
  const box = line.getBoundingClientRect();
  const edge = foot.getBoundingClientRect();
  const error = foot.querySelector(".update-line-error")?.getBoundingClientRect() ?? null;
  return {
    inside: box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5,
    nothingSpills: line.scrollWidth <= line.clientWidth + 1,
    errorInside: !error || (error.left >= edge.left - 0.5 && error.right <= edge.right + 0.5),
    footFits: foot.scrollWidth <= foot.clientWidth + 1,
    sidebarFits: sidebar.scrollWidth <= sidebar.clientWidth + 1,
  };
};

/** Whether Updates fits its screen: nothing in it past the viewport's edges or its card's padding, nothing scrolling
 *  sideways. */
const fits = (pane) => {
  const width = document.documentElement.clientWidth;
  const out = [...pane.querySelectorAll("*")].filter((element) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0) return false;
    const card = element.closest(".updates-settings");
    const inner = card && card !== element ? card.getBoundingClientRect() : null;
    const pad = inner ? parseFloat(getComputedStyle(card).paddingRight) : 0;
    return box.left < -0.5 || box.right > width + 0.5 || (inner && box.right > inner.right - pad + 0.5);
  }).map((element) => element.className || element.tagName);
  return { out, paneFits: pane.scrollWidth <= pane.clientWidth + 1, pageFits: document.documentElement.scrollWidth <= width + 1 };
};

for (const language of ["en", "es"]) {
  for (const width of [1024, 1280]) {
    test(`the update row stays inside the sidebar at ${width}px in ${language}, whatever it says`, async ({ page }) => {
      await installHarness(page);
      await withUpdater(page, language);
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/voice/");
      const line = page.locator(".sidebar-foot .update-line");
      for (const status of STATES) {
        await page.evaluate((next) => window.__pushUpdate(next), status);
        await expect(line).toBeVisible();
        if (status.state !== "downloading") await expect(line).toHaveAttribute("title", new RegExp(VERSION.replace(/[.+]/g, "\\$&")));
        const fit = await line.evaluate(measure);
        expect(fit, label(status)).toEqual({ inside: true, nothingSpills: true, errorInside: true, footFits: true, sidebarFits: true });
      }
    });
  }

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

test("the sidebar's row (D) lands on Updates, the app's Update the app in view and focused", async ({ page }) => {
  await installHarness(page);
  await withUpdater(page, "en", STATES[1]);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/voice/");
  await page.locator(".sidebar-foot .update-line").click();
  await expect(page.locator("#language-settings")).toBeVisible();
  await expect(page.locator("#settings-updates")).toHaveAttribute("aria-current", "page");
  const download = page.locator("#updates-app").getByRole("button", { name: "Update the app" });
  await expect(download).toBeFocused();
  await expect(download).toBeInViewport();
});

/** Whether `element` sits inside the page's width and nothing in it scrolls sideways. */
const inPage = (element) => {
  const width = document.documentElement.clientWidth;
  const box = element.getBoundingClientRect();
  const out = [...element.querySelectorAll("*")].filter((child) => { const inner = child.getBoundingClientRect(); return inner.width > 0 && (inner.left < -0.5 || inner.right > width + 0.5 || inner.right > box.right + 0.5); })
    .map((child) => child.className || child.tagName);
  return { out, inside: box.left >= -0.5 && box.right <= width + 0.5, noSpill: element.scrollWidth <= element.clientWidth + 1, pageFits: document.documentElement.scrollWidth <= width + 1 };
};

for (const language of ["en", "es"]) {
  for (const width of [1024, 1280]) {
    test(`the brand's update popover (C, the default) fits at ${width}px in ${language}, whatever the app's update says`, async ({ page }) => {
      await installHarness(page);
      await withUpdater(page, language, STATES[0], "brand");
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/voice/");
      const icon = page.locator(".sidebar-brand .update-brand");
      await expect(icon).toBeVisible();
      await icon.click();
      const panel = page.locator(".ui-popover:has(.updates-panel)");
      for (const status of STATES) {
        await page.evaluate((next) => window.__pushUpdate(next), status);
        await expect(panel.locator(".update-notice-text")).toBeVisible();
        expect(await panel.evaluate(inPage), label(status)).toEqual({ out: [], inside: true, noSpill: true, pageFits: true });
      }
    });

    test(`the banner (B) fits at ${width}px in ${language}, whatever the app's update says`, async ({ page }) => {
      await installHarness(page);
      await withUpdater(page, language, STATES[0], "banner");
      await page.setViewportSize({ width, height: 800 });
      await page.goto("/voice/");
      const banner = page.locator(".update-banner");
      for (const status of STATES) {
        await page.evaluate((next) => window.__pushUpdate(next), status);
        await expect(banner.locator(".update-notice-text")).toBeVisible();
        expect(await banner.evaluate(inPage), label(status)).toEqual({ out: [], inside: true, noSpill: true, pageFits: true });
      }
    });
  }
}

test("the brand's update popover (C, the default): the app's Update the app acts in place; a machine behind lands on its Copy in Updates", async ({ page }) => {
  await installHarness(page);
  // The paired machine says its Sidevoice is behind (contract gap #57).
  await page.route("**/api/host/status", (route) => route.fulfill({ status: 200, contentType: "application/json",
    body: JSON.stringify({ version: "0.8.1", update: { latest: "0.9.0", command: "sidevoice update" } }) }));
  await withUpdater(page, "en", STATES[1], "brand");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/voice/");
  const icon = page.locator(".sidebar-brand .update-brand");
  await expect(icon).toHaveAccessibleName("Updates, 2 waiting");
  await icon.click();
  const panel = page.locator(".ui-popover:has(.updates-panel)");
  // In place: its download starts, the popover stays.
  await panel.getByRole("button", { name: "Update the app" }).click();
  await page.evaluate((version) => window.__pushUpdate({ state: "downloading", version, progress: 0.3 }), VERSION);
  await expect(panel.getByText(/^Downloading Sidevoice /)).toBeVisible();
  // Not in place: Settings › Updates, the machine's row, its button focused.
  await panel.getByRole("button", { name: "See updates" }).click();
  await expect(page.locator("#language-settings")).toBeVisible();
  await expect(page.locator("#settings-updates")).toHaveAttribute("aria-current", "page");
  const copy = page.locator("[id^='updates-machine-'] button").first();
  await expect(copy).toBeFocused();
  await expect(copy).toBeInViewport();
});

test("the gear's mark (A) opens Updates on the app's Update the app, focused", async ({ page }) => {
  await installHarness(page);
  await withUpdater(page, "en", STATES[1], "gear");
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/voice/");
  const gear = page.locator(".sidebar-foot .sidebar-settings");
  await expect(gear).toHaveAccessibleName("Settings, an update is waiting");
  await gear.click();
  await expect(page.locator("#settings-updates")).toHaveAttribute("aria-current", "page");
  await expect(page.locator("#updates-app").getByRole("button", { name: "Update the app" })).toBeFocused();
});
