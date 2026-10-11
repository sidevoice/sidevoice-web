import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* Settings → Machines → a machine's Agents, rendered in real browsers on the static site, with the paired machine
 * answered here: its identity proved with a real P-256 key, and its Agents API faked (salvaged from #48). */

/** Settings, from the header's ⋯ menu, at Machines. The runtime loads after the page renders and wires the menu's
 *  Settings entry: it is waited for, as a person's first tap would be. */
async function openMachines(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(() => !!window.sidevoiceActions);
  // A phone's gear, at its header's right.
  await page.locator("#settings-open").click();
  const dialog = page.locator("#language-settings");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await page.locator("#settings-machines").click();
  await expect(page.locator("#pane-machines")).toBeVisible();
  return dialog;
}

async function openAgents(page) {
  // The machine's entry under Machines (at the pane's head on a phone) shows its page.
  const open = page.locator(".machines-inline .machine-entry[data-name='E2E Host']");
  await expect(open).toBeVisible();
  await open.click();
  await expect(open).toHaveAttribute("aria-current", "page");
  // Every part of the machine on its page, its agents among them.
  const agents = page.getByRole("heading", { name: "Agents", exact: true });
  await expect(agents).toBeVisible();
  await expect(page.getByText("Phone", { exact: true })).toBeVisible();
  return agents;
}

async function expectInsideViewport(locator, width, height) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  expect(box).not.toBeNull();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(width + 1);
  expect(box.y + box.height).toBeLessThanOrEqual(height + 1);
}

test("a machine's Agents at phone widths: a foreign one replaced by hand, a connect that fails then works, the device's token on each", async ({ page }) => {
  const fake = await installHarness(page);
  await page.goto("/voice/");
  // The room is up: its heading is there (a phone shows it to a screen reader only, a desktop at the column's head).
  await expect(page.locator("h1.brand")).toBeAttached();

  await openMachines(page, 390, 844);
  const agents = await openAgents(page);
  const foreign = page.locator(".host-agent-row[data-registration='foreign']");
  await expect(foreign).toContainText("Connected to a different MCP server");
  await foreign.getByRole("button", { name: "Replace manually" }).click();
  await expect(foreign.getByText("codex mcp remove sidevoice")).toBeVisible();
  await expect(foreign.getByRole("button", { name: "Connect" })).toHaveCount(0);

  const claudeRow = page.locator(".host-agent-row[data-registration='not-connected']");
  await expect(claudeRow.getByRole("button", { name: "Connect" })).toBeVisible();
  fake.connectMode = "fail";
  await claudeRow.getByRole("button", { name: "Connect" }).click();
  await expect(claudeRow.getByRole("alert")).toHaveText("Sidevoice is not running on this machine.");
  fake.connectMode = "success";
  await claudeRow.getByRole("button", { name: "Connect" }).click();
  await expect(page.locator(".host-agent-row[data-registration='connected']")).toContainText(/Connected to Sidevoice|is ready for new conversations/);
  expect(fake.authorization.length).toBeGreaterThan(0);
  expect(fake.authorization.every((header) => header === "Bearer e2e-device-token")).toBe(true);

  // The smallest phone: every action still on screen.
  await page.setViewportSize({ width: 320, height: 568 });
  const reviewAgents = page.locator(".machines-inline .machine-entry[data-name='E2E Host']");
  await expectInsideViewport(reviewAgents, 320, 568);
  await expect(reviewAgents).toHaveAttribute("aria-current", "page");
  await expectInsideViewport(agents, 320, 568);
  // The row stayed open in place, its hand-made replacement still shown: closing and opening it again fits too.
  const close = foreign.getByRole("button", { name: "Close" }).first();
  await expectInsideViewport(close, 320, 568);
  await close.click();
  const replace = page.getByRole("button", { name: "Replace manually" });
  await expectInsideViewport(replace, 320, 568);
  await replace.click();
  await expect(page.getByText("codex mcp remove sidevoice")).toBeVisible();
});

test("a machine that revokes this device loses its Agents actions and asks for pairing again", async ({ page }) => {
  const fake = await installHarness(page);
  await page.goto("/voice/");
  await openMachines(page, 390, 844);
  await openAgents(page);
  fake.hostMode = "revoked";
  await page.getByRole("button", { name: "Search again" }).click();

  const pairingDialog = page.getByRole("dialog", { name: "Connect to a machine" });
  await expect(pairingDialog).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sidevoice.pairings")));
  expect(stored.pairings[0].revoked).toBe(true);
  await pairingDialog.getByRole("button", { name: "Close pairing" }).click();
  await expect(page.locator(".machine-entry[data-state='revoked']").first()).toHaveAttribute("data-name", "E2E Host");
  await expect(page.getByRole("heading", { name: "Agents", exact: true })).toHaveCount(0);
});
