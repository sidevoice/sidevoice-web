import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The desktop app's update at the sidebar's foot is one row (UpdatesEntry's UpdateLine). Whatever it says — ready,
 * available with its Download, downloading, a download that failed — in English or Spanish, with a long version, it
 * stays inside the sidebar at a laptop's widths: its words cut short, its act (Download, Retry) in sight. The updater
 * is the desktop app's (sidevoice-desktop #56), faked in the page with its status pushed as the app would. */

const VERSION = "12.345.6789-beta.12+build.20261013.abcdef0";
const STATES = [
  { state: "ready", version: VERSION },
  { state: "available", version: VERSION },
  { state: "downloading", version: VERSION, progress: 0.42 },
  { state: "available", version: VERSION, error: { code: "update-download-failed" } },
  { state: "ready", version: VERSION, error: { code: "update-install-failed" } },
];

async function withUpdater(page, language) {
  await page.addInitScript(({ language, first }) => {
    localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: language }));
    let now = first;
    const listeners = new Set();
    window.__pushUpdate = (next) => { now = next; for (const listener of listeners) listener(next); };
    window.__sidevoiceDesktop = { host: { updater: {
      settings: async () => ({ mode: "manual" }), setMode: async (mode) => ({ mode }),
      status: async () => now, subscribe: (listener) => { listeners.add(listener); return () => listeners.delete(listener); },
      check: async () => now, download: async () => now, restart: async () => undefined,
    } } };
  }, { language, first: STATES[0] });
}

/** Where the row and what it holds sit against the sidebar's foot, in CSS pixels. */
const measure = (line) => {
  const foot = line.closest(".sidebar-foot");
  const sidebar = line.closest(".conversation-sidebar") ?? foot;
  const box = line.getBoundingClientRect();
  const edge = foot.getBoundingClientRect();
  const act = line.querySelector(".update-line-act")?.getBoundingClientRect() ?? null;
  const error = foot.querySelector(".update-line-error")?.getBoundingClientRect() ?? null;
  return {
    inside: box.left >= edge.left - 0.5 && box.right <= edge.right + 0.5,
    nothingSpills: line.scrollWidth <= line.clientWidth + 1,
    actInSight: !act || (act.left >= box.left - 0.5 && act.right <= box.right + 0.5 && act.width > 0),
    errorInside: !error || (error.left >= edge.left - 0.5 && error.right <= edge.right + 0.5),
    footFits: foot.scrollWidth <= foot.clientWidth + 1,
    sidebarFits: sidebar.scrollWidth <= sidebar.clientWidth + 1,
  };
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
        if (status.state === "downloading") await expect(line.getByRole("progressbar")).toBeVisible();
        else await expect(line).toHaveAttribute("title", new RegExp(VERSION.replace(/[.+]/g, "\\$&")));
        const fit = await line.evaluate(measure);
        expect(fit, `${status.state}${status.error ? " " + status.error.code : ""}`).toEqual({
          inside: true, nothingSpills: true, actInSight: true, errorInside: true, footFits: true, sidebarFits: true,
        });
      }
    });
  }
}
