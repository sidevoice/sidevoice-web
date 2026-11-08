import { ANCHORS, EMITTED, type Batch, type BodyDef, type PartDef, type SlotDef } from "./kit";

/* Every file in src/parts/ is found here, so a designer adds bodies and parts by adding a file and
 * never edits a shared one. Files load core-* first, then the rest in name order (b01-…, b02-…). Problems are logged
 * (console.error for what is skipped, console.warn for references to parts that may come from a later batch). */

const files = import.meta.glob<{ default?: Batch }>("../parts/*.ts", { eager: true });
const rank = (path: string) => (/\/core-[^/]*$/.test(path) ? 0 : 1);
const paths = Object.keys(files).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
const fileName = (path: string) => path.replace(/^.*\//, "").replace(/\.ts$/, "");

export interface Entry extends PartDef { key: string; file: string; seq: number }

export const SLOTS: SlotDef[] = [];
export const BODIES: BodyDef[] = [];
const slotMap = new Map<string, SlotDef>();
const bodyMap = new Map<string, BodyDef>();
const partMap = new Map<string, Entry>();
const bySlot = new Map<string, Entry[]>();
let css = "";

const pending: { file: string; part: PartDef }[] = [];
for (const path of paths) {
  const file = fileName(path), b = files[path].default;
  if (!b) { console.error(`[bichos] ${file}: no default export (use \`export default batch({...})\`)`); continue; }
  for (const s of b.slots ?? []) {
    if (slotMap.has(s.id)) console.error(`[bichos] ${file}: slot "${s.id}" already exists`);
    else if (s.id === "body") console.error(`[bichos] ${file}: "body" is not a slot name`);
    else { slotMap.set(s.id, s); SLOTS.push(s); }
  }
  for (const body of b.bodies ?? []) {
    if (bodyMap.has(body.id)) console.error(`[bichos] ${file}: body "${body.id}" already exists`);
    else { bodyMap.set(body.id, body); BODIES.push(body); }
  }
  for (const part of b.parts ?? []) pending.push({ file, part });
  if (b.css) css += `\n/* ${file} */\n${b.css}`;
}
SLOTS.sort((a, b) => a.order - b.order);

// Parts after slots, so a batch may fill a slot declared in a later file.
const anchors = new Set<string>([...ANCHORS, ...EMITTED]);
for (const { file, part } of pending) {
  const slot = slotMap.get(part.slot);
  if (!slot) { console.error(`[bichos] ${file}: part "${part.id}" uses unknown slot "${part.slot}"`); continue; }
  const key = `${part.slot}:${part.id}`;
  if (partMap.has(key)) { console.error(`[bichos] ${file}: part "${key}" already exists`); continue; }
  if (part.id === "none") { console.error(`[bichos] ${file}: "none" is reserved`); continue; }
  if (part.at && !anchors.has(part.at)) console.warn(`[bichos] ${file}: part "${key}" joins "${part.at}", not a standard anchor (fine if a part emits it)`);
  if (part.at && !part.socket) console.error(`[bichos] ${file}: part "${key}" has \`at\` but no \`socket\``);
  const entry: Entry = { ...part, key, file, seq: 0 };
  partMap.set(key, entry);
  bySlot.set(part.slot, [...(bySlot.get(part.slot) ?? []), entry]);
}
let seq = 0;
for (const s of SLOTS) for (const e of bySlot.get(s.id) ?? []) e.seq = seq++;

// References to unknown slots are errors; to unknown parts only warnings (a later batch may add them).
const checkRef = (where: string, ref: string) => {
  if (ref.startsWith("#")) return;
  const [slot, ids] = ref.split(":");
  if (slot !== "body" && !slotMap.has(slot)) { console.error(`[bichos] ${where}: ref "${ref}" names unknown slot "${slot}"`); return; }
  if (!ids || ids === "*") return;
  for (const id of ids.replace(/^!/, "").split("|")) if (slot === "body" ? !bodyMap.has(id) : !partMap.has(`${slot}:${id}`)) console.warn(`[bichos] ${where}: ref "${ref}": "${slot}:${id}" does not exist (yet)`);
};
for (const e of partMap.values()) for (const ref of [...(e.requires ?? []), ...(e.excludes ?? []), ...(e.hides ?? [])]) checkRef(`${e.file} ${e.key}`, ref);
for (const b of BODIES) for (const ref of [...(b.requires ?? []), ...(b.excludes ?? []), ...(b.hides ?? [])]) checkRef(`body ${b.id}`, ref);

export const CSS = css;
export const slotOf = (id: string) => slotMap.get(id);
export const bodyOf = (id: string) => bodyMap.get(id);
export const partOf = (slot: string, id: string) => partMap.get(`${slot}:${id}`);
export const partsIn = (slot: string) => bySlot.get(slot) ?? [];

/** Anything a ref can match: a part entry or a body. */
export interface Matchable { slot: string; id: string; tags?: string[] }
export const asMatchable = (b: BodyDef): Matchable => ({ slot: "body", id: b.id, tags: b.tags });

/** Does "slot:id", "slot:a|b", "slot", "slot:*", "slot:!a|b" (anything in the slot but those), "#tag" or "body:id"
 * match this part (or body)? */
export function matches(ref: string, x: Matchable): boolean {
  if (ref.startsWith("#")) return x.tags?.includes(ref.slice(1)) ?? false;
  const [slot, ids] = ref.split(":");
  if (slot !== x.slot) return false;
  if (!ids || ids === "*") return true;
  return ids.startsWith("!") ? !ids.slice(1).split("|").includes(x.id) : ids.split("|").includes(x.id);
}

type Rules = { excludes?: string[]; requires?: string[]; hides?: string[] };
/** Two parts (or a part and a body) can't coexist if either excludes the other. */
export function conflict(a: Matchable & Rules, b: Matchable & Rules): boolean {
  if (a.slot === b.slot && a.id === b.id) return false;
  return (a.excludes ?? []).some((r) => matches(r, b)) || (b.excludes ?? []).some((r) => matches(r, a));
}
/** Does `a` hide `b`? */
export const hides = (a: Rules & Matchable, b: Matchable) => !(a.slot === b.slot && a.id === b.id) && (a.hides ?? []).some((r) => matches(r, b));
