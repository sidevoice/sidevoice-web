import { SWATCHES, batch, type ColorRule } from "../bichos/kit";

/* The existing species as v4 families and members (docs/catalogue.md §1). */

const PAPER: ColorRule[] = SWATCHES.slice(0, 7).map(([, hue, sat, light]) => ({ hue, sat, light, spot: 160 }));
const PINS = (p: number) => ({ p, pick: "pins" });

export default batch({
  label: "Plantillas de siempre",
  families: [
    // Batches add to these families and members from their own files (`extend`): B05 lends the monsters' small tops,
    // B06 gives the cat, bunny and bear their catalogue pools, B08 lends the birds' crests and gives the owl wings, B03 and
    // B04 spread their faces, B13 gives the robot its LED faces. Family weights (B14): no family above ~12% of seeds.
    { id: "monsters", label: "Monstruos", weight: 12, color: { hue: [0, 360], sat: [70, 86], light: [56, 64], spot: { pick: [150, 180, 210, 40] } } },
    { id: "furry", label: "Peluditos", weight: 12, color: { hue: [20, 40], sat: [30, 60], light: [45, 80], spot: 160 } },
    { id: "birds", label: "Plumíferos", weight: 9, color: { hue: [0, 360], sat: [40, 80], light: [50, 75], spot: 180 } },
    { id: "pond", label: "Charca", weight: 8, color: { hue: [80, 160], sat: [45, 65], light: [50, 70], spot: 300 } },
    { id: "bots", label: "Robots", weight: 7, color: { hue: { pick: [185, 10, 48, 275] }, sat: 45, light: 62, spot: 180 } },
  ],
  members: [
    {
      id: "monster", family: "monsters", label: "monstruo", weight: 14, bodies: "blob",
      fixed: { pattern: ["spots"], arms: "nubs", legs: "feet" },
      pools: { top: { p: 0.8, pick: ["horns", "antenna", "spikes", "ears"] }, eyes: ["two", "cyclops", "three", "wonky"], mouth: ["fangs", "teeth", "gap", "tongue", "smile"] },
    },
    {
      id: "cat", family: "furry", label: "gato", weight: 14, bodies: "round",
      fixed: { top: "cat", eyes: "two", mouth: "cat", tail: "cat", pattern: ["belly"], marks: "whiskers", nose: "nose", arms: "nubs", legs: "feet" },
      pools: { pattern: { p: 0.55, pick: ["stripes"] }, pins: PINS(0.2) },
      color: [{ hue: 28, sat: 80, light: 60, spot: 160 }, { hue: 220, sat: 10, light: 62, spot: 160 }, { hue: 260, sat: 18, light: 30, spot: 160 }, { hue: 35, sat: 45, light: 80, spot: 160 }],
    },
    {
      id: "fox", family: "furry", label: "zorro", weight: 14, bodies: "round",
      fixed: { top: "fox", mouth: "cat", tail: "fox", pattern: ["belly"], nose: "nose", cheeks: "blush", arms: "nubs", legs: "feet" },
      pools: { eyes: ["two"], pins: PINS(0.7) },
      color: { hue: [16, 30], sat: 78, light: 56, spot: 160 },
    },
    {
      id: "bunny", family: "furry", label: "conejo", weight: 14, bodies: "tall",
      fixed: { top: "bunny", eyes: "two", mouth: "cat", pattern: ["belly"], nose: "nose", cheeks: "blush", arms: "nubs", legs: "feet" },
      pools: { pins: PINS(0.5) },
      color: { hue: { pick: [330, 20, 200, 270, 45] }, sat: 55, light: 80, spot: 160 },
    },
    {
      id: "bear", family: "furry", label: "oso", weight: 12, bodies: "round",
      fixed: { top: "bear", eyes: "beady", mouth: "cat", pattern: ["belly"], nose: "nose", arms: "nubs", legs: "feet" },
      pools: { pins: PINS(0.6) },
      color: [{ weight: 1, hue: 0, sat: 0, light: 92, spot: 160 }, { weight: 4, hue: [22, 38], sat: 45, light: 48, spot: 160 }],
    },
    {
      id: "owl", family: "birds", label: "búho", weight: 14, bodies: "tall",
      fixed: { top: "owl", eyes: "big", mouth: "beak", pattern: ["belly"], arms: "nubs", legs: "feet" },
      pools: { pins: PINS(0.7) },
      color: PAPER,
    },
    {
      id: "frog", family: "pond", label: "rana", weight: 14, bodies: "wide",
      fixed: { top: "frog", eyes: "two", pattern: ["belly"], cheeks: "blush", arms: "nubs", legs: "feet" },
      pools: { mouth: ["smile", "gap"], pins: PINS(0.5) },
      color: { hue: [85, 140], sat: 62, light: 52, spot: 300 },
    },
    {
      // No face here: the old screen face (`led` eyes and mouth) is legacy, for `v3:` seeds only. B13 gives the robot its
      // plate-free LED faces (eyes and mouth pools); without B13 it would roll any eyes and mouth.
      id: "robot", family: "bots", label: "robot", weight: 14, bodies: "box",
      fixed: { top: "antenna", arms: "nubs", legs: "feet" },
      pools: { earwear: { p: 0.3, pick: "headphones" } },
    },
  ],
});
