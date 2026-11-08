import { expect, test } from "@playwright/test";
import { openCard } from "./motion-states.mjs";

// Each case opens the room, then the card: two page loads a software GL and a busy runner take their time over.
test.describe.configure({ timeout: 120_000 });

/* The creature never moves on the screen when what shows with it comes or goes: the agent's balloon, the person's pill, the
 * captions, the compact card. Here the card is laid out in a real browser, and its window placed as the app places it, from what the
 * card asks for (its size, and its body's box in it): the body (with the window's shadow margin) kept where it rests against its
 * corner, the window round it, moved in only by what does not fit the work area. That rule is the app's (sidevoice-desktop
 * desktop/core/src/call_controls.rs `anchor`, `Spot::at`, `window_at`, `fit`, `room`), restated here so that the card's half of the
 * contract is measured on the screen: the creature's rect, before the voice text and after it, to the pixel. */

/** The window's shadow margin round the card (card-shell.tsx CARD_MARGIN; the app's MARGIN). */
const MARGIN = 12;
/** A MacBook's work area under its menu bar, as the app's own tests have it. */
const WORK = { x: 0, y: 25, width: 1440, height: 850 };
/** Where the card was left: against a corner, or against the right edge part-way down (the upper half). */
const SPOTS = { tr: { right: true, bottom: false, dy: 0 }, tl: { right: false, bottom: false, dy: 0 }, br: { right: true, bottom: true, dy: 0 },
  bl: { right: false, bottom: true, dy: 0 }, "right edge": { right: true, bottom: false, dy: 220 } };

/** Where the app puts the window for this layout at this spot, the room it tells the card, and the place (which half). */
function placement(layout, spot) {
  const size = { w: layout.width, h: layout.height }, b = layout.card;
  const ax = Math.min(Math.max(b.x - MARGIN, 0), size.w), ay = Math.min(Math.max(b.y - MARGIN, 0), size.h);
  const anchor = { x: ax, y: ay, w: Math.max(1, Math.min(b.width + 2 * MARGIN, size.w - ax)), h: Math.max(1, Math.min(b.height + 2 * MARGIN, size.h - ay)) };
  const right = WORK.x + WORK.width, bottom = WORK.y + WORK.height;
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const rest = { x: clamp(spot.right ? right - anchor.w : WORK.x, WORK.x, right - anchor.w), y: clamp(spot.bottom ? bottom - spot.dy - anchor.h : WORK.y + spot.dy, WORK.y, bottom - anchor.h) };
  const window = { x: Math.max(Math.min(rest.x - anchor.x, right - size.w), WORK.x), y: Math.max(Math.min(rest.y - anchor.y, bottom - size.h), WORK.y) };
  const room = { left: Math.floor(Math.max(0, rest.x - WORK.x)), right: Math.floor(Math.max(0, right - (rest.x + anchor.w))) };
  const upper = rest.y + anchor.h / 2 < WORK.y + WORK.height / 2;
  return { window, room, place: { vertical: upper ? "upper" : "lower", horizontal: spot.right ? "right" : "left" } };
}

/** The creature (or, in the other formats, what stands for it: the title card's face, the picture's stage) on the screen once the
 *  card has settled at `spot`: the app places the window from the card's latest layout and tells the card its place and room; the card
 *  lays out again and asks again; until nothing changes. */
async function onScreen(page, spot, creature) {
  let last = "";
  for (let round = 0; round < 12; round++) {
    await page.evaluate(async () => {
      await Promise.all(document.getAnimations().map((animation) => animation.finished.catch(() => {})));
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const layout = await page.evaluate(() => window.__layouts?.at(-1) ?? null);
    expect(layout?.card).toBeTruthy();
    const { window: at, room, place } = placement(layout, spot);
    const told = await page.evaluate(({ room, place }) => {
      const s = window.__cardState, same = JSON.stringify(s.room) === JSON.stringify(room) && JSON.stringify(s.place) === JSON.stringify(place);
      if (!same) { window.__cardState = { ...s, room, place }; window.__cardListener(window.__cardState); }
      return same;
    }, { room, place });
    const rect = await page.evaluate((selector) => {
      const card = document.querySelector(".floating-card").getBoundingClientRect(), r = document.querySelector(selector).getBoundingClientRect();
      // The window's corner is the card's less its margin (the layout's box is measured from there).
      return { x: r.left - (card.left - 12), y: r.top - (card.top - 12), width: r.width, height: r.height };
    }, creature);
    const now = JSON.stringify({ x: at.x + rect.x, y: at.y + rect.y, width: rect.width, height: rect.height, layout });
    if (told && now === last) return { x: at.x + rect.x, y: at.y + rect.y, width: rect.width, height: rect.height, layout };
    last = now;
  }
  throw new Error("the card never settled");
}

/** The call as the card hears it with nothing said (no voice text), and with the agent's reply held sounding (its balloon). */
const quiet = (page) => page.evaluate(() => {
  const call = window.__cardState.call;
  window.__cardState = { ...window.__cardState, call: { ...call, facts: { ...call.facts, botLive: false, karaokeState: null, history: [] } } };
  window.__cardListener(window.__cardState);
});
const replying = (page, call) => page.evaluate((call) => {
  const facts = call.facts, reply = facts.history[facts.history.length - 1];
  window.__cardState = { ...window.__cardState, call: { ...call, facts: { ...facts, botLive: true, karaokeState: { segment: reply.segment, from: 0, to: reply.text.length },
    history: [...facts.history.slice(0, -1), { ...reply, audio: "playing" }] } } };
  window.__cardListener(window.__cardState);
}, call);

const FORMATS = [["avatar", ".avatar-figure"], ["card", ".title-card:not(.compact-card) .card-face"], ["pip", ".picture-stage"]];

for (const [format, creature] of FORMATS) {
  for (const expanded of format === "avatar" ? [false, true] : [false]) {
    for (const [name, spot] of Object.entries(SPOTS)) {
      test(`${format}${expanded ? " with its compact card out" : ""}, ${name}: the creature keeps its pixel when the balloon comes and goes`, async ({ context }) => {
        const page = await openCard(context, { state: "agent-speaking", format, size: "m", expanded });
        const call = await page.evaluate(() => window.__cardState.call);
        await quiet(page);
        await expect(page.locator(".docked-voice .vcap")).toHaveCount(0);
        const before = await onScreen(page, spot, creature);
        await replying(page, call);
        await page.locator(".vcap.card").filter({ visible: true }).first().waitFor();
        const during = await onScreen(page, spot, creature);
        await quiet(page);
        await expect(page.locator(".docked-voice .vcap.card")).toHaveCount(0);
        const after = await onScreen(page, spot, creature);
        const off = (a, b) => ({ dx: +(b.x - a.x).toFixed(3), dy: +(b.y - a.y).toFixed(3) });
        const asked = JSON.stringify({ before: before.layout, with: during.layout });
        expect(off(before, during), asked).toEqual({ dx: 0, dy: 0 });
        expect(off(before, after), asked).toEqual({ dx: 0, dy: 0 });
        expect(during.width).toBeCloseTo(before.width, 3);
      });
    }
  }
}
