import { expect, test } from "@playwright/test";
import { openCard } from "./motion-states.mjs";

/* The floating card's voice text is the stage's: the white voice card (the design reference's `.vcap.card`), docked over or
 * under the title card and the avatar, in a real browser where the layout is laid out. Its look is read off the page as
 * computed (fill, ink, border, radius, DM Sans 450, the dark theme's black card); where it docks is measured against the
 * card or the creature, toward the screen's middle (`place`); and what the window can show of it (its shadow) stays inside the
 * margin the window leaves round the card. Timing, paging and the person's turn are the stage's own components, covered where
 * they live (PagedText, PersonTurn, formats.test.tsx). */

const LOOK = {
  light: { fill: "rgb(255, 255, 255)", ink: "rgb(27, 29, 36)", border: "rgb(197, 185, 213)" },
  dark: { fill: "rgb(33, 33, 37)", ink: "rgb(250, 250, 250)", border: "rgb(75, 71, 86)" },
};
/** The window's margin round the card, for its shadow (card-shell.tsx CARD_MARGIN). */
const MARGIN = 12;

const theme = (page, name) => page.evaluate((name) => document.documentElement.setAttribute("data-theme", name), name);
/** The card is told where it sits on the screen: the app relays it (CallControlsState.place). */
const placed = (page, place) => page.evaluate((place) => window.__cardListener({ ...window.__cardState, place }), place);

/** The boxes once the card's pop-in is over (it overshoots: a box measured mid-pop is not its own). */
const boxes = (page) => page.evaluate(async () => {
  await Promise.all(document.getAnimations().filter((animation) => animation.effect?.target?.matches?.(".vcap")).map((animation) => animation.finished.catch(() => {})));
  const rect = (node) => { if (!node) return null; const r = node.getBoundingClientRect(); return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height }; };
  const card = document.querySelector(".docked-voice .vcap.card:not([data-leaving])");
  return { card: rect(card), column: rect(document.querySelector(".docked-voice")), window: rect(document.querySelector(".floating-card")),
    title: rect(document.querySelector(".title-card:not(.compact-card)")), figure: rect(document.querySelector(".avatar-figure")), root: rect(document.getElementById("root")) };
});

for (const format of ["card", "avatar"]) {
  for (const name of ["light", "dark"]) {
    test(`${format}, ${name}: the reply is the stage's white voice card, not a balloon nor plain lines`, async ({ context }) => {
      const page = await openCard(context, { state: "agent-speaking", format, size: "m" });
      await theme(page, name);
      const card = page.locator(".docked-voice .vcap.card.agent");
      await expect(card).toBeVisible();
      await page.evaluate(() => document.fonts.load('450 18px "DM Sans"'));
      // No old voice text left on the card.
      await expect(page.locator(".speech-bubble, .caption-line, .card-captions-lines, .balloon-tail")).toHaveCount(0);
      const look = await card.evaluate((node) => {
        const style = getComputedStyle(node), words = node.querySelector(".lit-base");
        return { fill: style.backgroundColor, ink: style.color, border: style.borderTopColor, width: style.borderTopWidth, radius: style.borderTopLeftRadius,
          family: style.fontFamily, weight: style.fontWeight, size: style.fontSize, line: style.lineHeight, position: style.position,
          quiet: getComputedStyle(words).opacity, dm: document.fonts.check('450 18px "DM Sans"'), shadow: style.boxShadow };
      });
      expect(look).toMatchObject({ fill: LOOK[name].fill, ink: LOOK[name].ink, border: LOOK[name].border, width: "1px", radius: "18px", weight: "450",
        size: "18px", line: "25px", position: "static", quiet: "0.38", dm: true });
      expect(look.family).toContain("DM Sans");
      // Its shadow ends inside the window's margin, or the window's edge cuts it into a line (desktop#159).
      const [, , offset, blur] = look.shadow.match(/(-?\d+)px\s+(-?\d+)px\s+(\d+)px/) ?? [];
      expect(Number(offset) + Number(blur)).toBeLessThanOrEqual(MARGIN);
      expect(Number(blur)).toBeLessThanOrEqual(MARGIN);
    });
  }
}

test("title card: the reply's card is as wide as the card, after it toward the screen's middle (under in the upper half, over in the lower)", async ({ context }) => {
  const page = await openCard(context, { state: "agent-speaking", format: "card", size: "m" });
  await expect(page.locator(".docked-voice .vcap.card.agent")).toBeVisible();
  const down = await boxes(page);
  expect(down.card.width).toBeCloseTo(down.title.width, 0);
  expect(down.card.left).toBeCloseTo(down.title.left, 0);
  // Under it, a gap of the window's own (8px), and inside the window.
  expect(down.card.top - down.title.bottom).toBeGreaterThan(0);
  expect(down.card.top - down.title.bottom).toBeLessThanOrEqual(12);
  expect(down.card.bottom).toBeLessThanOrEqual(down.window.bottom + 0.5);
  await placed(page, { vertical: "lower", horizontal: "left" });
  await expect(page.locator(".floating-card")).toHaveAttribute("data-open", "up");
  const up = await boxes(page);
  expect(up.card.bottom).toBeLessThanOrEqual(up.title.top);
  expect(up.title.top - up.card.bottom).toBeLessThanOrEqual(12);
  expect(up.card.top).toBeGreaterThanOrEqual(up.window.top - 0.5);
});

test("avatar: the reply's card hangs under the creature in the upper half, over it in the lower, never over its box", async ({ context }) => {
  const page = await openCard(context, { state: "agent-speaking", format: "avatar", size: "m" });
  await expect(page.locator(".docked-voice .vcap.card.agent")).toBeVisible();
  const down = await boxes(page);
  expect(down.card.top).toBeGreaterThanOrEqual(down.figure.bottom);
  expect(down.card.bottom).toBeLessThanOrEqual(down.window.bottom + 0.5);
  // As wide as its words, up to the compact card's column (300px at this size), toward the creature's own side: the right.
  expect(down.card.width).toBeLessThanOrEqual(300 + 0.5);
  expect(down.card.right).toBeCloseTo(down.window.right, 0);
  await placed(page, { vertical: "lower", horizontal: "left" });
  await expect(page.locator(".floating-card")).toHaveAttribute("data-open", "up");
  const up = await boxes(page);
  expect(up.card.bottom).toBeLessThanOrEqual(up.figure.top);
  expect(up.card.left).toBeCloseTo(up.window.left, 0);
  // The creature is the same size wherever the card is.
  expect(up.figure.width).toBeCloseTo(down.figure.width, 0);
});

for (const format of ["card", "avatar"]) {
  test(`${format}: the person's turn is the stage's pill, and transcribing says so, with the × to take it back`, async ({ context }) => {
    const speaking = await openCard(context, { state: "person-speaking", format, size: "m" });
    const pill = speaking.locator(".docked-voice .vcap.card.person.pill");
    await expect(pill).toBeVisible();
    await expect(pill).toHaveAttribute("data-phase", "listening");
    await expect(pill.getByRole("button", { name: "Cancel sending" })).toBeVisible();
    expect(await pill.evaluate((node) => getComputedStyle(node).borderTopLeftRadius)).toBe("999px");
  });
}

test("the picture-in-picture keeps its voice text under the creature, in the stage's tile", async ({ context }) => {
  const page = await openCard(context, { state: "agent-speaking", format: "pip", size: "m" });
  await expect(page.locator(".picture-card .stage-voice .vcap.card.agent:not(.meas)")).toBeVisible();
  await expect(page.locator(".docked-voice")).toHaveCount(0);
});
