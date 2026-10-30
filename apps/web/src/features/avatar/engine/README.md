# The bichos engine

The drawing and animation code behind every avatar: a conversation's identity rolls a bicho (an archetype, a body, parts, a palette),
and the engine draws it as SVG at a size. It is ordinary source of this app, edited and reviewed here like the rest
of `features/avatar/`. It began as a proof of concept in a separate scratch project (the "avatar lab"); nothing is
synced from there any more.

The app talks to the engine only through `features/avatar/` (`bicho-draw.ts`, `CharacterAvatar.tsx`,
`StageScene.tsx`, `engine-stylesheet.ts`).

## Layout

| path | what it holds |
|---|---|
| `core.ts` | the random streams (SHA-256 of the versioned identity and decision into PCG32), the `Size`/`Mood` types, small drawing helpers, `uid` for per-drawing ids |
| `bichos/kit.ts` | the types and helpers a part file is written with (`batch`, `Spec`, colour swatches) |
| `bichos/registry.ts` | finds every part file under `parts/` and indexes slots, bodies and parts |
| `bichos/archetypes.ts` | the creatures a conversation can be: archetypes and their sub-types, each with its bodies, per-slot options by tier and colours; plus the policy (budgets, excluded parts, accessory rules). The only place that says what is likely |
| `bichos/generate.ts` | the generator: identity to spec (`specFromSeed`, `roll`), the validator (`problems`) and each archetype's safe core |
| `bichos/palette.ts` | the colour of a creature: base families, OKLCH schemes, and the share-out of base, secondary and accent over the parts (`Spec.tints`) |
| `bichos/spec.ts` | `normalizeSpec` and the rules that keep a spec coherent (what a part hides, what conflicts) |
| `bichos/rig.ts`, `bichos/render.ts` | a body's anchors and the renderer that lays the parts out as one SVG (`renderSpec`) |
| `bichos/work.ts`, `bichos/idle.ts` | the working styles and the idle pastimes: their cues, their CSS and which a figure can take |
| `parts/` | the parts, in batches (`b01-bodies.ts` … `b15-elementals.ts`) and the `core-*.ts` files the batches build on. A part says what it needs and what it excludes; it does not say who wears it |
| `styles/mascots.ts` | the Sidevoice mascot (its mark and the shade every figure uses) |
| `styles/bichos.ts` | the mascot frame and the shared CSS (moods, sizes, shared groups) |
| `backdrop.ts`, `desk.ts` | the stage scene's backdrops and the desk the agent works at |

## Changing it

- A drawing is deterministic: the same seed and size give the same markup, apart from the per-drawing id prefix
  (`bx<n>`, `bd<n>` from `uid`). `engine-render.test.ts` holds a sample of drawings to a committed snapshot, so a change
  that moves the markup shows up in review as a diff of `__snapshots__/engine-render.txt`. When the change is meant,
  run `npx vitest run -u src/features/avatar` from `apps/web` to accept it.
- The engine's CSS reaches the page as `src/styles/bichos.css`, built from `styles/bichos.ts` and `backdrop.ts` by
  `engine-stylesheet.ts`. `engine-css.test.ts` holds the file to that output; the same `-u` run rewrites it.
- An identity rolls its bicho from one random stream per decision, in a fixed order (archetype, body, face, structure,
  decoration, accessories, palette: `generate.ts`). Changing a table, a weight, the order or the generator's version
  (`GENERATOR_VERSION` in `core.ts`) moves every conversation's bicho: the pinned specs in `avatar-spec.test.ts` and the
  snapshot make that a decision in review. A new part joins an archetype by being listed in `archetypes.ts`; the tests
  hold the declarations to the catalogue (no unknown ids, a valid safe core on every body) and every roll to the budgets
  (noise ≤ 7, ≤ 2 protrusions, ≤ 2 accessories, one per zone).
- Colour is the palette's: a creature's tints are in `Spec.tints`, and a piece painted `body`, `belly` or `dark` takes
  its slot's tint. Fixed materials (a flower, a bucket) keep their own colour.
- No third-party mark belongs here (no other product's mascot or logo): `bicho-draw.test.ts` fails if one comes in.
