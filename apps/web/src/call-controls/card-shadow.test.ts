import { readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CARD_MARGIN } from "./card-shell";

/* The card's window is transparent and only CARD_MARGIN larger than the card on each side: a shadow reaching past that is
 * cut by the window's edge into a hard straight line (sidevoice-desktop#159). Offset plus blur is how far a CSS shadow
 * reaches below the card, and the blur alone to its sides. */
test("a card's shadow ends inside the margin its window leaves", () => {
  const css = readFileSync(join(import.meta.dirname, "call-card.css"), "utf8");
  const shadows = [...css.matchAll(/(\.call-card|\.picture-card)[^{}]*\{[^{}]*?box-shadow:\s*0 (\d+)px (\d+)px/g)];
  expect(shadows.length).toBeGreaterThanOrEqual(4); // both surfaces, both themes
  for (const [, selector, offset, blur] of shadows) {
    expect(Number(offset) + Number(blur), `${selector}: below`).toBeLessThanOrEqual(CARD_MARGIN);
    expect(Number(blur), `${selector}: sides`).toBeLessThanOrEqual(CARD_MARGIN);
  }
});
