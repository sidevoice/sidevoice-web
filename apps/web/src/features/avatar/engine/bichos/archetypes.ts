import type { FamilyWeights, HslRange } from "./palette";

/* The creatures a conversation can be (web#280). A creature is an ARCHETYPE (a broad kind: feline, bird, robot,
 * elemental…), sometimes one of its SUB-TYPES (the elemental's fire, water, rock…), and this file is the only place
 * that says which bodies, parts and colours each may have. The catalogue's own rules (a part's `requires`, `excludes`,
 * `hides`, `noise`) still decide whether two parts can meet; this file decides how likely they are to be offered.
 *
 * Reading a plan: `slot(p, tier(common, uncommon, rare))` fills the slot with chance `p` (else it stays empty) from the
 * listed parts, which weigh 10, 4 and 1.2 by tier. `id@body|body` limits an option to those bodies (a robot's wheels
 * to the boxy ones; `id@!body`: all but those). A sub-type replaces whichever fields it declares and inherits the rest. Sampling order and the
 * budgets are generate.ts's; the policy at the bottom holds the rules that are not per archetype. */

export const TIER_WEIGHT = { common: 10, uncommon: 4, rare: 1.2 } as const;

export interface Option { id: string; weight: number; bodies?: readonly string[]; except?: readonly string[] }
export interface Plan { p: number; options: readonly Option[] }

const parse = (list: string, weight: number): Option[] => list.split(" ").filter(Boolean).map((token) => {
  const [id, bodies] = token.split("@");
  if (!bodies) return { id, weight };
  return bodies.startsWith("!") ? { id, weight, except: bodies.slice(1).split("|") } : { id, weight, bodies: bodies.split("|") };
});
/** Options by tier: "a b@box|can" is two options, the second only on those bodies. */
const tier = (common = "", uncommon = "", rare = ""): Option[] => [...parse(common, TIER_WEIGHT.common), ...parse(uncommon, TIER_WEIGHT.uncommon), ...parse(rare, TIER_WEIGHT.rare)];
const slot = (p: number, options: readonly Option[] = []): Plan => ({ p, options });
const none = slot(0);
/** Bodies and their weights: "round:4 pear:1". */
const weights = (list: string): Option[] => list.split(" ").map((x) => { const [id, w] = x.split(":"); return { id, weight: Number(w) }; });

/** A dominant decoration is a pattern (chance `pattern.p`), else marks (chance `marks.p`), else none. */
export interface Archetype {
  id: string;
  weight: number;
  bodies: readonly Option[];
  /** Base-colour families and their weights, or colours of its own (an element's), by weight. */
  families?: FamilyWeights;
  element?: readonly HslRange[];
  robot?: boolean;
  top: Plan; nose: Plan; mouth: Plan; arms: Plan; legs: Plan; tail: Plan; back: Plan; cheeks: Plan; pattern: Plan; marks: Plan;
  /** Food: one fixed (top, pattern) set per body, with weights, instead of the top and pattern plans. */
  sets?: Record<string, readonly [top: string | null, pattern: string | null, weight: number][]>;
}
export interface SubType extends Partial<Omit<Archetype, "id">> { weight: number }
export interface ArchetypeDef extends Archetype { subs?: Record<string, SubType> }

/** An archetype as sampled: its sub-type's fields laid over its own. */
export interface Kind extends Archetype { archetype: string; sub?: string }

export const ARCHETYPES: readonly ArchetypeDef[] = [
  {
    id: "felino", weight: 1, bodies: weights("round:4 pear:1 pill:2 blob:1"),
    families: { calidos: 3, neutros: 3, tierra: 2, claros: 1, pasteles: 2, joya: 1 },
    top: slot(0.95, tier("cat fox", "ears-pointy", "mane")), nose: slot(0.8, tier("nose button heart", "muzzle")), mouth: slot(1, tier("cat smile tiny", "tongue smirk grin")),
    arms: slot(1, tier("nubs paws", "mitts")), legs: slot(1, tier("feet paws", "boots")), tail: slot(0.85, tier("cat fox", "ringed curl puff", "devil")),
    back: slot(0.1, tier("", "wings-bat wings-angel")), cheeks: slot(0.3, tier("blush", "freckles shy-lines")),
    pattern: slot(0.3, tier("belly stripes patch", "moon-chest tux fur-tips")), marks: slot(0.3, tier("whiskers", "mask eyepatch face-stripes")),
  },
  {
    id: "perrito", weight: 0.8, bodies: weights("round:3 blob:1 pill:1"),
    families: { tierra: 4, neutros: 3, calidos: 2, claros: 1, pasteles: 1 },
    top: slot(1, tier("ears-floppy", "ears-lop")), nose: slot(1, tier("snout-dog", "nose button")), mouth: slot(1, tier("tongue smile", "cat grin tiny")),
    arms: slot(1, tier("paws nubs")), legs: slot(1, tier("paws feet")), tail: slot(0.7, tier("cat", "curl puff")), back: none, cheeks: slot(0.3, tier("blush", "freckles")),
    pattern: slot(0.4, tier("patch", "belly spots")), marks: slot(0.15, tier("eyepatch mask")),
    subs: {
      perrito: { weight: 3 },
      // a pony: tall, a mane and nostrils, no dog's snout
      poni: {
        weight: 1, bodies: weights("tall:3 pear:1"), families: { tierra: 3, neutros: 3, pasteles: 3, calidos: 2, claros: 1 },
        top: slot(1, tier("mane", "", "mane-uni")), nose: slot(0.8, tier("nostrils")), arms: slot(1, tier("nubs")), legs: slot(1, tier("feet")), tail: slot(0.8, tier("puff", "cat curl")),
        pattern: slot(0.3, tier("belly patch")), marks: none,
      },
    },
  },
  {
    // the soft, round, furry ones
    id: "peludito", weight: 1.6, bodies: weights("round:4 pear:2 blob:1 pill:1"),
    families: { tierra: 4, calidos: 2, neutros: 3, pasteles: 2, claros: 1 },
    top: slot(1, tier("bear ears-panda ears-mouse", "", "ears-floppy")), nose: slot(0.85, tier("button nose muzzle", "heart")), mouth: slot(1, tier("cat smile tiny", "buck grin tongue")),
    arms: slot(1, tier("nubs paws", "mitts")), legs: slot(1, tier("feet paws", "boots")), tail: slot(0.45, tier("puff", "mouse ringed", "squirrel")),
    back: slot(0.08, tier("", "fuzz backpack")), cheeks: slot(0.4, tier("blush", "freckles")),
    pattern: slot(0.3, tier("belly fur-tips moon-chest", "tux patch")), marks: slot(0.15, tier("eyepatch face-patch")),
    subs: {
      "osito-raton": { weight: 3 },
      mapache: {
        weight: 1.2, bodies: weights("round:3 blob:1"), top: slot(1, tier("ears-pointy")), nose: slot(0.8, tier("button", "nose")), tail: slot(0.95, tier("ringed", "curl")),
        arms: slot(1, tier("mitts paws", "nubs")), legs: slot(1, tier("paws feet")), back: none, pattern: slot(0.25, tier("belly")), marks: slot(0.9, tier("mask", "eyepatch")), cheeks: slot(0.2, tier("blush")),
      },
      cerdito: {
        weight: 1.2, bodies: weights("wide:3 round:1"), families: { pasteles: 4, calidos: 3, neutros: 2, tierra: 1 }, top: slot(1, tier("ears-pig")), nose: slot(1, tier("snout-pig")), tail: slot(0.9, tier("curl")),
        arms: slot(1, tier("nubs", "paws")), legs: slot(1, tier("feet", "boots")), back: none, mouth: slot(1, tier("smile tiny cat", "grin")), pattern: slot(0.3, tier("belly", "patch spots")), marks: none, cheeks: slot(0.6, tier("blush")),
      },
      erizo: {
        weight: 1.2, bodies: weights("pear:3 round:1"), families: { tierra: 4, neutros: 3, calidos: 1, claros: 1 }, top: slot(0.15, tier("", "tuft")), nose: slot(1, tier("button", "nose")), tail: none,
        arms: slot(1, tier("paws", "nubs")), legs: slot(1, tier("feet paws")), back: slot(1, tier("quills")), pattern: slot(0.3, tier("belly")), marks: slot(0.4, tier("face-patch")), cheeks: slot(0.3, tier("blush")),
      },
      "yeti-peludo": {
        weight: 1.2, bodies: weights("pear:3 round:2 blob:1"), families: { claros: 4, neutros: 3, pasteles: 2, frescos: 1 }, top: slot(0.9, tier("tuft", "ears-long horns-ram antlers")), nose: slot(0.3, tier("nose")), tail: none,
        arms: slot(1, tier("nubs noodle")), legs: slot(1, tier("feet", "boots")), back: none, pattern: slot(0.8, tier("fur-tips", "belly")), marks: slot(0.5, tier("face-patch")), cheeks: slot(0.2, tier("blush")),
      },
    },
  },
  {
    id: "conejo", weight: 1, bodies: weights("tall:4 pill:2 pear:1 round:1"),
    families: { pasteles: 4, neutros: 3, claros: 2, calidos: 2, tierra: 1 },
    top: slot(1, tier("bunny", "ears-long")), nose: slot(0.85, tier("heart nose button", "nostrils")), mouth: slot(1, tier("cat tiny smile", "buck grin")),
    arms: slot(1, tier("nubs paws")), legs: slot(1, tier("feet paws")), tail: slot(0.7, tier("puff", "mouse")), back: slot(0.08, tier("", "wings-angel wings-butterfly")), cheeks: slot(0.5, tier("blush", "freckles")),
    pattern: slot(0.3, tier("belly patch", "fur-tips frost")), marks: slot(0.1, tier("bandaid", "eyepatch")),
  },
  {
    id: "pajaro", weight: 1.2, bodies: weights("tall:2 pear:3 tri:2 round:2 drop:1 wide:1"),
    families: { frescos: 3, pasteles: 2, joya: 2, calidos: 3, tierra: 1, neutros: 1 },
    top: slot(0.9, tier("crest feather-curl tuft owl", "comb mohawk antennae-feather", "halo")), nose: none, mouth: slot(1, tier("beak beak-small bill", "beak-hook", "beak-big")),
    arms: slot(1, tier("wing", "nubs flipper")), legs: slot(1, tier("bird feet", "boots webbed")), tail: slot(0.7, tier("feathers", "puff curl")), back: none, cheeks: slot(0.25, tier("blush")),
    pattern: slot(0.35, tier("belly tux fur-tips", "scales")), marks: slot(0.1, tier("eyepatch face-patch mask")),
  },
  {
    id: "pez", weight: 1, bodies: weights("wide:2 drop:2 round:2 blob:1"),
    families: { frescos: 5, joya: 2, pasteles: 2, calidos: 1, claros: 1 },
    top: slot(0.7, tier("fin-crown gills", "spout", "crest")), nose: none, mouth: slot(1, tier("smile pout gap wavy", "buck fangs tongue", "saw")),
    arms: slot(1, tier("fins flipper")), legs: slot(0.2, tier("webbed")), tail: slot(1, tier("fishtail fluke")), back: slot(0.7, tier("fin-dorsal")), cheeks: slot(0.25, tier("blush")),
    pattern: slot(0.5, tier("scales belly stripes bands", "spots grooves prickles")), marks: slot(0.1, tier("mask")),
  },
  {
    id: "anfibio", weight: 1, bodies: weights("wide:4 blob:2 round:2 drop:1"),
    families: { frescos: 5, tierra: 2, calidos: 1, pasteles: 2, joya: 1 },
    top: slot(0.95, tier("frog eyestalks")), nose: slot(0.25, tier("bulb nostrils")), mouth: slot(1, tier("smile gap grin wavy", "tongue buck tusks")),
    arms: slot(1, tier("nubs fins")), legs: slot(1, tier("feet webbed", "boots many")), tail: slot(0.25, tier("curl", "lizard fluke")), back: slot(0.2, tier("shell-turtle fin-dorsal")), cheeks: slot(0.5, tier("blush", "freckles")),
    pattern: slot(0.5, tier("belly spots stripes", "specks")), marks: none,
    subs: {
      rana: { weight: 3 },
      // a salamander with gills
      ajolote: {
        weight: 1.2, bodies: weights("wide:3 blob:1"), families: { pasteles: 5, calidos: 2, neutros: 2, frescos: 1 }, top: slot(1, tier("gills")), nose: none, mouth: slot(1, tier("smile", "gap tiny grin")),
        arms: slot(1, tier("nubs")), legs: slot(1, tier("feet", "boots")), tail: slot(0.8, tier("lizard", "fluke")), back: none, pattern: slot(0.5, tier("belly", "spots")),
      },
      // newt, chameleon, little dinosaur
      "lagarto-dino": {
        weight: 1.5, bodies: weights("tall:3 round:3 pear:1"), families: { frescos: 4, tierra: 3, calidos: 2, joya: 2, pasteles: 1 }, top: slot(0.6, tier("casque", "horn-beetle")), nose: slot(0.2, tier("nostrils")),
        mouth: slot(1, tier("smile grin gap", "tongue fangs")), arms: slot(1, tier("nubs")), legs: slot(1, tier("feet")), tail: slot(1, tier("lizard spiral dino")), back: slot(0.2, tier("", "", "plates")), pattern: slot(0.6, tier("spots belly", "stripes")),
      },
    },
  },
  {
    id: "insecto", weight: 1, bodies: weights("pear:2 round:2 drop:1 blob:1 pill:1 wide:0.8 tall:0.8 box:0.4"),
    families: { calidos: 3, joya: 2, frescos: 3, tierra: 2, pasteles: 2 },
    top: slot(0.95, tier("antennae-bobble antennae-feather antennae-bent", "horn-beetle eyestalks")), nose: none, mouth: slot(1, tier("smile tiny pout", "gap teeth fangs")),
    arms: slot(1, tier("nubs")), legs: slot(1, tier("stick feet", "many boots")), tail: slot(0.2, tier("", "stinger glow")), back: slot(0.5, tier("wings-bee", "wings-butterfly", "shell-ladybug elytra backpack")), cheeks: slot(0.3, tier("blush")),
    pattern: slot(0.5, tier("spots stripes bands", "segments")), marks: none,
  },
  {
    id: "blandito", weight: 1, bodies: weights("dome:3 drop:3 blob:2 wide:1"),
    families: { pasteles: 4, frescos: 3, calidos: 2, joya: 2, claros: 1 },
    top: slot(0.85, tier("eyestalks spout", "drip antennae-bobble sprout")), nose: none, mouth: slot(1, tier("smile gap wavy pout", "tongue tiny buck")),
    arms: slot(1, tier("tentacle nubs", "noodle")), legs: slot(1, tier("tentacles puddle", "ribbons many feet boots@drop")), tail: none, back: slot(0.3, tier("shell-snail")), cheeks: slot(0.4, tier("blush")),
    pattern: slot(0.45, tier("spots specks belly", "stripes")), marks: none,
  },
  {
    // a floating dome with a scalloped hem, pale and cool
    id: "fantasma", weight: 0.7, bodies: weights("dome:1"),
    families: { claros: 6, frescos: 2, pasteles: 1 },
    top: slot(0.1, tier("", "sprout-single", "halo")), nose: none, mouth: slot(1, tier("smile tiny tongue wavy")),
    arms: slot(0.85, tier("nubs")), legs: slot(1, tier("hem", "wisp")), tail: none, back: none, cheeks: slot(0.6, tier("blush")),
    pattern: slot(0.15, tier("frost specks")), marks: none,
    subs: {
      fantasmita: { weight: 3 },
      nubecita: { weight: 1.2, bodies: weights("wide:1"), families: { claros: 5, frescos: 3, pasteles: 2 }, top: slot(1, tier("cloud-puffs")), legs: none, arms: slot(1, tier("nubs")), pattern: none },
      kodama: { weight: 1.2, bodies: weights("tall:1"), families: { claros: 4, tierra: 2, frescos: 2 }, top: none, mouth: slot(1, tier("tiny smile")), arms: slot(1, tier("nubs")), legs: slot(1, tier("feet")), pattern: none },
    },
  },
  {
    // always one clear food piece (icing, wrapper, crust, sprinkles, caramel, pleats, calyx, nori, eggshell)
    id: "dulce", weight: 1, bodies: weights("pill:3 round:2 drop:1 box:1 tri:1 wide:1 blob:1"),
    families: { calidos: 4, tierra: 3, neutros: 3, pasteles: 3, claros: 1 },
    sets: {
      pill: [["caramel", null, 3], ["caramel-cherry", null, 2], ["frosting", "wrapper", 3], ["frosting", "sprinkles", 1]],
      round: [["calyx", "seeds", 3], ["cherry", null, 1]],
      drop: [["eggshell", "crack", 2], ["eggshell", null, 1]],
      box: [["butter", "crust", 1]],
      tri: [[null, "nori", 1]],
      wide: [["pleats", null, 1]],
      blob: [["cherry", null, 1]],
    },
    top: none, nose: none, mouth: slot(1, tier("smile tiny grin", "gap tongue cat wavy")), arms: slot(1, tier("nubs", "mitts")), legs: slot(1, tier("feet", "boots")), tail: none, back: none,
    cheeks: slot(0.5, tier("blush", "freckles")), pattern: none, marks: none,
  },
  {
    id: "planta", weight: 1, bodies: weights("drop:2 pill:2 round:2 tall:2 pear:1 blob:1 wide:1"),
    families: { frescos: 4, tierra: 2, pasteles: 2, calidos: 1, joya: 1 },
    top: slot(1, tier("sprout sprout-single sprout-bud sprout-seedling leafy-tuft clover tulip cactus-flower cap-mushroom", "sprout-vine stem-curl calyx cap-acorn", "sprout-flower clover-four")),
    nose: slot(0.15, tier("", "bulb")), mouth: slot(1, tier("smile tiny grin gap")), arms: slot(1, tier("leaf nubs", "cactus")), legs: slot(1, tier("root feet", "boots")), tail: none,
    back: slot(0.1, tier("", "wings-butterfly")), cheeks: slot(0.5, tier("blush")), pattern: slot(0.4, tier("spots seeds belly patch", "prickles ribs")), marks: none,
  },
  {
    id: "robot", weight: 1.2, robot: true, bodies: weights("box:3 can:3 tv:2 stack:3 orb:1 domehead:2 wide:1 dome:1"),
    families: { frescos: 2, neutros: 2, claros: 3, calidos: 2, joya: 2, tierra: 1, pasteles: 1 },
    top: slot(0.95, tier(
      "antenna@box|can|tv|orb|stack|domehead coil@box|can|stack beacon@box|can|stack|dome|domehead dials@box|stack bolt@box|can propeller@can|orb|domehead|dome",
      "rabbit-ears@box|tv chimney@box|stack|wide dish@tv|orb|dome|domehead antennae-bobble@domehead spikes@domehead ears@domehead")),
    nose: none, mouth: slot(1, tier("smile tiny grin stitch grill wavy led-bar led-smile led")),
    arms: slot(1, tier("bot")),
    legs: slot(1, tier("wheels@box|can|stack|wide|domehead treads@box|can|stack|wide|domehead stick@box|can|tv|domehead", "springs@box|can|tv|stack|domehead hover@orb|dome feet@box|can|tv|stack|domehead|wide", "wheel@orb")),
    tail: none, back: slot(0.1, tier("", "jetpack backpack")), cheeks: none, pattern: slot(0.6, tier("panel rivets grooves", "facets specks")), marks: none,
  },
  {
    id: "monstruo", weight: 1.4, bodies: weights("blob:3 round:2 wide:1 pear:1 drop:1 dome:1 tri:0.6"),
    families: { joya: 3, calidos: 2, frescos: 2, tierra: 1, pasteles: 2 },
    top: slot(0.95, tier("horns horns-nub spikes bone-horns", "horn-uni horns-ram antlers bone-through horn-beetle antenna ears mohawk bone-clip", "mane-uni")),
    nose: slot(0.2, tier("", "nostrils bulb")), mouth: slot(1, tier("fangs teeth gap tongue grin", "saw tusks fang-single smirk")),
    arms: slot(1, tier("nubs", "paws claws noodle")), legs: slot(1, tier("feet@!dome boots@!dome tentacles@dome", "paws@!dome many@!dome ribbons@dome")), tail: slot(0.6, tier("devil dino lizard", "dragon ringed stinger", "bolt-tail")),
    back: slot(0.3, tier("spines", "plates wings-bat quills fuzz")), cheeks: slot(0.15, tier("blush")),
    pattern: slot(0.45, tier("spots stripes scales belly", "patch lava-cracks ribcage")), marks: slot(0.15, tier("mask face-stripes", "eyepatch")),
    subs: {
      "monstruo-cuernos": { weight: 4 },
      dragoncito: {
        weight: 1, bodies: weights("round:3 wide:1"), families: { joya: 3, frescos: 3, calidos: 3, tierra: 1 }, top: slot(1, tier("horns-nub", "spikes")), nose: slot(0.5, tier("nostrils")),
        mouth: slot(1, tier("smile grin tongue", "fangs teeth")), arms: slot(1, tier("nubs")), legs: slot(1, tier("feet")), tail: slot(1, tier("dragon")), back: slot(1, tier("wings-bat")), pattern: slot(0.5, tier("belly", "scales")), marks: none,
      },
    },
  },
  {
    id: "marino", weight: 0.9, bodies: weights("wide:3 round:2 blob:1 pear:1"),
    families: { frescos: 4, calidos: 3, joya: 2, tierra: 2, pasteles: 2 },
    top: slot(0.8, tier("eyestalks", "spout gills")), nose: none, mouth: slot(1, tier("smile gap pout buck", "fangs grin")),
    arms: slot(1, tier("claws flipper", "fins")), legs: slot(1, tier("many webbed", "feet stick")), tail: slot(0.4, tier("fluke curl", "lizard fishtail")), back: slot(0.4, tier("shell-turtle", "fin-dorsal")), cheeks: slot(0.3, tier("blush")),
    pattern: slot(0.55, tier("spots scales bands segments", "stripes belly")), marks: none,
    subs: {
      cangrejo: {
        weight: 1.5, bodies: weights("wide:3 round:1"), families: { calidos: 5, joya: 2, tierra: 2, pasteles: 1 }, top: slot(1, tier("eyestalks")), arms: slot(1, tier("claws")), legs: slot(1, tier("feet many")), tail: none,
        back: none, mouth: slot(1, tier("smile gap pout", "grin")), pattern: slot(0.4, tier("spots", "bands")),
      },
      tortuga: {
        weight: 1.5, bodies: weights("wide:3 round:1"), families: { frescos: 4, tierra: 3, pasteles: 1, calidos: 1 }, top: slot(0.15, tier("", "spout")), arms: slot(1, tier("flipper nubs")), legs: slot(1, tier("feet")), tail: slot(0.3, tier("curl", "lizard")),
        back: slot(1, tier("shell-turtle")), pattern: slot(0.4, tier("belly", "spots")),
      },
      foca: {
        weight: 1.2, bodies: weights("pear:3 round:1"), families: { claros: 3, neutros: 3, frescos: 2, tierra: 2 }, top: none, nose: slot(1, tier("button")), arms: slot(1, tier("flipper")), legs: slot(0.3, tier("feet")), tail: slot(0.3, tier("fluke")),
        back: none, mouth: slot(1, tier("smile tiny cat", "buck")), pattern: slot(0.6, tier("belly", "spots")), marks: slot(0.9, tier("whiskers")),
      },
    },
  },
  {
    id: "elemental", weight: 1.5, bodies: weights("round:1"), families: {},
    top: none, nose: none, mouth: slot(1, tier("smile tiny")), arms: slot(1, tier("nubs")), legs: slot(1, tier("feet")), tail: none, back: none, cheeks: slot(0.5, tier("blush")), pattern: none, marks: none,
    subs: {
      fuego: {
        weight: 1.2, element: [{ hue: [14, 40], sat: [86, 95], light: [55, 61] }], bodies: weights("drop:3 round:2 blob:1 pill:1"),
        top: slot(1, tier("flame", "spikes horns-nub")), mouth: slot(1, tier("smile grin tongue", "tiny fangs")), arms: slot(1, tier("nubs", "noodle")),
        legs: slot(1, tier("feet", "wisp@drop|round|dome")), tail: slot(0.45, tier("ember-tail", "devil", "dragon")), pattern: slot(0.2, tier("specks")),
      },
      agua: {
        weight: 1.2, element: [{ weight: 3, hue: [190, 215], sat: [62, 78], light: [58, 66] }, { weight: 1, hue: [170, 185], sat: [50, 64], light: [52, 60] }], bodies: weights("round:3 blob:2 drop:2 dome:1 pill:1"),
        top: slot(1, tier("wave", "spout drip fin-crown")), mouth: slot(1, tier("smile tongue wavy", "tiny pout")), arms: slot(1, tier("nubs", "fins tentacle")),
        legs: slot(1, tier("puddle feet", "tentacles@dome|drop|round wisp@drop|round|dome")), tail: slot(0.3, tier("fluke", "fishtail curl")), pattern: slot(0.25, tier("spots specks")),
      },
      roca: {
        weight: 1, element: [{ weight: 2, hue: [20, 45], sat: [10, 22], light: [52, 62] }, { weight: 1, hue: [215, 260], sat: [8, 16], light: [54, 62] }], bodies: weights("wide:3 blob:2 box:1 pill:1 round:1 pear:1"),
        top: slot(1, tier("rock-crown", "horns-nub spikes")), mouth: slot(1, tier("smile grin gap teeth", "stitch tusks saw")), arms: slot(1, tier("nubs", "claws noodle")),
        legs: slot(1, tier("feet", "boots many")), tail: slot(0.2, tier("dino", "ringed")), back: slot(0.15, tier("", "spines", "plates")), pattern: slot(0.9, tier("specks", "grooves facets spots")),
      },
      cristal: {
        weight: 1, element: [{ hue: { pick: [180, 200, 270, 290, 320] }, sat: [40, 58], light: [70, 80] }], bodies: weights("round:2 tri:2 pear:1 tall:1 drop:1"),
        top: slot(1, tier("crystals", "star spikes")), mouth: slot(1, tier("smile tiny grin")), arms: slot(1, tier("nubs", "mitts")),
        legs: slot(1, tier("feet", "boots")), tail: slot(0.2, tier("", "spiral")), pattern: slot(0.9, tier("facets", "specks frost")),
      },
      aire: {
        weight: 1, element: [{ hue: [170, 210], sat: [30, 50], light: [80, 88] }], bodies: weights("round:3 drop:2 dome:1 wide:1"),
        top: slot(1, tier("swirl", "cloud-puffs feather-curl antennae-feather")), mouth: slot(1, tier("smile wavy tiny")), arms: slot(1, tier("nubs", "wing noodle")),
        legs: slot(1, tier("tornado@round|drop|dome|tall cloud-base", "wisp@round|drop|dome feet")), tail: slot(0.3, tier("spiral feathers", "puff")), back: slot(0.1, tier("", "wings-butterfly")),
        pattern: slot(0.15, tier("frost")),
      },
      chispa: {
        weight: 1, element: [{ weight: 3, hue: [48, 56], sat: [88, 96], light: [60, 66] }, { weight: 1, hue: [250, 275], sat: [45, 60], light: [54, 62] }], bodies: weights("round:2 blob:2 pear:1 drop:1 pill:1 tall:1"),
        top: slot(1, tier("lightning", "bolt spikes")), mouth: slot(1, tier("grin smile tongue", "fangs tiny")), arms: slot(1, tier("nubs", "noodle")),
        legs: slot(1, tier("feet", "cloud-base wisp@round|drop|dome")), tail: slot(0.6, tier("bolt-tail", "ember-tail")), pattern: slot(0.1, tier("specks")),
      },
      hielo: {
        weight: 1, element: [{ hue: [190, 215], sat: [40, 60], light: [76, 84] }], bodies: weights("round:3 drop:2 tall:1 pear:1 tri:1"),
        top: slot(1, tier("ice-shards", "crystals cloud-puffs tuft")), mouth: slot(1, tier("smile tiny", "tongue grin")), arms: slot(1, tier("nubs", "mitts")),
        legs: slot(1, tier("feet", "boots")), tail: slot(0.25, tier("puff", "curl")), pattern: slot(0.9, tier("frost", "specks facets")),
      },
      hoja: {
        weight: 0.8, element: [{ weight: 3, hue: [90, 140], sat: [38, 55], light: [62, 72] }, { weight: 1, hue: [20, 40], sat: [60, 75], light: [56, 64] }], bodies: weights("drop:3 dome:2 round:1 tall:1"),
        top: slot(1, tier("leaf-flame", "sprout sprout-seedling leafy-tuft clover", "tulip")), mouth: slot(1, tier("smile tiny", "grin")), arms: slot(1, tier("nubs leaf")),
        legs: slot(1, tier("wisp@drop|round|dome feet", "root")), tail: slot(0.2, tier("", "curl spiral")), back: slot(0.1, tier("", "wings-butterfly")), pattern: slot(0.2, tier("spots seeds")),
      },
      magma: {
        weight: 1, element: [{ hue: [0, 25], sat: [14, 30], light: [44, 52] }], bodies: weights("blob:2 round:2 wide:1 pear:1 pill:1"),
        top: slot(1, tier("crater", "horns-nub spikes")), mouth: slot(1, tier("grin fangs smile saw", "teeth gap")), arms: slot(1, tier("nubs", "claws")),
        legs: slot(1, tier("feet", "boots")), tail: slot(0.3, tier("devil", "dragon ember-tail")), back: slot(0.15, tier("", "spines")), pattern: slot(1, tier("lava-cracks", "specks")),
      },
      estrella: {
        weight: 1, element: [{ hue: [42, 52], sat: [80, 92], light: [64, 72] }], bodies: weights("round:3 drop:1 tri:1 pear:1"),
        top: slot(1, tier("star", "spikes", "halo")), mouth: slot(1, tier("smile grin tiny", "tongue")), arms: slot(1, tier("nubs", "wing")),
        legs: slot(1, tier("feet", "cloud-base")), tail: slot(0.35, tier("glow", "bolt-tail")), pattern: none, marks: slot(0.3, tier("forehead-star")),
      },
      hollin: {
        weight: 0.8, element: [{ hue: [240, 290], sat: [6, 14], light: [56, 64] }], bodies: weights("round:3 blob:1 pear:1"),
        top: slot(0.4, tier("", "tuft spikes")), mouth: slot(1, tier("smile tiny wavy")), arms: slot(1, tier("nubs", "noodle paws")), legs: slot(1, tier("feet", "stick")), tail: slot(0.25, tier("puff")),
        back: slot(1, tier("fuzz")), pattern: none,
      },
    },
  },
];

/** Every archetype as the kinds the sampler picks between: one per sub-type, else the archetype itself. */
export const KINDS: readonly (Kind & { archetypeWeight: number })[] = ARCHETYPES.flatMap((a) => {
  const { subs, id, ...own } = a;
  const subTotal = Object.values(subs ?? {}).reduce((t, s) => t + s.weight, 0);
  if (!subs) return [{ ...own, id, archetype: id, archetypeWeight: a.weight }];
  return Object.entries(subs).map(([sub, def]) => {
    const { weight, ...fields } = def;
    return { ...own, ...fields, id: `${id}/${sub}`, archetype: id, sub, weight: (a.weight * weight) / subTotal, archetypeWeight: a.weight };
  });
});

/** What is not per archetype. */
export const POLICY = {
  noiseMax: 7,
  protrusionsMax: 2,
  accessoriesMax: 2,
  /** Never generated, whatever an archetype lists (the catalogue keeps them for an editor): eyes that read as asleep or
   * empty, three or four eyes, the pins, the cheek pouches. */
  excluded: ["eyes:hollow", "eyes:sleepy", "eyes:three", "eyes:four", "pins:pins", "cheeks:pouches"],
  /** LED dots and pills as the eyes of an organic creature. */
  organicLed: { chance: 0.025, eyes: ["led-dot", "led-pill"] },
  /** Eyes and mouths that are a robot's screen. */
  screen: { eyes: ["led-square", "led-heart", "visor", "lens"], mouths: ["led-bar", "led-smile"], lensBody: "orb" },
  /** A mouth that needs a screen face: robot with an LED/visor face. */
  ledFace: ["led-dot", "led-pill", "led-square", "led-heart", "visor"],
  /** Eyewear that goes with two eyes; a one-eyed creature takes the monocle (favoured) only. */
  glasses: ["glasses", "sunglasses", "goggles", "star-glasses", "visor-glass"],
  /** Chance an eyewear roll is the moustache instead, and that a rare accessory is let through. */
  moustache: 0.06,
  rareAccessory: 0.15,
  monocleOnCyclops: 0.45,
  /** Accessories: none 30%, one 50%, two 20%. */
  accessories: [0.3, 0.5, 0.2],
  /** The legendary gold palette: one in 200. */
  shinyOdds: 1 / 200,
  /** Tries before a creature falls back to its archetype's safe core. */
  attempts: 8,
} as const;
