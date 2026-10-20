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

test("styles/bichos.css is the engine's, as engine-stylesheet.ts builds it from engine/", async () => {
  // If this fails, the engine or the builder changed without the stylesheet: `npx vitest run -u <this file>` rewrites it.
  await expect(bichosStylesheet()).toMatchFileSnapshot("../../styles/bichos.css");
  const file = readFileSync(resolve(process.cwd(), "src/styles/bichos.css"), "utf8");
  expect(file).not.toContain("&");
  expect(file).toContain(`${BICHOS_SCOPE}[data-mood=listening] .fig`);
  expect(file).toContain(`${BICHOS_SCOPE}[data-unread] .bang`);
  expect(file).toContain(".backdrop .bd-mount { display: none }");
});

test("the stylesheet loads after the app's own avatar rules, and nothing of an avatar moves under reduced motion", () => {
  const main = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
  expect(main.indexOf('"./styles/bichos.css"')).toBeGreaterThan(main.indexOf('"./styles/call.css"'));
  const call = readFileSync(resolve(process.cwd(), "src/styles/call.css"), "utf8");
  // Its theme inks are the design tokens', so they follow the light theme and the dark one.
  expect(call).toMatch(/\.sv-avatar\[data-style=bichos\] \{ --bx-sv:var\(--sv-accent\);--bx-sv-face:var\(--sv-on-accent\)/);
});

test("a pivot is set outside any state: a layered drawing measures it once, on the still drawing (layers.ts)", () => {
  const css = bichosStylesheet().replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]*\{(?:[^{}]*\{[^}]*\})*[^}]*\}/g, "");
  const stateful = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , body]) => /transform-(origin|box)/.test(body))
    .flatMap(([, selectors]) => splitSelectors(selectors.replace(/^[\s\S]*\{/, "")))
    .filter((selector) => /\[data-/.test(selector.replace(BICHOS_SCOPE, "")));
  expect(stateful).toEqual([]);
});
