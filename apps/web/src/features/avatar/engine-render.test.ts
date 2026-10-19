import { createHash } from "node:crypto";
import { expect, test } from "vitest";
import { backdropFromSeed, backdropSvg } from "./engine/backdrop";
import { uid, type Size } from "./engine/core";
import { deskFromSeed, deskSvg } from "./engine/desk";
import { renderSpec } from "./engine/bichos/render";
import { BODIES, FAMILIES, MEMBERS } from "./engine/bichos/registry";
import { specFromSeed } from "./engine/bichos/seed";
import { normalizeSpec } from "./engine/bichos/spec";
import { renderMascot } from "./engine/styles/bichos";

/* The engine is edited in place, so what it draws is held to a committed snapshot: one line per drawing, the markup's
 * hash and length. Any change that moves a drawing (a part, a roll, the renderer, a cue) shows in review as the lines it
 * moved in __snapshots__/engine-render.txt; a change that is meant is accepted with
 * `npx vitest run -u src/features/avatar/engine-render.test.ts` (from apps/web). It was first written from a run that
 * rendered 1,500 seeds (every body kind, member and part, three sizes, the scenes) with the engine as it was before it
 * became source here and with the engine after, and found them byte-identical; this is the part of that sample worth
 * keeping. The stylesheet has its own file snapshot (engine-css.test.ts). */

const SIZES: Size[] = ["stage", "sidebar", "rail"];

/** The markup with its per-drawing id prefix (`bx<n>`, `bd<n>`: the n-th drawing this module made) taken out, so a
 *  drawing's line does not depend on how many were drawn before it. */
function stable(prefix: "bx" | "bd", draw: () => string): string {
  const counter = (parseInt(uid(""), 36) + 1).toString(36);
  const html = draw();
  const own = html.replaceAll(`${prefix}${counter}`, `${prefix}#`);
  expect(own).toContain(`${prefix}#`);
  return own;
}

const line = (name: string, html: string) => `${name} ${createHash("sha256").update(html).digest("hex").slice(0, 16)} ${html.length}`;

function sample(): string[] {
  // Conversation ids as the app has them, an odd one, every body kind pinned, and every member of every family.
  const families = FAMILIES.filter((family) => MEMBERS.some((member) => member.family === family.id));
  const seeds = [
    ...Array.from({ length: 40 }, (_, i) => `thread-${i}`),
    "t-login", "7f3c2a91-thread", "Ünïcødé ✓",
    ...BODIES.map((body, i) => `bicho:${families[i % families.length].id}:body-${i}?body=${body.id}`),
    ...MEMBERS.map((member) => `bicho:${member.family}/${member.id}:sample`),
  ];
  const lines: string[] = [];
  for (const seed of seeds) {
    const spec = specFromSeed(seed);
    for (const size of SIZES) lines.push(line(`${seed} ${size}`, stable("bx", () => renderSpec(spec, size).html)));
  }
  // The scenes a seed also rolls: its backdrop (on each theme) and its desk.
  for (const seed of seeds.slice(0, 20)) {
    const tone = renderSpec(specFromSeed(seed), "rail").tone, id = backdropFromSeed(seed);
    for (const theme of ["dark", "light"] as const) lines.push(line(`${seed} backdrop ${id} ${theme}`, stable("bd", () => backdropSvg(id, tone, theme))));
    lines.push(line(`${seed} desk`, deskSvg(deskFromSeed(seed))));
  }
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

test("the engine draws what it drew: a sample of seeds, sizes and scenes holds to its snapshot", async () => {
  await expect(sample().join("\n") + "\n").toMatchFileSnapshot("./__snapshots__/engine-render.txt");
});

test("a drawing is the same whenever it is drawn", () => {
  const draw = () => stable("bx", () => renderSpec(specFromSeed("7f3c2a91-thread"), "stage").html);
  expect(draw()).toBe(draw());
});
