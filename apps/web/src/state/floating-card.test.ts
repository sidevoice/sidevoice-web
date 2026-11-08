import { afterEach, expect, test } from "vitest";
import { FLOATING_CARD_KEY, readFloatingCard } from "./floating-card";

afterEach(() => localStorage.removeItem(FLOATING_CARD_KEY));

test("with no choice stored the card is the picture-in-picture at Medium", () => {
  expect(readFloatingCard()).toEqual({ format: "pip", size: "m" });
});

test("a stored choice is kept as it is", () => {
  localStorage.setItem(FLOATING_CARD_KEY, JSON.stringify({ format: "card", size: "l" }));
  expect(readFloatingCard()).toEqual({ format: "card", size: "l" });
});
