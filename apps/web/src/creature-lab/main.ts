import "../styles/tokens.css";
import { CHOICE_KEYS, creatureFromSeed, type CreatureChoice } from "../features/avatar/creature/catalogue";
import { ATTENTION_EXPR, drawFace, mountCreature, STILL_EXPR, type Framing, type LiveCreature } from "../features/avatar/creature/host";
import type { AvatarMood } from "../features/avatar/avatar-spec";

/* The creature lab (creature-lab.html, served by the dev server only): one conversation's creature as the product draws
 * it (features/avatar/creature/host.ts), on its own, for review and for the pixel comparison against the design
 * reference's creator. Everything is in the URL hash, as the creator keeps it:
 *
 *   seed=<thread id>                 the creature a conversation rolls; or the creator's own keys, for any creature:
 *   body= color= accent= iris= eyes= ears= head= face= eyewear=   (labels, as the creator's hash spells them)
 *   mode=idle|listening|speaking|working|present|offline         the state (default idle)
 *   still=1                          held still in its key pose (as under reduced motion); default: moving
 *   w= h=                            the tile's size in CSS px (default 900 × 600, the desktop's 3:2)
 *   zoom= lookY=                     an exact camera (the creator's item.opts); default: the stage's scene framing
 *
 * Under the tile: the still faces (the transcript's, the sidebar's) in every state. A developer page, not the product:
 * its few words are not translated. */

const MOODS: AvatarMood[] = ["idle", "listening", "speaking", "working", "present", "offline"];

function readHash(): Record<string, string> {
  const o: Record<string, string> = {};
  for (const kv of location.hash.slice(1).split("&")) { const [k, v] = kv.split("="); if (k && v != null) o[k] = decodeURIComponent(v); }
  return o;
}

const root = document.getElementById("lab")!;
const css = document.createElement("style");
css.textContent = `
  body { margin: 0; background: #f4f1ec; font: 13px/1.4 "DM Sans", system-ui, sans-serif; color: #1b1d24; }
  #lab { display: grid; gap: 14px; padding: 14px; justify-items: start; }
  .tile { position: relative; background: #fbf9f6; overflow: hidden; }
  .tile canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .faces { display: flex; gap: 12px; flex-wrap: wrap; }
  .face { display: grid; justify-items: center; gap: 4px; }
  .face canvas { width: 72px; height: 72px; }
  .face[data-offline] canvas { filter: grayscale(1); opacity: .55; }
  pre { margin: 0; font: 12px/1.4 ui-monospace, monospace; white-space: pre-wrap; }`;
document.head.appendChild(css);

let live: LiveCreature | null = null;
function render() {
  live?.dispose(); live = null;
  root.textContent = "";
  const h = readHash();
  const seed = h.seed ?? "creature-lab";
  const rolled = creatureFromSeed(seed);
  const choice: CreatureChoice = { ...rolled };
  let byHand = false;
  for (const k of CHOICE_KEYS) if (h[k] != null) { choice[k] = h[k]; byHand = true; }
  const mood = (MOODS as string[]).includes(h.mode) ? (h.mode as AvatarMood) : "idle";
  const w = Number(h.w) || 900, ht = Number(h.h) || 600;
  const tile = document.createElement("div");
  tile.className = "tile stage-tile";
  tile.style.width = w + "px"; tile.style.height = ht + "px";
  const canvas = document.createElement("canvas");
  tile.appendChild(canvas);
  root.appendChild(tile);
  const framing: Framing | undefined = h.zoom != null && h.lookY != null ? { zoom: Number(h.zoom), lookY: Number(h.lookY) } : undefined;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  live = mountCreature({ seed, choice: byHand ? choice : undefined, canvas, framing: "scene", scene: framing, mood, moving: !(h.still === "1" || reduced), gazeFrom: tile });
  const faces = document.createElement("div");
  faces.className = "faces";
  for (const m of [...MOODS, "unread"] as const) {
    const face = document.createElement("div");
    face.className = "face";
    if (m === "offline") face.dataset.offline = "";
    const c = document.createElement("canvas");
    face.append(c, m);
    faces.appendChild(face);
    // A hand-picked creature has no seed of its own: its faces are keyed by its choice.
    drawFace(c, byHand ? JSON.stringify(choice) : seed, m === "unread" ? ATTENTION_EXPR : STILL_EXPR[m], byHand ? choice : undefined);
  }
  root.appendChild(faces);
  const about = document.createElement("pre");
  const link = "#" + CHOICE_KEYS.map((k) => `${k}=${encodeURIComponent(choice[k])}`).join("&") + `&mode=${mood}`;
  about.textContent = `${byHand ? "by hand" : `seed ${seed}`}\n${JSON.stringify(choice)}\ncreator hash: ${link}`;
  root.appendChild(about);
  (window as unknown as { __lab: unknown }).__lab = { canvas, live, choice, mood, ready: true };
}
addEventListener("hashchange", render);
render();
