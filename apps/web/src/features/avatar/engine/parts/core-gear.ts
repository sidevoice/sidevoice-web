import { HAT, LAYER, batch, ellipse, n, pair, seatHat as seat, topAt, wornHat as worn, type Ctx, type Drawing, type Piece, type Rig } from "../bichos/kit";

/* The existing accessories, one slot per region so a bicho never wears two hats or a scarf over a bow tie. Hats are
 * rigid (drawn for a crown at 40, they land on `hat`, which is the crown unless the body seats hats lower); the rest
 * fit themselves to the body from its anchors. */

/* Hats are drawn with their top line at T (the kit's HAT_TOP, 34: 6 units above the reference crown) and seat
 * themselves with the kit's `seatHat`: up to HAT_LIFT (3) off the head so the raised brows clear the brim, otherwise
 * seated with a declared `brim` (the renderer leaves those brows out). `wornHat` draws a hat's pieces merged and again
 * as inner pieces, so it lies over a cat's inner ears and tabby stripes. `HAT`: hats join `hat` and hide tall tops and
 * `#hat-hidden` parts; headgear runs before the marks (`evaluate` on the slot). */

function beanie(ctx: Ctx): Drawing {
  const { T, brim } = seat(ctx, 10);
  return {
    pieces: worn([
      { d: `M42 ${n(T + 6)} Q42 ${n(T - 15)} 60 ${n(T - 15)} Q78 ${n(T - 15)} 78 ${n(T + 6)}Z`, c: "spot" },
      { d: `M40 ${n(T + 1)} L80 ${n(T + 1)} Q82 ${n(T + 1)} 82 ${n(T + 4)} L82 ${n(T + 7)} Q82 ${n(T + 10)} 80 ${n(T + 10)} L40 ${n(T + 10)} Q38 ${n(T + 10)} 38 ${n(T + 7)} L38 ${n(T + 4)} Q38 ${n(T + 1)} 40 ${n(T + 1)}Z`, c: "dark" },
    ], [{ d: `M60 ${n(T - 18)} L60 ${n(T - 17.9)}`, c: "belly", w: 12, flat: true }]),
    over: `<path class="ribs" d="${[44, 49, 54, 59, 64, 69, 74, 79].map((x) => `M${x} ${n(T + 3)} L${x} ${n(T + 8)}`).join("")}"/><path class="ribs soft" d="M50 ${n(T - 8)} Q52 ${n(T - 2)} 52 ${n(T + 1)} M60 ${n(T - 12)} L60 ${n(T + 1)} M70 ${n(T - 8)} Q68 ${n(T - 2)} 68 ${n(T + 1)}"/>`,
    brim,
  };
}

function cap(ctx: Ctx): Drawing {
  // The visor's lowest point: its underside, Q86 T+10 between T+6 and T+8, bottoms out at T+8.5.
  const { T, brim } = seat(ctx, 8.5);
  return {
    pieces: worn([
      { d: `M40 ${n(T + 6)} Q40 ${n(T - 14)} 60 ${n(T - 14)} Q80 ${n(T - 14)} 80 ${n(T + 6)}Z`, c: "spot" },
      { d: `M62 ${n(T + 3)} Q86 ${n(T - 2)} 98 ${n(T + 6)} Q86 ${n(T + 10)} 62 ${n(T + 8)}Z`, c: "dark" },
    ], [{ d: `M60 ${n(T - 15)} L60 ${n(T - 14.9)}`, c: "dark", w: 5, flat: true }]),
    over: `<path class="ribs soft" d="M60 ${n(T - 13)} L60 ${n(T + 5)} M50 ${n(T - 10)} Q47 ${n(T - 2)} 48 ${n(T + 5)}"/>`,
    brim,
  };
}

function crown(ctx: Ctx): Drawing {
  const { T, brim } = seat(ctx, 6);
  return {
    pieces: worn([{ d: `M44 ${n(T + 6)} L42 ${n(T - 12)} L51 ${n(T - 3)} L60 ${n(T - 16)} L69 ${n(T - 3)} L78 ${n(T - 12)} L76 ${n(T + 6)}Z`, c: "gold" }]),
    over: `<g class="gems"><circle cx="60" cy="${n(T - 1)}" r="2.8" fill="#e5483a"/><circle cx="50" cy="${n(T + 2)}" r="2" fill="#4fa3ff"/><circle cx="70" cy="${n(T + 2)}" r="2" fill="#4fa3ff"/><circle cx="42" cy="${n(T - 12)}" r="1.6" fill="#fff6c8"/><circle cx="60" cy="${n(T - 16)}" r="1.6" fill="#fff6c8"/><circle cx="78" cy="${n(T - 12)}" r="1.6" fill="#fff6c8"/></g>`,
    brim,
  };
}

type P = [number, number];
/** The piece of the quadratic p0 → (c) → p2 between t0 and t1, as a path. */
function subQuad(p0: P, c: P, p2: P, t0: number, t1: number): string {
  const at = (t: number): P => [0, 1].map((k) => (1 - t) * (1 - t) * p0[k] + 2 * t * (1 - t) * c[k] + t * t * p2[k]) as P;
  const a = (1 - t0) * (1 - t1), b = (1 - t0) * t1 + t0 * (1 - t1), d = t0 * t1;
  const [s, e] = [at(t0), at(t1)], q = [0, 1].map((k) => a * p0[k] + b * c[k] + d * p2[k]);
  return `M${n(s[0])} ${n(s[1])}Q${n(q[0])} ${n(q[1])} ${n(e[0])} ${n(e[1])}`;
}

/** The knitted scarf: a band round the neck, and one end that hangs in front of it and ends, fringe and all, above the
 * floor. The band merges into the outline where it wraps past the body's sides; its middle is also drawn inside the
 * silhouette, so it lies over a belly patch (the middle stops short of the arms, which stay in front of the band). The
 * end crosses the band with a thin ink edge, and its fat outline shows where it hangs past the body. */
function scarf(rig: Rig) {
  const { x, y } = rig.at.neck, h = rig.half, w = h - 4;
  const p0: P = [x - w, y], c: P = [x, y + 9], p2: P = [x + w, y];
  const band = `M${n(p0[0])} ${y} Q${x} ${y + 9} ${n(p2[0])} ${y}`;
  const tAt = (px: number) => Math.min(1, Math.max(0, (px - p0[0]) / (2 * w)));
  const bandY = (px: number) => { const t = tAt(px); return y + 18 * t * (1 - t); };
  // The middle, inside the silhouette: it ends (round cap included) before the shoulders, where the arms join.
  const mid = Math.max(0, h - 10.5) / w;
  // The end: from a knot over the band to a flat hem, at most 24 below the neck, the fringe tips 2 over the floor, and on a
  // floating body no lower than its feet would be.
  const xe = x + h - 14, top = bandY(xe) - 2, hem = Math.min(y + 24, rig.at.ground.y - 6.5, rig.bottom + 6), xb = xe + 2;
  const end = `M${n(xe - 4)} ${n(top)} L${n(xb - 4.5)} ${n(hem)} L${n(xb + 4.5)} ${n(hem)} L${n(xe + 4)} ${n(top)} Q${n(xe + 4)} ${n(top - 4.5)} ${n(xe)} ${n(top - 4.5)} Q${n(xe - 4)} ${n(top - 4.5)} ${n(xe - 4)} ${n(top)}Z`;
  const knit = [subQuad(p0, c, p2, 0, tAt(xe - 5)), subQuad(p0, c, p2, tAt(xe + 5), 1)].join("");
  const pieces: Piece[] = [
    { d: band, c: "spot", w: 9, flat: true },
    ...(mid > 0 ? [{ d: subQuad(p0, c, p2, (1 - mid) / 2, (1 + mid) / 2), c: "spot" as const, w: 9, flat: true, ink: "inner" as const }] : []),
    { d: end, c: "spot", flat: true },
    { d: end, c: "spot", flat: true, ink: "inner", stroke: 2.4 },
  ];
  const fr = hem + 0.6;
  return {
    pieces,
    over: `<g class="knit"><path d="${knit}"/><path d="M${n(xe)} ${n(top - 2)} L${n(xb)} ${n(hem - 1)}"/></g><path class="fringe" d="M${n(xb - 3)} ${n(fr)} l-0.6 3.6 M${n(xb)} ${n(fr)} l0 3.9 M${n(xb + 3)} ${n(fr)} l0.6 3.6"/>`,
  };
}

export default batch({
  slots: [
    { id: "neckwear", label: "Cuello", row: "Accesorios", order: 70, layer: LAYER.worn, noise: 1, gear: "neck", trait: true },
    { id: "headgear", label: "Sombrero", row: "Accesorios", order: 72, evaluate: 43, layer: LAYER.worn, noise: 2, gear: "head", trait: true },
    // Tried a little over half as often as the other gear slots (B14): the earmuffs fit nearly any head and had become the
    // commonest gear item of the cast.
    { id: "earwear", label: "Orejeras", row: "Accesorios", order: 74, layer: LAYER.worn, noise: 2, gear: "head", trait: true },
    { id: "pins", label: "Encuadernadores", row: "Accesorios", order: 76, layer: LAYER.worn, noise: 1, trait: true },
    { id: "eyewear", label: "Gafas", row: "Accesorios", order: 78, layer: LAYER.worn, noise: 1, gear: "face", trait: true },
    // Held items need an arm with a hand: declare `requires: ["#hand"]` and join `handR` (or `handL`, `pair: false`).
    { id: "held", label: "En la mano", row: "Accesorios", order: 90, layer: LAYER.held, noise: 3, gear: "hand", trait: true },
  ],
  parts: [
    { id: "scarf", slot: "neckwear", label: "bufanda", draw: ({ rig }) => scarf(rig) },
    {
      id: "bow", slot: "neckwear", label: "pajarita",
      draw: ({ rig }) => {
        const y = Math.min(rig.at.neck.y + 2, rig.bottom - 13);
        return { over: `<g class="bowtie"><path d="M58 ${y} Q50 ${y - 8} 45 ${y - 5} Q43 ${y} 45 ${y + 5} Q50 ${y + 8} 58 ${y}Z M62 ${y} Q70 ${y - 8} 75 ${y - 5} Q77 ${y} 75 ${y + 5} Q70 ${y + 8} 62 ${y}Z"/><path class="fold" d="M49 ${y - 3} Q52 ${y} 49 ${y + 3} M71 ${y - 3} Q68 ${y} 71 ${y + 3}"/><rect x="56.5" y="${y - 4}" width="7" height="8" rx="2.5"/></g>` };
      },
    },
    { ...HAT, id: "beanie", label: "gorro de lana", draw: beanie },
    { ...HAT, id: "cap", label: "gorra", draw: cap },
    { ...HAT, id: "crown", label: "corona", draw: crown },
    {
      // Cushioned headphones: cups on the temples, the band over the head. The band tops out 24 over the hat anchor (where
      // a hat would sit), and never closer than 12 to the head's real top, so it clears a pointy tip. Tops the band would
      // cut through tag themselves `blocks-band`; tops that sit on the temples, where the cups go, `blocks-temples`.
      id: "headphones", slot: "earwear", label: "cascos", excludes: ["#blocks-band", "#blocks-temples"],
      draw: ({ rig }) => {
        const { templeL: l, templeR: r, hat } = rig.at, cy = l.y, x0 = l.x - 3, cx = hat.x;
        const t = n(Math.min(hat.y - 24, topAt(rig, cx) - 12));
        return {
          pieces: [{ d: `M${l.x + 2} ${cy - 6} Q${l.x + 2} ${t} ${cx} ${t} Q${r.x - 2} ${t} ${r.x - 2} ${cy - 6}`, c: "dark", w: 6, flat: true }, ...pair(ellipse(x0, cy, 7, 10), "spot")],
          over: `<path class="cushion" d="${ellipse(x0 + 2, cy, 3.4, 6)} ${ellipse(120 - x0 - 2, cy, 3.4, 6)}"/>`,
        };
      },
    },
    {
      // Brass split-pins where the old paper puppet's pieces were joined: shoulders and neck.
      id: "pins", slot: "pins", label: "encuadernadores",
      draw: ({ rig }) => {
        const pin = (x: number, y: number) => `<g class="pin"><circle cx="${n(x)}" cy="${n(y)}" r="2.4"/><circle class="pin-hi" cx="${n(x - 0.7)}" cy="${n(y - 0.7)}" r=".8"/></g>`;
        const { shoulderL: a, shoulderR: b } = rig.at;
        return { over: pin(a.x, a.y) + pin(b.x, b.y) + pin(rig.at.neck.x, Math.min(rig.mouthY + 17, rig.bottom - 6)) };
      },
    },
    {
      // Round lenses on whatever eyes the bicho has (one or two), a bridge and temples to the head's edge. They ride the
      // eyes (`rides: "eyes"`): on eye stalks that move, they move with them; on the face, nothing changes.
      id: "glasses", slot: "eyewear", label: "gafas", rides: "eyes", excludes: ["#many-eyes"],
      draw: ({ eyes, rig }) => {
        if (!eyes.length) return {};
        const lens = eyes.map((e) => `<circle cx="${e.x}" cy="${e.y}" r="${n(e.r + 3.2)}"/><path class="lens-shine" d="M${n(e.x - e.r * 0.6)} ${n(e.y + e.r * 0.1)} L${n(e.x - e.r * 0.05)} ${n(e.y - e.r * 0.65)}"/>`).join("");
        const a = eyes[0], z = eyes[eyes.length - 1];
        const bridge = eyes.length > 1 ? `<path d="M${n(a.x + a.r + 3)} ${a.y} Q60 ${a.y - 5} ${n(z.x - z.r - 3)} ${z.y}"/>` : "";
        const temples = `<path d="M${n(a.x - a.r - 3)} ${a.y} L${n(rig.at.templeL.x + 1)} ${a.y - 2} M${n(z.x + z.r + 3)} ${z.y} L${n(rig.at.templeR.x - 1)} ${z.y - 2}"/>`;
        return { over: `<g class="glasses">${lens}${bridge}${temples}</g>` };
      },
    },
  ],
  css: `
    .pin circle { fill: #c9a24a; stroke: #1b1428; stroke-width: 1 }
    .pin .pin-hi { fill: #f6e3a1; stroke: none }
    .glasses { fill: rgb(255 255 255 / .12); stroke: #1b1428; stroke-width: 2.6; stroke-linecap: round }
    .glasses path { fill: none }
    .glasses .lens-shine { stroke: #fff; stroke-width: 2; opacity: .8 }
    .knit path { fill: none; stroke: var(--bx-belly); stroke-width: 9; stroke-dasharray: 3 5; stroke-linecap: butt; opacity: .7 }
    .knit path + path { stroke-width: 6 }
    .fringe, .ribs { fill: none; stroke: #1b1428; stroke-width: 1.8; stroke-linecap: round }
    .ribs.soft { stroke-width: 1.4; opacity: .45 }
    .cushion { fill: var(--bx-dark) }
    .bowtie path, .bowtie rect { fill: var(--bx-spot); stroke: #1b1428; stroke-width: 2.4; stroke-linejoin: round }
    .bowtie .fold { fill: none; stroke-width: 1.6 }
  `,
});
