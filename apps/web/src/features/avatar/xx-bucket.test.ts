import { expect, test } from "vitest";
import { renderSpec } from "./engine/bichos/render";
import { normalizeSpec } from "./engine/bichos/spec";

/* The XX bucket (b09-gear-head.ts): the operator's hat, one part per puff colour, worn by a creature put together by hand. */

const COLOURS = { purple: "#9b5de5", lime: "#c6f36b", orange: "#ff6a2b" } as const;
/** A creature wearing it, as the editor would put one together. */
const wearing = (colour: string) => normalizeSpec({ body: "round", parts: { eyes: "two", mouth: "smile", arms: "nubs", legs: "feet", headgear: `xx-bucket-${colour}` }, color: { hue: 28, sat: 80, light: 60, spot: 160 }, shape: `b09-xx-${colour}`, name: "xx" });

for (const [colour, puff] of Object.entries(COLOURS) as [keyof typeof COLOURS, string][]) {
  test(`the ${colour} XX bucket: its puff face over the ink at every size, the splatter only where it reads`, () => {
    const spec = wearing(colour);
    expect(spec.parts.headgear).toBe(`xx-bucket-${colour}`);
    const stage = renderSpec(spec, "stage").html, sidebar = renderSpec(spec, "sidebar").html, rail = renderSpec(spec, "rail").html;
    for (const html of [stage, sidebar, rail]) {
      // The face's lines, each in its colour over a thicker ink line: the X eyes and the grin.
      expect(html).toContain(`stroke="${puff}"`);
      // The black hat, shaded the cast's way from its own colour.
      expect(html).toContain("#2c2832");
    }
    // Thicker puff lines at the small sizes, so the eyes and the grin still read.
    expect(sidebar).toContain(`stroke="${puff}" stroke-width="3.4"`);
    expect(stage).toContain(`stroke="${puff}" stroke-width="2.6"`);
    // Specks down to the sidebar, none at the rail; the drips on the stage alone.
    expect(sidebar).toContain('fill="#f4f1ea"');
    expect(rail).not.toContain('fill="#f4f1ea"');
    expect(stage).toContain('stroke="#8d8796"');
    expect(sidebar).not.toContain('stroke="#8d8796"');
  });
}
