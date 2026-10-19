import { hsl } from "../core";
import { SWATCHES, type BodyDef, type Spec, type SpecInput } from "./kit";
import { BODIES, SLOTS, asMatchable, bodyOf, conflict, matches, partOf, partsIn, slotOf, type Entry, type Matchable } from "./registry";

/* The spec: a body, one part id per single slot, a list per multi slot, a colour and a shape seed. */


const num = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
const ids = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === "string" ? [v] : []).filter((x): x is string => typeof x === "string" && x !== "" && x !== "none");

export function normalizeSpec(input: SpecInput, keep?: string): Spec {
  const raw = (input ?? {}) as Record<string, unknown>;
  const parts: Record<string, string | string[]> = {};
  const put = (slot: string, list: string[]) => {
    const def = slotOf(slot);
    if (!def || !list.length) return;
    if (def.multi) parts[slot] = [...new Set([...ids(parts[slot]), ...list])];
    else parts[slot] = list[list.length - 1];
  };
  if (raw.parts && typeof raw.parts === "object") {
    for (const [slot, v] of Object.entries(raw.parts as Record<string, unknown>)) put(slot, ids(v));
  }
  const c = (raw.color ?? raw) as Record<string, unknown>;
  const spec: Spec = {
    body: typeof raw.body === "string" && bodyOf(raw.body) ? raw.body : BODIES[0]?.id ?? "blob",
    parts,
    color: { hue: num(c.hue, 38), sat: num(c.sat, 73), light: num(c.light, 56), spot: num(c.spot, 160) },
    shape: typeof raw.shape === "string" ? raw.shape : "bicho",
    name: typeof raw.name === "string" ? raw.name : "bicho",
    ...(raw.shiny ? { shiny: true } : {}),
  };
  return resolve(spec, keep);
}

export const idsIn = (spec: Spec, slot: string) => ids(spec.parts[slot]);

/** The known parts a spec holds, in evaluation order. */
export function present(spec: Spec): Entry[] {
  const out: Entry[] = [];
  for (const s of SLOTS) for (const id of idsIn(spec, s.id)) { const e = partOf(s.id, id); if (e) out.push(e); }
  return out.sort((a, b) => a.seq - b.seq);
}

const bodyM = (spec: Spec): (Matchable & BodyDef) | undefined => { const b = bodyOf(spec.body); return b && { ...b, ...asMatchable(b) }; };
const satisfied = (ref: string, list: Matchable[]) => list.some((x) => matches(ref, x));
/** All of a part's `requires` hold (a ref may name the body). */
const meets = (e: Entry, list: Matchable[]) => (e.requires ?? []).every((ref) => satisfied(ref, list));

function setIds(spec: Spec, slot: string, list: string[]) {
  const def = slotOf(slot);
  if (!list.length) delete spec.parts[slot];
  else spec.parts[slot] = def?.multi ? list : list[0];
}

/** Makes a spec coherent: the body wins, then the part named `keep` (the editor's last click), then earlier slots;
 * parts whose requires fail are dropped; required slots get their first compatible part. Unknown ids are kept. */
export function resolve(input: Spec, keep?: string): Spec {
  const spec: Spec = { ...input, parts: { ...input.parts } };
  const body = bodyM(spec);
  const all = present(spec);
  const order = keep ? [...all.filter((e) => e.key === keep), ...all.filter((e) => e.key !== keep)] : all;
  let kept: Entry[] = [];
  for (const e of order) {
    if (body && conflict(e, body)) continue;
    if (kept.some((k) => conflict(e, k))) continue;
    const max = slotOf(e.slot)?.max;
    if (max && kept.filter((k) => k.slot === e.slot).length >= max) continue;
    kept.push(e);
  }
  for (let changed = true; changed;) {
    const list: Matchable[] = [...kept, ...(body ? [body] : [])];
    const next = kept.filter((e) => meets(e, list));
    changed = next.length !== kept.length;
    kept = next;
  }
  for (const s of SLOTS) {
    const unknown = idsIn(spec, s.id).filter((id) => !partOf(s.id, id));
    setIds(spec, s.id, [...kept.filter((e) => e.slot === s.id).sort((a, b) => a.seq - b.seq).map((e) => e.id), ...unknown]);
  }
  for (const s of SLOTS) {
    if (!s.required || idsIn(spec, s.id).length) continue;
    const list: Matchable[] = [...kept, ...(body ? [body] : [])];
    const fill = partsIn(s.id).find((e) => !list.some((k) => conflict(e, k)) && meets(e, list));
    if (fill) { setIds(spec, s.id, [fill.id]); kept.push(fill); }
  }
  return spec;
}

/** The editor's click: the chosen part wins over whatever it conflicts with, and a required part is brought in. */
export function withPart(spec: Spec, slot: string, id: string | null): Spec {
  const def = slotOf(slot);
  if (!def) return spec;
  const next: Spec = { ...spec, parts: { ...spec.parts } };
  const current = idsIn(spec, slot);
  if (id === null) { setIds(next, slot, []); return resolve(next); }
  if (def.multi && current.includes(id)) { setIds(next, slot, current.filter((x) => x !== id)); return resolve(next); }
  const e = partOf(slot, id);
  if (!e) return spec;
  let list = def.multi ? [...current, id] : [id];
  if (def.max && list.length > def.max) list = list.slice(list.length - def.max);
  setIds(next, slot, list);
  for (const other of present(next)) if (other.key !== e.key && conflict(e, other)) setIds(next, other.slot, idsIn(next, other.slot).filter((x) => x !== other.id));
  for (const ref of e.requires ?? []) {
    const have: Matchable[] = [...present(next), ...(bodyM(next) ? [bodyM(next)!] : [])];
    if (satisfied(ref, have)) continue;
    const [rslot] = ref.startsWith("#") ? [undefined] : ref.split(":");
    const candidates = (rslot ? partsIn(rslot) : SLOTS.flatMap((s) => partsIn(s.id))).filter((c) => matches(ref, c) && !have.some((h) => conflict(c, h)));
    if (!candidates.length) return spec;
    const pick = candidates[0];
    setIds(next, pick.slot, slotOf(pick.slot)?.multi ? [...idsIn(next, pick.slot), pick.id] : [pick.id]);
  }
  return resolve(next, e.key);
}

export const withBody = (spec: Spec, id: string): Spec => resolve({ ...spec, body: id });

/** Can this part be worn right now (after the editor's conflict handling)? */
export const available = (spec: Spec, slot: string, id: string) => idsIn(withPart(spec, slot, id), slot).includes(id) || idsIn(spec, slot).includes(id);

/* ---------- colour and traits ---------- */

export interface Colors { body: string; belly: string; dark: string; spot: string }

export function colorsOf(spec: Spec): Colors {
  const { hue: h, sat: s, light: l } = spec.shiny ? { hue: 45, sat: 88, light: 58 } : spec.color;
  return { body: hsl(h, s, l), belly: hsl(h, Math.max(20, s - 15), Math.min(94, l + 20)), dark: hsl(h, Math.max(0, s - 10), Math.max(12, l - 22)), spot: hsl((spec.color.hue + spec.color.spot) % 360, 80, 68) };
}

export function traitsOf(spec: Spec) {
  const { hue, sat, light } = spec.color;
  const swatch = SWATCHES.find(([, h, s, l]) => h === hue && s === sat && l === light);
  const parts = present(spec);
  const gear = parts.filter((e) => slotOf(e.slot)?.trait).map((e) => e.label);
  return [spec.name, swatch?.[0], ...gear, parts.some((e) => e.rarity === "rare") && "raro", spec.shiny && "brillante"].filter(Boolean).join(" · ");
}
