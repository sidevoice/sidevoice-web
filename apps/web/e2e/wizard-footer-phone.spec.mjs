import { mkdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* The setup's footer (Back, a quiet second action, the step's main action) never wraps ad hoc and never overflows its
 * card: on a phone it is one row when that fits, otherwise deliberately stacked (the main action full width on top, then
 * Back and the quiet action in one row below). Measured on the step that asks for a machine and on the one that tries the
 * end of turn, in every language, at 320, 360 and 390px. SCREENSHOTS=<dir> also writes the footer as a picture. */

const SHOTS = process.env.SCREENSHOTS;
const BASE = { version: 1, basics_done: true, agents_done: false, turn_done: false, completed_at: null, trials: {}, chosen: {}, baseline_release: 0, features: {} };
const STEPS = {
  // Asks for a machine: Back, Skip for now, and the pairing form's own Connect in the footer.
  machine: { ...BASE, choice: "remote" },
  // Transcription and voice settled (skipped): the end of turn's own step, Back, its quiet action and Try it.
  turn: { ...BASE, choice: "remote", machine_skipped: true, stt_skipped: true, tts_skipped: true },
};

async function footerAt(page, step, language, width, theme = "light") {
  await page.setViewportSize({ width, height: 740 });
  await installHarness(page, { onboarding: STEPS[step] });
  await page.addInitScript((ui) => {
    localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: ui }));
    localStorage.setItem("sidevoice.pairings", JSON.stringify({ pairings: [] }));
  }, language);
  await page.goto("/voice/");
  await page.evaluate((theme) => { document.documentElement.dataset.theme = theme; document.documentElement.style.colorScheme = theme; }, theme);
  const footer = page.locator("#wizard .wizard-actions");
  await expect(footer.locator(".wizard-quiet")).toBeVisible();
  await expect(footer.locator(".wizard-back")).toBeVisible();
  return footer;
}

/** Every button of the footer, as boxes, with the card's and the viewport's. */
const measure = (footer) => footer.evaluate((node) => {
  const box = (button) => button.getBoundingClientRect().toJSON();
  const buttons = [...node.querySelectorAll(".ui-button")].filter((button) => button.getClientRects().length).map((button) => ({ ...box(button), quiet: button.classList.contains("wizard-quiet"), back: button.classList.contains("wizard-back") }));
  return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, footer: box(node), buttons };
});

/** The rows the buttons fall in (tops within 2px of each other are one row). */
const rowsOf = (buttons) => {
  const rows = [];
  for (const button of buttons) {
    const row = rows.find((candidate) => Math.abs(candidate[0].top - button.top) <= 2);
    if (row) row.push(button); else rows.push([button]);
  }
  return rows.sort((a, b) => a[0].top - b[0].top);
};

function expectInside(m) {
  expect(m.scrollWidth).toBeLessThanOrEqual(m.width);
  for (const button of m.buttons) {
    expect(button.left, "inside the card, left").toBeGreaterThanOrEqual(m.footer.left - 0.5);
    expect(button.right, "inside the card, right").toBeLessThanOrEqual(m.footer.right + 0.5);
    expect(button.left).toBeGreaterThanOrEqual(0);
    expect(button.right).toBeLessThanOrEqual(m.width);
  }
}

/** One row, or the deliberate stack: the main action alone on top, full width, then the others in one row. Never between. */
function expectOneRowOrStack(m) {
  expectInside(m);
  const rows = rowsOf(m.buttons);
  if (rows.length === 1) return "row";
  expect(rows.length, "one row or the stack, never a partial wrap").toBe(2);
  expect(rows[0].length, "the main action alone on top").toBe(1);
  expect(rows[0][0].width).toBeGreaterThan(m.footer.width - 48);
  expect(rows[1].some((button) => button.back) && rows[1].some((button) => button.quiet), "Back and the quiet action below").toBe(true);
  return "stack";
}

const shot = async (footer, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await footer.screenshot({ path: path.join(SHOTS, name) }); };

for (const step of Object.keys(STEPS)) {
  for (const language of ["es", "de", "fr", "en"]) {
    for (const width of [320, 360, 390]) {
      test(`the ${step} step's footer fits at ${width}px in ${language}`, async ({ page }) => {
        const footer = await footerAt(page, step, language, width);
        const m = await measure(footer);
        const rows = rowsOf(m.buttons).length;
        if (language === "es") await shot(footer, `${step}-es-${width}-${rows === 1 ? "row" : "stack"}.png`);
        const layout = expectOneRowOrStack(m);
        // The decision (one row at 360px and up in the step that asks for a machine) is the design's, not a coincidence.
        if (step === "machine" && width >= 360) expect(layout, `${language} at ${width}px`).toBe("row");
      });
    }
  }
}
