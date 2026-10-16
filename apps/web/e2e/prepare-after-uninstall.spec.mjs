import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

async function mockLocalHost(page) {
  await page.addInitScript(() => {
    let status = { state: "running", installed: true, reachable: true, service: "launchd" };
    let pairing = {
      fp: "fp-local-e2e", public_key: "local-public-key", host: "This computer", device_id: "local-device",
      token: "local-session", urls: ["http://127.0.0.1:4173"], rv: null,
    };
    let rejectInstall = null;
    const listeners = new Set();
    const calls = { install: 0, restart: 0 };
    window.__hostTest = {
      calls,
      uninstall() {
        status = { state: "absent", installed: false, reachable: false, service: "none" };
        pairing = null;
        for (const listener of listeners) listener(status);
      },
      failInstall() {
        status = { state: "failed", installed: false, reachable: false, service: "none" };
        for (const listener of listeners) listener(status);
        rejectInstall?.({ key: "install.network", step: "download" });
      },
    };
    window.__sidevoiceDesktop = { host: { voice: {}, localHost: {
      state: async () => status,
      subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
      pairing: async () => pairing,
      restart: async () => { calls.restart++; },
      install(onProgress) {
        calls.install++;
        status = { state: "installing", installed: false, reachable: false, service: "none" };
        for (const listener of listeners) listener(status);
        onProgress?.({ step: "service-start", done: null, total: null });
        return Object.assign(new Promise((_resolve, reject) => { rejectInstall = reject; }), { job: `e2e-install-${calls.install}` });
      },
    } } };
  });
}

for (const width of [1280, 390]) {
  test(`prepare after an absent host projection stays in Settings at ${width}px`, async ({ page }) => {
    await installHarness(page);
    await mockLocalHost(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/voice/");
    await page.waitForFunction(() => window.sidevoiceUI?.store?.getState().machines.some((machine) => machine.local));
    const roomTop = await page.locator(".call-layout").evaluate((element) => element.getBoundingClientRect().top);

    await page.evaluate(() => window.__hostTest.uninstall());
    await page.waitForFunction(() => {
      const state = window.sidevoiceUI?.store?.getState();
      return state?.facts.localHostStatus.state === "absent" && !state.machines.some((machine) => machine.local);
    });
    await expect(page.locator(".local-host-banner")).toHaveCount(0);

    await page.locator("#settings-open").evaluate((button) => button.click());
    await page.locator("#settings-this-computer").click();
    const pane = page.locator("#pane-this-computer");
    await expect(pane).toBeVisible();
    await expect(pane.getByText("This computer isn't prepared yet.")).toBeVisible();
    await expect(pane.getByRole("button", { name: "I’ll do it myself" })).toBeVisible();
    await expect(pane.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await pane.getByRole("button", { name: "Prepare this computer" }).click();
    await page.waitForFunction(() => window.sidevoiceUI?.store?.getState().facts.localHostStatus.state === "installing");
    await expect(pane.locator(".local-install-panel")).toHaveAttribute("data-phase", "installing");
    await expect(page.locator(".local-host-banner")).toHaveCount(0);

    await page.locator("#language-settings").evaluate((dialog) => dialog.close());
    await expect(page.locator(".room-shell > .local-install-entry")).toHaveCount(0);
    const afterTop = await page.locator(".call-layout").evaluate((element) => element.getBoundingClientRect().top);
    expect(Math.abs(afterTop - roomTop)).toBeLessThan(1);
    expect(await page.evaluate(() => window.__hostTest.calls)).toEqual({ install: 1, restart: 0 });

    await page.evaluate(() => window.__hostTest.failInstall());
    await page.locator("#settings-open").evaluate((button) => button.click());
    await page.locator("#settings-this-computer").click();
    await expect(pane.locator(".local-install-panel")).toHaveAttribute("data-phase", "failed");
    await pane.getByRole("button", { name: "Retry" }).click();
    await expect(pane.locator(".local-install-panel")).toHaveAttribute("data-phase", "installing");
    expect(await page.evaluate(() => window.__hostTest.calls)).toEqual({ install: 2, restart: 0 });
  });

  test(`preparation remains in the no-machine screen at ${width}px`, async ({ page }) => {
    await installHarness(page);
    await page.addInitScript(() => localStorage.setItem("sidevoice.pairings", JSON.stringify({ pairings: [] })));
    await mockLocalHost(page);
    await page.setViewportSize({ width, height: 800 });
    await page.goto("/voice/");
    await page.waitForFunction(() => window.sidevoiceUI?.store?.getState().machines.some((machine) => machine.local));
    await page.evaluate(() => window.__hostTest.uninstall());
    const empty = page.locator(".no-machine-screen");
    await expect(empty).toBeVisible();
    // The setup's two cards first (operator, 2026-10-16); This computer opens its preparation.
    await expect(empty.locator("#machine-choice-remote")).toBeVisible();
    await empty.locator("#machine-choice-agents").click();
    await expect(empty.getByRole("button", { name: "I’ll do it myself" })).toBeVisible();
    await empty.getByRole("button", { name: "Prepare this computer" }).click();
    await page.waitForFunction(() => {
      const state = window.sidevoiceUI?.store?.getState();
      return state?.facts.localHostStatus.state === "installing"
        && state.machines.some((machine) => machine.local && !machine.pairingId);
    });
    await expect(empty.locator(".local-install-panel")).toHaveAttribute("data-phase", "installing");
    await expect(empty.getByText("Installing the Sidevoice service…")).toBeVisible();
    await expect(page.getByText("Installing the Sidevoice service…").filter({ visible: true })).toHaveCount(1);
    await expect(empty.getByRole("button", { name: "Connect to another machine" })).toBeVisible();
    await expect(page.locator(".local-host-banner, .room-shell > .local-install-entry")).toHaveCount(0);
    await page.evaluate(() => window.__hostTest.failInstall());
    await expect(empty.locator(".local-install-panel")).toHaveAttribute("data-phase", "failed");
    await empty.getByRole("button", { name: "Retry" }).click();
    await expect(empty.locator(".local-install-panel")).toHaveAttribute("data-phase", "installing");
    expect(await page.evaluate(() => window.__hostTest.calls)).toEqual({ install: 2, restart: 0 });
  });
}

test("manual recovery retires a failed install even with start-at-sign-in off", async ({ page }) => {
  await installHarness(page);
  await page.addInitScript(() => localStorage.setItem("sidevoice.pairings", JSON.stringify({ pairings: [] })));
  await mockLocalHost(page);
  await page.goto("/voice/");
  await page.waitForFunction(() => window.sidevoiceUI?.store?.getState().machines.some((machine) => machine.local));
  await page.evaluate(() => window.__hostTest.uninstall());
  const empty = page.locator(".no-machine-screen");
  await expect(empty).toBeVisible();
  await empty.locator("#machine-choice-agents").click();
  await empty.getByRole("button", { name: "Prepare this computer" }).click();
  await page.evaluate(() => window.__hostTest.failInstall());
  await expect(empty.locator('.local-install-panel[data-phase="failed"]')).toBeVisible();

  // The manual CLI path recovers the local pairing while the renderer still holds the failed download.
  await page.evaluate(() => window.sidevoiceUI.store.patch({
    pairings: [{ fp: "recovered-local", public_key: "pk", device_id: "recovered-device",
      urls: ["http://127.0.0.1:1"], rv: null, host: "Recovered local", local: true, paired_at: 1, revoked: false }],
    localHostStatus: { state: "running", reachable: true, installed: false, service: "launchd" },
  }));
  await page.waitForFunction(() => window.sidevoiceUI.store.getState().machines.some(
    (machine) => machine.local && machine.state === "connected" && machine.pairingId,
  ));
  await page.locator("#settings-open").evaluate((button) => button.click());
  await page.locator("#settings-this-computer").click();
  const pane = page.locator("#pane-this-computer");
  await expect(pane.locator('.host-status-card[data-state="running"]')).toBeVisible();
  await expect(pane.getByRole("button", { name: "Restart" })).toBeVisible();
  await expect(pane.locator(".local-install-panel")).toHaveCount(0);
  await expect(empty).toHaveCount(0);
  await expect(page.locator(".local-host-banner")).toHaveCount(0);

  for (const installed of [true, false, undefined]) {
    await page.evaluate((value) => window.sidevoiceUI.store.patch({
      localHostStatus: { state: "running", reachable: true, service: "launchd", ...(value === undefined ? {} : { installed: value }) },
    }), installed);
    await expect(pane.locator('.host-status-card[data-state="running"]')).toBeVisible();
    await expect(pane.getByRole("button", { name: "Restart" })).toBeVisible();
    await expect(pane.locator(".local-install-panel")).toHaveCount(0);
  }

  await page.evaluate(() => window.sidevoiceUI.store.patch({
    localHostStatus: { state: "service-failed", reachable: false, installed: false, service: "launchd",
      failure: { key: "start.failed" } },
  }));
  await expect(pane.locator('.host-status-card[data-state="service-failed"]')).toBeVisible();
  await expect(pane.getByRole("button", { name: "Retry" })).toBeVisible();
  await pane.getByRole("button", { name: "Retry" }).click();
  expect(await page.evaluate(() => window.__hostTest.calls)).toEqual({ install: 1, restart: 1 });
  await page.locator("#language-settings").evaluate((dialog) => dialog.close());
  await expect(page.locator(".local-host-banner")).toBeVisible();
  await expect(page.locator(".local-host-banner").getByRole("button", { name: "Retry" })).toBeVisible();
});
