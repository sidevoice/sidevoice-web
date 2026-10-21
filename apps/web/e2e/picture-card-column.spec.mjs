import { expect, test } from "@playwright/test";
import { openCard } from "./motion-states.mjs";

/* The picture-in-picture is one grid column holding the heading, the stage tile and the call bar. That column must be
 * the card's content width and nothing else: on the desktop's WebKit a Medium → Small switch left the canvas and the call
 * bar ~35px right of the card, the column kept at Medium's width. `minmax(0, 1fr)` takes the items' minimum widths out of
 * the track, so no stale or oversized minimum can hold it open. */

const measure = (page) => page.evaluate(() => {
  const card = document.querySelector(".picture-card");
  const box = (el) => el.getBoundingClientRect();
  const c = box(card), style = getComputedStyle(card);
  const inner = { left: c.left + parseFloat(style.borderLeftWidth) + parseFloat(style.paddingLeft), right: c.right - parseFloat(style.borderRightWidth) - parseFloat(style.paddingRight) };
  const centre = (el) => { const b = box(el); return b.left + b.width / 2; };
  return { card: c.width, content: inner.right - inner.left, stage: box(card.querySelector(".picture-stage")).width,
    column: parseFloat(style.gridTemplateColumns), barCentre: centre(card.querySelector(".card-call-bar")), cardCentre: centre(card) };
});

const expectFitted = (m) => {
  expect(m.column).toBeCloseTo(m.content, 0);
  expect(m.stage).toBeCloseTo(m.content, 0);
  expect(Math.abs(m.barCentre - m.cardCentre)).toBeLessThanOrEqual(1);
};

test("the picture card's column is its content width, Medium → Small and with an oversized item", async ({ context }) => {
  const page = await openCard(context, { format: "pip", size: "m" });
  await page.setViewportSize({ width: 520, height: 640 });
  const medium = await measure(page);
  expectFitted(medium);

  // Settings in the room writes the stored prefs; the card gets a storage event.
  const room = await context.newPage();
  await room.goto("/voice/");
  await room.evaluate(() => localStorage.setItem("sidevoice.floatingCard", JSON.stringify({ format: "pip", size: "s" })));
  await expect.poll(async () => (await measure(page)).card).toBeLessThan(medium.card - 40);
  const small = await measure(page);
  expectFitted(small);

  // An item whose minimum width is Medium's content or more must not widen the column either.
  await page.evaluate(() => {
    const wide = document.createElement("div");
    wide.style.cssText = "width:600px;height:1px";
    document.querySelector(".picture-stage").append(wide);
    document.querySelector(".card-call-bar").append(wide.cloneNode());
  });
  expectFitted(await measure(page));
});
