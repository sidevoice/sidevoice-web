import { afterEach, expect, test } from "vitest";
import { forgetVariant, VARIANTS_KEY } from "./variants";

afterEach(() => localStorage.removeItem(VARIANTS_KEY));

test("a decided variant's stored choice goes, the others stay; the key goes with the last", () => {
  localStorage.setItem(VARIANTS_KEY, JSON.stringify({ "unrunnable-models": "hide", other: "b" }));
  forgetVariant("unrunnable-models");
  expect(JSON.parse(localStorage.getItem(VARIANTS_KEY)!)).toEqual({ other: "b" });
  forgetVariant("other");
  expect(localStorage.getItem(VARIANTS_KEY)).toBeNull();
  forgetVariant("other");
});
