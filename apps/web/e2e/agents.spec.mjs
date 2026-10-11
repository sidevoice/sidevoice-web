import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { expect, test } from "@playwright/test";

/* Settings → Machines → a machine's Agents, rendered in real browsers on the static site, with the paired machine
 * answered here: its identity proved with a real P-256 key, and its Agents API faked (salvaged from #48). */

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const spki = publicKey.export({ type: "spki", format: "der" });
const hostFingerprint = createHash("sha256").update(spki).digest("base64url");
const pairing = {
  fp: hostFingerprint,
  public_key: spki.toString("base64"),
  host: "E2E Host",
  urls: ["http://127.0.0.1:4173"],
  rv: null,
  device_id: "device-e2e",
  token: "e2e-device-token",
  paired_at: 1_790_000_000,
};

const foreignCodex = {
  id: "codex", label: "Codex", present: true, version: "1.0", registration: "foreign", connect: "manual", actionable: false,
  instructions: { command: "codex mcp remove sidevoice", file: "~/.codex/config.toml", snippet: '[mcp_servers.sidevoice]\ncommand = "/opt/sidevoice/bin/connector"' },
};
const claude = (connected = false, actionable = true) => ({
  id: "claude", label: "Claude Code", present: true, version: "1.0", registration: connected ? "connected" : "not-connected",
  connect: "auto", actionable, instructions: { command: "claude mcp add sidevoice" },
});
const listing = ({ connected = false, actionable = true } = {}) => ({
  agents: [foreignCodex, claude(connected, actionable)], scanned_at: "2026-10-02T12:00:00Z",
});

async function respond(route, value, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

/** The paired machine, answering at the page's own origin; what it was asked, and how it answers next. */
async function installHarness(page) {
  const fake = { scans: 0, hostMode: "normal", connectMode: "success", authorization: [] };
  await page.route("**/api/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const pathname = url.pathname;
    if (pathname === "/api/rendezvous") return respond(route, { kind: "node", fingerprint: hostFingerprint });
    if (pathname === "/api/device/identity") {
      const nonce = url.searchParams.get("nonce") || "";
      const signature = sign("sha256", Buffer.from(`sidevoice-node-identity:${nonce}`), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url");
      return respond(route, { public_key: pairing.public_key, signature });
    }
    if (pathname === "/api/presentation") return respond(route, { binding: null, call: null, room: { web_build: null } });
    if (pathname === "/api/presentation/participants") return respond(route, { participants: [] });
    if (pathname === "/api/presentation/history") return respond(route, { messages: [] });
    if (pathname === "/api/host/agents") {
      fake.authorization.push(request.headers().authorization || "");
      if (fake.hostMode === "revoked") return respond(route, { detail: "pairing revoked" }, 401);
      fake.scans++;
      return respond(route, listing({ actionable: fake.scans >= 2 }));
    }
    if (pathname === "/api/host/agents/claude/connect") {
      fake.authorization.push(request.headers().authorization || "");
      if (fake.connectMode === "fail") return respond(route, { error: { key: "no-connector" } }, 503);
      return respond(route, listing({ connected: true }));
    }
    if (pathname.startsWith("/api/host/agents/")) return respond(route, listing());
    if (pathname.startsWith("/api/")) return respond(route, {});
    return route.continue();
  });
  // This device paired with that machine, its first setup finished (so the room shows, not the setup), and the page
  // pointed at the machine: the static site's own origin.
  await page.addInitScript((hostPairing) => {
    localStorage.setItem("sidevoice.pairings", JSON.stringify({ in_use: hostPairing.fp, pairings: [hostPairing] }));
    localStorage.setItem("sidevoice.onboarding", JSON.stringify({ version: 1, choice: "remote", agents_done: false, deferred_at: null, completed_at: 1, trials: {} }));
    window.__SIDEVOICE_TARGET__ = window.location.origin;
  }, pairing);
  return fake;
}

/** Settings, from the header's ⋯ menu, at Machines. The runtime loads after the page renders and wires the menu's
 *  Settings entry: it is waited for, as a person's first tap would be. */
async function openMachines(page, width, height) {
  await page.setViewportSize({ width, height });
  await page.waitForFunction(() => !!window.sidevoiceActions);
  await page.locator("#call-menu > summary").click();
  await page.locator("#settings-open").click();
  const dialog = page.locator("#language-settings");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  await page.locator("#settings-machines").click();
  await expect(page.locator("#pane-machines")).toBeVisible();
  return dialog;
}

async function openAgents(page) {
  const open = page.getByRole("button", { name: "Review agents for E2E Host" });
  await expect(open).toBeVisible();
  await open.click();
  await expect(page.getByRole("heading", { name: "E2E Host" })).toBeVisible();
  const tab = page.getByRole("tab", { name: "Agents" });
  await expect(tab).toHaveAttribute("aria-selected", "true");
  return tab;
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
  await expect(page.getByRole("heading", { name: "Sidevoice" })).toBeVisible();

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
  await expect(page.locator(".host-agent-row[data-registration='connected']")).toContainText("Connected to Sidevoice");
  expect(fake.authorization.length).toBeGreaterThan(0);
  expect(fake.authorization.every((header) => header === "Bearer e2e-device-token")).toBe(true);

  // The smallest phone: every action still on screen.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.getByRole("button", { name: "Back to machines" }).click();
  const reviewAgents = page.getByRole("button", { name: "Review agents for E2E Host" });
  await expectInsideViewport(reviewAgents, 320, 568);
  await reviewAgents.click();
  await expect(page.getByRole("heading", { name: "E2E Host" })).toBeVisible();
  await expectInsideViewport(agents, 320, 568);
  await expect(agents).toHaveAttribute("aria-selected", "true");
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
  await page.getByRole("button", { name: "Check again" }).click();

  const pairingDialog = page.getByRole("dialog", { name: "Connect to a machine" });
  await expect(pairingDialog).toBeVisible();
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("sidevoice.pairings")));
  expect(stored.pairings[0].revoked).toBe(true);
  await pairingDialog.getByRole("button", { name: "Close pairing" }).click();
  await page.getByRole("button", { name: "Back to machines" }).click();
  await expect(page.locator(".machine-row[data-state='revoked']")).toContainText("E2E Host");
  await expect(page.getByRole("tab", { name: "Agents" })).toHaveCount(0);
});
