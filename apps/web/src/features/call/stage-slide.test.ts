import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

/* The stage's tile is a slide (call-view.css): what is laid on it scales with the tile, so no size inside it may hang on
 * the tile's or the window's width, and its text stays within its bounds. */
const css = readFileSync(resolve(__dirname, "call-view.css"), "utf8");

test("nothing laid on the tile changes size at a breakpoint of the tile's width", () => {
  expect(css).not.toMatch(/@container\s+stage/);
});

test("every form factor's slide shape comes with the height its overlays are drawn for", () => {
  const ratios = css.match(/--stage-ratio:\s*[^;]+;/g) ?? [];
  const refs = css.match(/--stage-ref:\s*\d+;/g) ?? [];
  // The web's 16:9 takes the tile's default reference; the app's 3:2 and the phone's square name their own.
  expect(ratios).toHaveLength(3);
  expect(refs).toHaveLength(3);
});

test("the stage's words follow the tile within readable bounds", () => {
  const bounds = (name: string) => [...css.matchAll(new RegExp(`--${name}:\\s*clamp\\((\\d+)px,\\s*calc\\([^;]*?\\),\\s*(\\d+)px\\)`, "g"))].map((m) => [Number(m[1]), Number(m[2])]);
  for (const [min, max] of bounds("bubble-fs")) expect([min, max]).toEqual([18, 34]);
  for (const [min, max] of bounds("person-fs")) expect([min, max]).toEqual([16, 28]);
  expect(bounds("bubble-fs").length).toBeGreaterThan(0);
  expect(bounds("person-fs").length).toBeGreaterThan(0);
  expect(bounds("name-fs")).toEqual([[14, 26]]);
  expect(bounds("chip-fs")).toEqual([[11, 15]]);
});
