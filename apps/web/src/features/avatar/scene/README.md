# The stage's scene

What stands behind a conversation's creature on the stage, and the wanted poster that stands in for it while the room
cannot reach its agent. Both are ported from the frozen design reference
(`research/creature-void-design-2026-11-01/reference/2026-11-04/`: `src/backdrops.js`, and the poster of `src/creator.js`,
T12–T14), kept diffable line by line against it; decisions carry the same `T<n>` markers here as there. The reference's
`DESIGN.md` is the "why".

| file | what it holds |
|---|---|
| `backdrops.js` | the product's 17 backdrops redrawn in the toon line (flat grounds with a lit band, no ink, a soft vignette), light and dark; the seeded pick (`backdropFromSeed`: a quarter keep the tone tint); the frame that covers the tile and puts the scene's ground line (y 357 of 800 × 440) on the creature's feet; and what the offline poster hangs from on each (`hangOf`, the mounts) |
| `poster.js` | the wanted poster: its paper, photo, words and bounty (`posterArt`), where it goes (`posterPlace`: ×0.84 everywhere, clear of the agent's name; the room and the bookshelf place it in their scene) and how it is laid on the backdrop at a moment (`layPoster`: a tack, a nail, the scene's mount, or afloat on a tether in space; on the clouds the balloons bob and it sways) |
| `stage-paint.ts` | the stage's canvas: the backdrop the creature rolls (`backdropOf`, the creator's `backdropName`), drawn 960 px tall at the tile's shape as the creator draws it, and offline the poster on it, moving on its own only where the reference moves it and only where the page's drawings move |

`StageScene.tsx` (`StageBackdrop`) puts it on the stage: the conversation's creature picks the backdrop, the theme picks
its drawing, the creature host (`../creature/host.ts` `posterPortrait`) gives the poster its photo — the creature
laughing, rendered on its own — and the poster's words are the interface's (`stage.poster.*`). The backdrop's ground
line stands where the stage puts the creature's feet: `StageBackdrop`'s `feet`, a share of the tile's height (by default
the stage scene's ground line, where `CharacterAvatar` stands the creature).

## Checking it against the reference

`creature-lab.html` (dev server: `npm run dev -w @sidevoice/web`, then `/voice/creature-lab.html`) draws the scene behind
the creature, with the creator's hash keys: `backdrop=seed|<id>|none`, `dark=1`, `mode=offline` (the poster), `feet=<share>`
(the creator's `feetY` over its 960 px, to put the ground line where the reference's is), `w=`/`h=` (the tile). Given the
reference's tile shape and feet, the lab's scene canvas and the creator's `#bg` are the same pixels (the PR that brought
the scene over shows the comparison and how it was run). `mic=<state>` shows the microphone permission hero
(`../creature/mic-hero.ts`) on its own.
