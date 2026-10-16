import { expect, test } from "vitest";
import { renderSpec } from "./engine/bichos/render";
import { specFromSeed } from "./engine/bichos/seed";

/* The XX bucket (b09-gear-head.ts): the operator's hat, one part per puff colour, asked for by name in a seed. */

const COLOURS = { purple: "#9b5de5", lime: "#c6f36b", orange: "#ff6a2b" } as const;
const seeds = {
  purple: "bicho:furry/cat:b09-xx-morado?headgear=xx-bucket-purple",
  lime: "bicho:monsters/monster:b09-xx-lima?headgear=xx-bucket-lime&eyes=two",
  orange: "bicho:furry/bear:b09-xx-naranja?headgear=xx-bucket-orange",
} as const;

for (const [colour, puff] of Object.entries(COLOURS) as [keyof typeof COLOURS, string][]) {
  test(`the ${colour} XX bucket: its puff face over the ink at every size, the splatter only where it reads`, () => {
    const spec = specFromSeed(seeds[colour]);
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
