import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* Settings › Providers › Connect: the key's dialog opens whole, a card over the page on a laptop and the whole screen on
 * a phone — its title, the key's field and Cancel and Connect each in sight and reachable, not clipped by a card that
 * failed to grow. On the macOS app's WebKit (Safari 26 and before) the card drew as a 2px line: its height resolved a
 * percentage against the dialog's fit-content as 0. Clipped content still has a box, so "in sight" here is measured:
 * inside the card and the screen, and the topmost thing at its own centre. */

const CATALOGS = [
  { id: "local", name: null, status: { stale: false }, models: [] },
  { id: "elevenlabs", name: "ElevenLabs", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
  { id: "openai", name: "OpenAI", status: { stale: false, reason: { code: "credential-missing", params: {} } }, models: [] },
];
const PROVIDERS = [["elevenlabs", "ElevenLabs"], ["openai", "OpenAI"]];

/** Where the element falls short of being seen: past the card's or the screen's edges, or under something else. */
const unseen = (locator) => locator.evaluate((element) => {
  const surface = element.closest(".ui-dialog-surface");
  const box = element.getBoundingClientRect(), card = surface.getBoundingClientRect();
  const found = [];
  if (box.width < 1 || box.height < 1) found.push("no size");
  if (box.top < card.top - 1 || box.bottom > card.bottom + 1 || box.left < card.left - 1 || box.right > card.right + 1)
    found.push(`outside its card (${Math.round(box.top)}–${Math.round(box.bottom)} in ${Math.round(card.top)}–${Math.round(card.bottom)})`);
  if (box.top < 0 || box.left < 0 || box.bottom > innerHeight || box.right > innerWidth) found.push("off the screen");
  const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  if (!top || (top !== element && !element.contains(top))) found.push(`under ${top ? top.tagName.toLowerCase() + "." + top.className : "nothing"}`);
  return found;
});

for (const [name, viewport, phone] of [["a laptop", { width: 1280, height: 800 }, false], ["a phone", { width: 390, height: 844 }, true]]) {
  test.describe(`on ${name}`, () => {
    test.use({ viewport, hasTouch: phone, isMobile: phone });

    test("Connect opens the key's dialog whole: its field, Cancel and Connect in sight", async ({ page }) => {
      await installHarness(page, { voiceReady: false });
      await page.goto("/voice/");
      await page.waitForFunction(() => !!window.sidevoiceActions && !!window.sidevoiceUI?.store);
      const seed = () => page.evaluate((catalogs) => window.sidevoiceUI.store.patch({
        voiceCatalogue: { state: "ready", catalogs, error: "" }, providerKeys: { elevenlabs: false, openai: false },
      }), CATALOGS);
      // Settings from a phone's header gear, or a laptop's sidebar foot.
      await page.locator(phone ? "#settings-open" : ".sidebar-settings").click();
      await seed();
      await page.locator("#settings-providers").click();
      await seed();

      for (const [id, label] of PROVIDERS) {
        const connect = page.locator(`#provider-connect-${id}`);
        await connect.click();
        const dialog = page.getByRole("dialog", { name: `Connect ${label}` });
        await expect(dialog).toBeVisible();
        expect(await dialog.evaluate((element) => element.matches(":modal"))).toBe(true);

        const field = dialog.getByLabel("API key");
        const cancel = dialog.getByRole("button", { name: "Cancel", exact: true });
        const submit = dialog.getByRole("button", { name: "Connect", exact: true });
        await expect(field).toBeFocused();
        // A laptop's card, or the phone's whole screen; never a sliver.
        const card = await dialog.locator(".ui-dialog-surface").boundingBox();
        expect(card.height, "the card's height").toBeGreaterThan(phone ? viewport.height - 2 : 200);
        if (phone) expect(card.width).toBe(viewport.width);
        else expect(card.width).toBeLessThan(viewport.width);
        for (const [what, locator] of [["the title", dialog.getByRole("heading", { name: `Connect ${label}` })], ["the field", field], ["Cancel", cancel], ["Connect", submit]])
          expect(await unseen(locator), what).toEqual([]);

        // It takes a key: Connect waits for one.
        await expect(submit).toBeDisabled();
        await field.fill("sk-e2e-key");
        await expect(submit).toBeEnabled();
        await cancel.click();
        await expect(dialog).toBeHidden();
        await expect(connect).toBeFocused();
      }
    });
  });
}
