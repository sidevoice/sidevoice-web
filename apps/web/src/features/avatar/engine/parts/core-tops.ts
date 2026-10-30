import { LAYER, batch } from "../bichos/kit";

/* The existing head decorations, drawn on the reference body (crown at 40, half width 32). Each socket is the
 * reference body's anchor, so a top lands exactly where it always did there and follows the anchor on any other body.
 * Tops taller than ~14 units over the crown are tagged "tall": headgear hides them. Tops that emit eye stalks are tagged
 * "stalks". */

export default batch({
  slots: [{ id: "top", label: "Cabeza", order: 10, none: "nada", layer: LAYER.top, noise: 2 }],
  parts: [
    { id: "horns", slot: "top", label: "cuernos", at: "crownL", socket: [47.9, 44], draw: { pieces: [{ d: "M42 46 Q32 22 38 16 Q44 30 52 40Z", c: "horn" }] } },
    {
      id: "antenna", slot: "top", label: "antena", at: "crown", socket: [60, 42], tags: ["tall"],
      draw: { pieces: [{ d: "M60 42 L60 22", c: "dark", w: 5, flat: true }, { d: "M60 17 L60 17.1", c: "spot", w: 15, g: "bulb", flat: true, layer: LAYER.float }] },
    },
    { id: "spikes", slot: "top", label: "pinchos", at: "crown", socket: [60, 42], draw: { pieces: [{ d: "M40 48 L44 30 L52 40 L60 24 L68 40 L76 30 L80 48Z", c: "spot" }] } },
    { id: "ears", slot: "top", label: "orejas de monstruo", at: "earL", socket: [40.8, 42], draw: { pieces: [{ d: "M30 52 Q18 30 34 30 Q44 34 44 42Z", c: "body" }] } },
    {
      id: "cat", tags: ["ears"], slot: "top", label: "orejas de gato", at: "earL", socket: [40.8, 42],
      draw: { pieces: [{ d: "M34 54 L35 22 L56 40Z", c: "body" }, { d: "M38 48 L39 30 L50 41Z", c: "pink", ink: "inner" }] },
    },
    {
      id: "fox", tags: ["ears"], slot: "top", label: "orejas de zorro", at: "earL", socket: [40.8, 42],
      draw: { pieces: [{ d: "M32 54 L27 16 L54 38Z", c: "body" }, { d: "M35 47 L31 25 L47 38Z", c: "belly", ink: "inner" }, { d: "M28 24 L27 16 L34 21Z", c: "dark", ink: "inner" }] },
    },
    {
      id: "bunny", slot: "top", label: "orejas de conejo", at: "crownL", socket: [47.9, 44], group: "ear", tags: ["tall", "ears"],
      draw: { pieces: [{ d: "M46 44 Q34 4 47 3 Q58 4 55 42Z", c: "body" }, { d: "M48 38 Q41 12 47 9 Q52 11 52 38Z", c: "pink", ink: "inner" }] },
    },
    {
      id: "bear", tags: ["ears"], slot: "top", label: "orejas de oso", at: "earL", socket: [40.8, 42],
      draw: { pieces: [{ d: "M38 22 Q26 22 26 34 Q26 46 38 46 Q50 46 50 34 Q50 22 38 22Z", c: "body" }, { d: "M38 28 Q32 28 32 34 Q32 40 38 40 Q44 40 44 34 Q44 28 38 28Z", c: "belly", ink: "inner" }] },
    },
    { id: "owl", slot: "top", label: "penachos de búho", at: "earL", socket: [40.8, 42], draw: { pieces: [{ d: "M36 48 L28 20 L50 38Z", c: "dark" }] } },
    {
      // Eye domes: they emit eye stalks, so a pair of eyes sits on them (tag `stalks`: the eyes leave the face, so
      // whatever reaches round the head from them, a mask, temples, a clip, keeps off). The socket is recorded on the
      // frog's own body (wide), where it lands exactly as before.
      id: "frog", slot: "top", label: "ojos de rana", at: "crownL", socket: [47.54, 48], tags: ["tall", "stalks"],
      requires: ["eyes:two|beady|big|button|hollow"],
      draw: { pieces: [{ d: "M42 30 Q30 30 30 42 Q30 54 42 54 Q54 54 54 42 Q54 30 42 30Z", c: "body" }], emits: { stalkL: { x: 42, y: 38, r: 8 } } },
    },
    {
      id: "sprout", slot: "top", label: "brote", at: "crown", socket: [60, 42], group: "sprout", tags: ["tall"],
      draw: { pieces: [{ d: "M60 42 Q58 30 62 20", c: "dark", w: 3.5, flat: true }, { d: "M61 28 Q46 18 44 26 Q52 34 61 28Z", c: "spot" }, { d: "M62 24 Q76 12 80 20 Q72 30 62 24Z", c: "spot" }] },
    },
  ],
});
