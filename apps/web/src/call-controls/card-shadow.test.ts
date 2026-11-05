import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CARD_MARGIN } from "./card-shell";

/* The card's window is transparent and only CARD_MARGIN larger than the card on each side: a shadow reaching past that is
 * cut by the window's edge into a hard straight line (sidevoice-desktop#159). Offset plus blur is how far a CSS shadow
 * reaches below the card, and the blur alone to its sides. Every shadow of a declaration counts, not the first alone. */
test("a card's shadow ends inside the margin its window leaves", () => {
  const css = readFileSync(join(import.meta.dirname, "call-card.css"), "utf8");
  const shadows = [...css.matchAll(/(\.call-card|\.picture-card|\.docked-voice)[^{}]*\{[^{}]*?box-shadow:\s*([^;}]+)/g)]
    .flatMap(([, selector, value]) => value.split(/,(?![^(]*\))/).map((one) => ({ selector, one: one.trim() })))
    .filter(({ one }) => !/^none$/.test(one));
  expect(shadows.length).toBeGreaterThanOrEqual(6); // the cards and the docked voice text, both themes
  expect(shadows.some(({ selector }) => selector === ".docked-voice")).toBe(true);
  for (const { selector, one } of shadows) {
    const [, offset, blur] = one.match(/^0 (-?\d+)px (\d+)px/) ?? [];
    expect(blur, `${selector}: ${one} is a shadow with an offset and a blur`).toBeDefined();
    expect(Number(offset) + Number(blur), `${selector}: below`).toBeLessThanOrEqual(CARD_MARGIN);
    expect(Number(blur), `${selector}: sides`).toBeLessThanOrEqual(CARD_MARGIN);
  }
});
