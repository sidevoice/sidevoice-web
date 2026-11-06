import { expect, test } from "@playwright/test";
import { openCard } from "./motion-states.mjs";

/* The avatar format's voice text (the person's pill, the agent's balloon) is centred on the creature (R13), as far as the room the
 * host says the creature has to the work area's sides allows (CallControlsState.room), and wraps where even that is too narrow.
 * Measured as boxes in a real browser: the CSS custom properties alone would still pass with the margin rules gone. */

/** The room told to the card as the app relays it. */
const told = (page, room) => page.evaluate((room) => window.__cardListener({ ...window.__cardState, room }), room);

/** The creature's and the voice text's boxes once the card's pop-in is over (it overshoots: a box measured mid-pop is not its own). */
const boxes = (page) => page.evaluate(async () => {
  await Promise.all(document.getAnimations().filter((animation) => animation.effect?.target?.matches?.(".vcap")).map((animation) => animation.finished.catch(() => {})));
  const rect = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, width: r.width, centre: r.left + r.width / 2 }; };
  return { figure: rect(document.querySelector(".avatar-figure")), voice: rect(document.querySelector(".avatar-voice .vcap.card:not([data-leaving])")),
    column: rect(document.querySelector(".avatar-voice")) };
});

// The reply is sounding on a timer (the page of words leaves as the voice ends): on a slow machine the card can be gone before it is
// measured, so the balloon's cases get a retry. The pill stays up while the person talks or the text is being transcribed.
test.describe.configure({ retries: 2 });

for (const [state, name] of [["transcribing", "the person's pill"], ["agent-speaking", "the agent's balloon"]]) {
  test.describe(name, () => {
    test("centred on the creature with room all round", async ({ context }) => {
      const page = await openCard(context, { state, format: "avatar", size: "m" });
      await told(page, { left: 600, right: 600 });
      await page.locator(".avatar-voice .vcap.card").waitFor();
      const { figure, voice } = await boxes(page);
      expect(Math.abs(voice.centre - figure.centre)).toBeLessThanOrEqual(1);
    });

    test("at the left edge it slides in by what is missing, and stays inside the room", async ({ context }) => {
      const page = await openCard(context, { state, format: "avatar", size: "m" });
      await told(page, { left: 0, right: 600 });
      await page.locator(".avatar-voice .vcap.card").waitFor();
      const { figure, voice } = await boxes(page);
      // Never past the work area's left edge (the creature's own left, with no room there), whatever its width.
      await expect.poll(async () => (await boxes(page)).voice.left).toBeGreaterThanOrEqual(figure.left - 0.5);
      if (voice.width > figure.width + 1) expect(voice.centre).toBeGreaterThan(figure.centre);
    });

    test("at the right edge it slides in the other way", async ({ context }) => {
      const page = await openCard(context, { state, format: "avatar", size: "m" });
      await told(page, { left: 600, right: 0 });
      await page.locator(".avatar-voice .vcap.card").waitFor();
      const { figure, voice } = await boxes(page);
      await expect.poll(async () => (await boxes(page)).voice.right).toBeLessThanOrEqual(figure.right + 0.5);
      if (voice.width > figure.width + 1) expect(voice.centre).toBeLessThan(figure.centre);
    });

    test("in a narrow work area it wraps to the room there is, never past it", async ({ context }) => {
      const page = await openCard(context, { state, format: "avatar", size: "m" });
      const before = await boxes(page);
      await told(page, { left: 20, right: 20 });
      await expect.poll(async () => { const { voice } = await boxes(page); return voice.width; }).toBeLessThanOrEqual(before.figure.width + 40 + 0.5);
      const { figure, voice } = await boxes(page);
      expect(voice.left).toBeGreaterThanOrEqual(figure.left - 20 - 0.5);
      expect(voice.right).toBeLessThanOrEqual(figure.right + 20 + 0.5);
    });
  });
}
