import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { uid, type Size } from "./engine/core";
import { renderSpec } from "./engine/bichos/render";
import { normalizeSpec } from "./engine/bichos/spec";
import { renderMascot } from "./engine/styles/bichos";

/* The engine draws the person and the Sidevoice mascot (a conversation's agent is its creature: creature/; the stage's
 * backdrops are scene/). It is edited in place, so what it draws is held to a committed snapshot: one line per drawing, the markup's
 * hash and length. Any change that moves a drawing (a part, a roll, the renderer, a cue) shows in review as the lines it
 * moved in __snapshots__/engine-render.txt; a change that is meant is accepted with
 * `npx vitest run -u src/features/avatar/engine-render.test.ts` (from apps/web). It was first written from a run that
 * rendered 1,500 seeds (every body kind, member and part, three sizes, the scenes) with the engine as it was before it
 * became source here and with the engine after, and found them byte-identical; this is the part of that sample worth
 * keeping. The stylesheet has its own file snapshot (engine-css.test.ts). */

const SIZES: Size[] = ["stage", "sidebar", "rail"];

/** The markup with its per-drawing id prefix (`bx<n>`: the n-th drawing this module made) taken out, so a drawing's
 *  line does not depend on how many were drawn before it. */
function stable(prefix: "bx", draw: () => string): string {
  const counter = (parseInt(uid(""), 36) + 1).toString(36);
  const html = draw();
  const own = html.replaceAll(`${prefix}${counter}`, `${prefix}#`);
  expect(own).toContain(`${prefix}#`);
  return own;
}

const line = (name: string, html: string) => `${name} ${createHash("sha256").update(html).digest("hex").slice(0, 16)} ${html.length}`;

function sample(): string[] {
  const lines: string[] = [];
  // The person (the old person avatar, in the cast's style: as bicho-draw.ts pins it), with and without the microphone,
  // and the mascot.
  for (const hold of [undefined, "microphone"] as const) {
    const person = normalizeSpec({
      body: "round",
      parts: { eyes: "two", mouth: "smile", arms: "nubs", legs: "feet", headgear: "beanie", ...(hold ? { held: hold } : {}) },
      color: { hue: 214, sat: 75, light: 75, spot: 160 },
      shape: "sidevoice-person",
      name: "person",
    });
    for (const size of SIZES) lines.push(line(`person ${hold ?? "-"} ${size}`, stable("bx", () => renderSpec(person, size).html)));
  }
  for (const size of SIZES) lines.push(line(`mascot sidevoice ${size}`, stable("bx", () => renderMascot("sidevoice", size).html)));
  return lines;
}

test("the engine draws what it drew: a sample of figures and sizes holds to its snapshot", async () => {
  await expect(sample().join("\n") + "\n").toMatchFileSnapshot("./__snapshots__/engine-render.txt");
});

test("a drawing is the same whenever it is drawn", () => {
  const draw = () => stable("bx", () => renderMascot("sidevoice", "stage").html);
  expect(draw()).toBe(draw());
});
