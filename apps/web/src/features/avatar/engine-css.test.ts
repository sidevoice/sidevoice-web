import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";
import { scopeCss, splitSelectors } from "./engine-css";
import { BICHOS_SCOPE, bichosStylesheet } from "./engine-stylesheet";

test("the engine's nested CSS comes out flat under one root, keyframes hoisted", () => {
  const css = `
    /* a note */
    .ground { fill: red }
    &[data-mood=idle] .eyes, &[data-mood=idle] .zz { display: none }
    &:is([data-a], [data-b]) :is(.x, .y) { opacity: 1 }
    .b07 { color: blue; &:hover { color: green } .inner { color: pink } }
    @media (min-width: 10px) { &[data-size=stage] .z { color: gray } }
    @keyframes bx-spin { to { transform: rotate(360deg) } }`;
  expect(scopeCss(css, ".av")).toBe([
    "/* a note */",
    ".av .ground { fill: red }",
    ".av[data-mood=idle] .eyes,\n.av[data-mood=idle] .zz { display: none }",
    ".av:is([data-a], [data-b]) :is(.x, .y) { opacity: 1 }",
    ".av .b07 { color: blue }",
    ".av .b07:hover { color: green }",
    ".av .b07 .inner { color: pink }",
    "@media (min-width: 10px) {\n  .av[data-size=stage] .z { color: gray }\n}",
    "@keyframes bx-spin { to { transform: rotate(360deg) } }",
  ].join("\n") + "\n");
  expect(splitSelectors("&:is(.a, .b) .c, .d")).toEqual(["&:is(.a, .b) .c", ".d"]);
});

test("styles/bichos.css is the engine's, as scripts/sync-bichos.mjs last wrote it from engine/", () => {
  // If this fails, the engine or the builder changed without the stylesheet: run the sync (engine/README.md).
  const file = readFileSync(resolve(process.cwd(), "src/styles/bichos.css"), "utf8");
  expect(file).toBe(bichosStylesheet());
  expect(file).not.toContain("&");
  expect(file).toContain(`${BICHOS_SCOPE}[data-mood=listening] .fig`);
  expect(file).toContain(`${BICHOS_SCOPE}[data-unread] .bang`);
  expect(file).toContain(".backdrop .bd-mount { display: none }");
});
