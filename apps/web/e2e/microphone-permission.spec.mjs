import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, permissions: ["microphone"] });

for (const hint of ["denied", "unsupported"]) {
  test(`Safari permission hint ${hint} cannot override an opened microphone`, async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "Safari permission behavior");
    await installHarness(page, { microphone: "denied" });
    if (hint === "unsupported") await page.addInitScript(() => {
      const query = navigator.permissions.query.bind(navigator.permissions);
      navigator.permissions.query = (descriptor) => descriptor?.name === "microphone"
        ? Promise.reject(new TypeError("microphone permission query unsupported")) : query(descriptor);
    });
    await page.goto("/voice/");
    await page.locator("#settings-open").click();
    await page.locator("#settings-permissions").click();
    await expect(page.locator("#permissions-mic-action")).toHaveText("Allow microphone");
    await page.locator("#permissions-mic-action").click();
    await expect(page.locator("#permissions .perm-badge")).toHaveText("Allowed");
    await expect(page.locator("#permissions .wizard-mic-help")).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.locator("#permissions .perm-badge")).toHaveText("Allowed");
    await page.reload();
    await expect(page.locator(".call-held-note")).not.toContainText("can’t use the microphone");
    await page.locator("#settings-open").click();
    if (!(await page.locator("#settings-permissions").isVisible())) await page.getByRole("button", { name: "Back to Settings" }).click();
    await page.locator("#settings-permissions").click();
    await expect(page.locator("#permissions .wizard-mic-help")).toHaveCount(0);
    await page.locator("#permissions-mic-action").click();
    await expect(page.locator("#permissions .perm-badge")).toHaveText("Allowed");
  });
}
