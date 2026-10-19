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

/** iPhone Safari as far as the microphone goes (web#231), over the harness's "prompt" (a permission query that stays
 *  "prompt" and never fires "change", whatever is answered): only a tap's own event may ask for the microphone; the
 *  device list changes as the microphone opens and again as it is let go (devicechange), and once let go it lists no
 *  microphone (the audio session no longer records: the "allowed, then no microphone" the operator saw); Web Audio
 *  resumes only in a tap. `window.__iphoneAnswer = "deny"` is the person's Don't Allow, as WebKit words it. */
function iphoneSafari() {
  const media = navigator.mediaDevices;
  const open = media.getUserMedia.bind(media);
  const tapped = () => !!window.event?.isTrusted && ["click", "touchend", "pointerup", "keydown"].includes(window.event.type);
  let listed = [{ kind: "audioinput", deviceId: "", groupId: "", label: "", toJSON() { return this; } }];
  const changed = (inputs) => setTimeout(() => { listed = inputs; media.dispatchEvent(new Event("devicechange")); }, 20);
  media.enumerateDevices = async () => listed;
  const refused = () => new DOMException("The request is not allowed by the user agent or the platform in the current context, possibly because the user denied permission.", "NotAllowedError");
  media.getUserMedia = (constraints) => {
    if (!tapped() || window.__iphoneAnswer === "deny") return Promise.reject(refused());
    return open(constraints).then((stream) => {
      changed(listed);
      for (const track of stream.getTracks()) { const stop = track.stop.bind(track); track.stop = () => { stop(); changed([]); }; }
      return stream;
    });
  };
  const resume = AudioContext.prototype.resume;
  AudioContext.prototype.resume = function () { return tapped() ? resume.call(this) : Promise.resolve(); };
}

/** Leaves Settings, a level at a time on a phone. */
async function leaveSettings(page) {
  const dialog = page.locator("#language-settings");
  for (let level = 0; level < 3 && await dialog.isVisible(); level++) await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
}

test("iPhone Safari: the microphone allowed in Settings › Permissions lets the call be joined", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "iPhone Safari behavior");
  await installHarness(page, { microphone: "prompt" });
  await page.addInitScript(iphoneSafari);
  await page.goto("/voice/");
  const held = page.locator(".call-held-note");
  await expect(held).toHaveText("Allow the microphone to call. You can do it in Settings › Permissions.");
  // The held call (aria-disabled, so forced) takes the person to Settings › Permissions, where the tap asks.
  await page.locator("#connect").click({ force: true });
  await page.locator("#permissions-mic-action").click();
  const badge = page.locator("#permissions .perm-badge");
  await expect(badge).toHaveText("Allowed");
  // The device list changed as the microphone opened and was let go; Safari's permission still says "prompt".
  await page.waitForTimeout(300);
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(badge).toHaveText("Allowed");
  await leaveSettings(page);
  await expect(held).toHaveCount(0);
  await expect(page.locator("#connect")).not.toHaveAttribute("aria-disabled", "true");
  // Settings opened again reads it allowed too.
  await page.locator("#settings-open").click();
  if (!(await page.locator("#settings-permissions").isVisible())) await page.getByRole("button", { name: "Back to Settings" }).click();
  await page.locator("#settings-permissions").click();
  await expect(badge).toHaveText("Allowed");
});

test("iPhone Safari: Don't Allow says how to allow it, though Safari's permission still says prompt", async ({ page, browserName }) => {
  test.skip(browserName !== "webkit", "iPhone Safari behavior");
  await installHarness(page, { microphone: "prompt" });
  await page.addInitScript(iphoneSafari);
  await page.addInitScript(() => { window.__iphoneAnswer = "deny"; });
  await page.goto("/voice/");
  await page.locator("#connect").click({ force: true });
  await page.locator("#permissions-mic-action").click();
  await expect(page.locator("#permissions-mic-action")).toHaveText("Check again");
  await expect(page.locator("#settings-mic-help")).toContainText("Allow it for this site");
  // Allowed in Safari's website settings: Check again opens it.
  await page.evaluate(() => { window.__iphoneAnswer = "allow"; });
  await page.locator("#permissions-mic-action").click();
  await expect(page.locator("#permissions .perm-badge")).toHaveText("Allowed");
  await leaveSettings(page);
  await expect(page.locator(".call-held-note")).toHaveCount(0);
});
