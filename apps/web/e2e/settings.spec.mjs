import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { expect, test } from "@playwright/test";

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
const languagePreferences = {
  ui_language: "en", audio_grace_seconds: 1, replay_on_return_seconds: 120,
  presence_sound: "on", locked_call: "on", turn_patience: "normal",
};

async function respond(route, value, status = 200) {
  await route.fulfill({ status, contentType: "application/json", body: JSON.stringify(value) });
}

async function installHarness(page, { languageMode = "pending", completed = true, initialChoice = null, agentsDone = false, remoteOnly = false } = {}) {
  let releaseDeferredLanguage;
  const deferredLanguage = new Promise((resolve) => { releaseDeferredLanguage = resolve; });
  const fake = { languageMode, remoteOnly, scans: 0, hostMode: "normal", connectMode: "success", disconnectMode: "success", authorization: [],
    releaseDeferredLanguage: () => releaseDeferredLanguage() };
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
    if (pathname === "/api/presentation/languages") {
      if (fake.languageMode === "pending") return new Promise(() => {});
      if (fake.languageMode === "fail") return respond(route, { detail: "temporary preference read failure" }, 503);
      if (fake.languageMode === "deferred") {
        await deferredLanguage;
        return respond(route, languagePreferences);
      }
      return respond(route, languagePreferences);
    }
    if (pathname === "/api/presentation") return respond(route, { binding: null, call: null, room: { web_build: null } });
    if (pathname === "/api/presentation/participants") return respond(route, { participants: [] });
    if (pathname === "/api/presentation/history") return respond(route, { messages: [] });
    if (pathname === "/api/presentation/integrations") return respond(route, { providers: fake.remoteOnly
      ? [{ id: "openai", label: "OpenAI", capabilities: ["transcription"], configured: true }] : [] });
    if (pathname === "/api/presentation/transcription/models") return respond(route, { models: fake.remoteOnly
      ? [{ id: "gpt-4o-transcribe", label: "GPT-4o Transcribe" }] : [] });
    if (pathname === "/api/presentation/voice-catalog") return respond(route, { providers: {} });
    if (pathname === "/api/models/check") return respond(route, { ok: true, step: "done", slow: false, passes: [] });
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
    if (pathname === "/api/host/agents/claude/disconnect") {
      fake.authorization.push(request.headers().authorization || "");
      if (fake.disconnectMode === "fail") return respond(route, { error: { key: "action-failed" } }, 503);
      return respond(route, listing());
    }
    if (pathname.startsWith("/api/host/agents/")) return respond(route, listing());
    if (pathname.startsWith("/api/")) return respond(route, {});
    return route.continue();
  });

  await page.addInitScript(({ hostPairing, completedSetup, choice, hasFinishedAgents, remoteOnly }) => {
    localStorage.setItem("sidevoice.pairings", JSON.stringify({ in_use: hostPairing.fp, pairings: [hostPairing] }));
    window.__SIDEVOICE_TARGET__ = window.location.origin;
    const seed = completedSetup
      ? { version: 1, choice: "remote", agents_done: true, deferred_at: null, completed_at: 1_790_000_000, trials: {} }
      : { version: 1, choice, agents_done: hasFinishedAgents, deferred_at: null, completed_at: null, trials: {} };
    let setupRecord = JSON.parse(localStorage.getItem("sidevoice.e2e-setup") || "null") || seed;
    window.__sidevoiceDesktop = {
      host: {
        nativeEngine: {
          capabilities: async () => ({ runs: "native", os: "macos", arch: "aarch64", has: remoteOnly ? [] : ["cpu"], memory_mb: 8192 }),
          installed: async () => [],
        },
        app: {
          settings: async () => ({ muteShortcut: "", callControlsAlways: false }),
          update: async () => ({ ok: true }),
          onboarding: {
            read: async () => setupRecord,
            patch: async (update) => {
              setupRecord = { ...setupRecord, ...update,
                trials: { ...setupRecord.trials, ...update.trials } };
              localStorage.setItem("sidevoice.e2e-setup", JSON.stringify(setupRecord));
              return setupRecord;
            },
          },
        },
        localHost: { state: async () => ({ state: "absent" }), subscribe: () => () => {}, pairing: async () => null },
      },
    };
  }, { hostPairing: pairing, completedSetup: completed, choice: initialChoice, hasFinishedAgents: agentsDone, remoteOnly });
  return fake;
}

function languageRequest(page) {
  return page.waitForRequest((request) => new URL(request.url()).pathname === "/api/presentation/languages");
}

test("first-run setup boots the real controller behind the W1 page", async ({ page }) => {
  await installHarness(page, { completed: false });
  await page.goto("/voice/");
  await expect(page.getByRole("dialog", { name: "Where do your agents run?" })).toBeVisible();
  expect(await page.evaluate(() => typeof window.sidevoiceActions?.chooseMachine)).toBe("function");
  expect(await page.evaluate(() => document.querySelector(".room-controller-shell")?.hidden)).toBe(true);
  await expect(page.locator("#loading-cancel")).toHaveCount(1);
});

test("deferred first-run setup stays paused across reload and resumes at its saved step", async ({ page }) => {
  await installHarness(page, { completed: false });
  await page.goto("/voice/");
  const wizard = page.getByRole("dialog", { name: "Where do your agents run?" });
  await expect(wizard).toBeVisible();
  await wizard.getByRole("button", { name: "Do this later" }).click();
  await expect(wizard).toBeHidden();
  await expect(page.getByRole("button", { name: "Continue setup" })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("button", { name: "Continue setup" })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Where do your agents run?" })).toBeHidden();
  await page.getByRole("button", { name: "Continue setup" }).click();
  await expect(page.getByRole("dialog", { name: "Where do your agents run?" })).toBeVisible();
});

test("remote first-run stage saves its chosen provider options and keeps Speak reachable on phones", async ({ page }) => {
  await installHarness(page, { languageMode: "success", completed: false, initialChoice: "remote", remoteOnly: true });
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto("/voice/");
  const wizard = page.getByRole("dialog", { name: "Connect Sidevoice to your agents" });
  await expect(wizard).toBeVisible();
  await wizard.locator(".wizard-actions").getByRole("button", { name: "Not now" }).click();
  const stage = page.locator('.stage-editor[data-task="stt"]');
  await expect(stage).toBeVisible();
  await expect(stage.getByRole("button", { name: "OpenAI" })).toBeVisible();
  await page.locator("#stt-place-openai").click();
  await expect(page.locator("#stt-model")).toHaveValue("gpt-4o-transcribe");
  await page.locator("#stt-option-language").selectOption("fr");
  await page.locator("#stt-option-context").fill("Names for the French voice test");

  const speak = page.getByRole("button", { name: "Speak" });
  await expect(speak).toBeVisible();
  await expect(speak).toBeDisabled();
  await expectInsideViewport(speak, 320, 568);
  await page.setViewportSize({ width: 375, height: 667 });
  await expectInsideViewport(speak, 375, 667);

  await stage.getByRole("button", { name: "Prepare stage" }).click();
  await expect(speak).toBeEnabled();
  await page.reload();
  await expect(page.getByRole("heading", { name: "Set up transcription" })).toBeVisible();
  await expect(page.locator("#stt-place-openai")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#stt-model")).toHaveValue("gpt-4o-transcribe");
  await expect(page.locator("#stt-option-language")).toHaveValue("fr");
  await expect(page.locator("#stt-option-context")).toHaveValue("Names for the French voice test");
});

async function navigateToMachines(page, width, height) {
  await page.setViewportSize({ width, height });
  const settings = page.getByRole("button", { name: "Open settings" });
  await expect(settings).toBeVisible();
  await settings.click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);
  const sections = page.getByRole("button", { name: "Settings sections" });
  if (await sections.isVisible()) await sections.click();
  const machines = page.getByRole("button", { name: "Machines" });
  await expect(machines).toBeVisible();
  await machines.click();
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
  await expect(page.getByRole("heading", { name: "Agents" })).toBeVisible();
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

test("a pending host language response does not block Settings, Machines, or host Agents at phone widths", async ({ page }) => {
  const firstLanguageRequest = languageRequest(page);
  const fake = await installHarness(page);
  await page.goto("/voice/");
  await firstLanguageRequest;
  await expect(page.getByRole("heading", { name: "Sidevoice" })).toBeVisible();

  await navigateToMachines(page, 390, 844);
  const agents = await openAgents(page);
  await expect(page.locator(".host-agent-row[data-registration='foreign']")).toContainText("Connected to a different MCP server");
  const foreign = page.locator(".host-agent-row[data-registration='foreign']");
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

test("failed host preferences show a machine-keyed retry and a fresh read clears the error", async ({ page }) => {
  const firstLanguageRequest = languageRequest(page);
  const fake = await installHarness(page);
  await page.goto("/voice/");
  await firstLanguageRequest;
  fake.languageMode = "fail";
  const dialog = await navigateToMachines(page, 390, 844);
  const failure = dialog.locator(".settings-preferences-error");
  await expect(failure).toContainText("Could not load settings for E2E Host.");
  await expect(failure).toHaveAttribute("data-host", hostFingerprint);
  await expect(failure.getByRole("button", { name: "Retry" })).toBeVisible();

  fake.languageMode = "deferred";
  await failure.getByRole("button", { name: "Retry" }).click();
  await expect(dialog.getByText("Loading settings for E2E Host…")).toBeVisible();
  await expect(dialog.locator(".settings-preferences-error")).toHaveCount(0);
  fake.releaseDeferredLanguage();
  await expect(dialog.getByText("Loading settings for E2E Host…")).toHaveCount(0);
});

test("a host that revokes this device loses its Agents actions and asks for pairing again", async ({ page }) => {
  const firstLanguageRequest = languageRequest(page);
  const fake = await installHarness(page, { languageMode: "success" });
  await page.goto("/voice/");
  await firstLanguageRequest;
  await navigateToMachines(page, 390, 844);
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
