import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { CloseIcon } from "../../components/ui/Icons";
import { actionableAgent } from "../../services/host-agents";
import { useRoomStore } from "../../state/room-store";
import { useOnboardingIfAny } from "../onboarding/onboarding-context";
import { translator } from "../../i18n/translator";
import { useWhatsNew } from "../whats-new/WhatsNew";
import { useThisComputerSection } from "../../state/this-computer";
import "./highlights.css";

/* What is new to this person, marked where it is, one way across the app: how many on the Settings gear, a mark on the
 * section (and the machine) it is under, and "New" on the thing itself. Which mark a section and a machine wear is
 * VARIANTS `section-new`: "New" at the entry's end, the thing's own pill (A); how many at its end, the gear's own count
 * (B); a dot on its icon, in Settings only (C). The gear is never a dot, which beside the conversations' avatars would
 * read as a state; and no mark is on a machine's state line. It is information, never a warning: the accent, not
 * amber — what needs an action (a model to download, a key missing) keeps its own attention style and clears only
 * when resolved. Seeing the thing clears it (half of it in view for a second), and the marks above it go once nothing
 * new is under them; it also goes on its own two weeks after it was first shown. At most three show at once, the rest
 * waiting their turn. Each "New" also has a × to clear it without looking, for as long as it shows. What was seen is
 * this device's. A setting is new only while it is on the page (Settings keeps every section rendered): one not there
 * (Language, before a transcription model is ready) shows no dot anywhere until it appears — nothing to hunt for.
 *
 * Today: agents a machine found and Sidevoice could connect, and the settings a release added (What's new). */

export interface Highlight {
  id: string;
  /** The Settings section it is under, and the machine (its pairing) within Machines. */
  section: string;
  machine?: string;
}

const KEY = "sidevoice.highlights";
const EXPIRES_MS = 14 * 24 * 60 * 60 * 1000;
const AT_ONCE = 3;

type Seen = Record<string, { shownAt: number; seenAt?: number }>;

/** This device's record of what was shown and seen, and who listens to it. */
const listeners = new Set<() => void>();
let cache: Seen | null = null;
function read(): Seen {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(KEY) || "{}") ?? {}; } catch { cache = {}; }
  return cache!;
}
function write(next: Seen) {
  cache = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* Kept for this load only. */ }
  for (const listener of [...listeners]) listener();
}
const subscribe = (listener: () => void) => { listeners.add(listener); return () => listeners.delete(listener); };

/** The "New" marks on the page now, by id (each NewMark says so while mounted, shown or not), and who listens. */
const present = new Map<string, number>();
let presentVersion = 0;
const presentListeners = new Set<() => void>();
const subscribePresent = (listener: () => void) => { presentListeners.add(listener); return () => presentListeners.delete(listener); };
const presentNow = () => presentVersion;
function announce(id: string) {
  present.set(id, (present.get(id) ?? 0) + 1);
  presentVersion++;
  for (const listener of [...presentListeners]) listener();
  return () => {
    const left = (present.get(id) ?? 1) - 1;
    if (left) present.set(id, left); else present.delete(id);
    presentVersion++;
    for (const listener of [...presentListeners]) listener();
  };
}

/** Everything new now, before the record says what was seen or is past its time. */
function useCandidates(): Highlight[] {
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const pairings = useRoomStore((state) => state.facts.pairings);
  const features = useWhatsNew().items;
  useSyncExternalStore(subscribePresent, presentNow, presentNow);
  const active = new Set(pairings.filter((pairing) => !pairing.revoked).map((pairing) => pairing.fp));
  // This computer's agents are its own section's when it has one.
  const ownComputer = useThisComputerSection();
  const localFp = useRoomStore((state) => state.machines.find((machine) => machine.local)?.pairingId ?? null);
  const agents = Object.entries(hostAgents).filter(([fp, listing]) => active.has(fp) && !!listing.value)
    .flatMap(([fp, listing]) => (listing.value?.agents ?? []).filter(actionableAgent).map((agent) => ({ id: `agent:${fp}:${agent.id}`, section: ownComputer && localFp === fp ? "this-computer" : "machines", machine: fp })));
  return [...agents, ...features.filter((feature) => present.has(`feature:${feature.id}`)).map((feature) => ({ id: `feature:${feature.id}`, section: feature.section }))];
}

/** Whether "new" shows at all: off for this release (no marks on the gear, sections or items, no What's new); the
 *  catalogue and the marks stay, dormant, to come back. */
export const HIGHLIGHTS_ON = false;

/** What shows as new now: not seen, not past its two weeks, at most three. Each is recorded as shown the first time. */
export function useHighlights() {
  const seen = useSyncExternalStore(subscribe, read, read);
  const candidates = useCandidates();
  const onboarding = useOnboardingIfAny();
  // Until the first-run setup is finished nothing is new — everything is, there — and what is there then is taken as
  // seen: only what appears after the setup is ever marked new. While the setup's record is not read yet, nothing shows
  // and nothing is taken as seen.
  const settingUp = !!onboarding && onboarding.ready && !onboarding.done;
  const unknown = !!onboarding && !onboarding.ready;
  const unseen = settingUp ? candidates.filter((item) => !seen[item.id]?.seenAt).map((item) => item.id).join(" ") : "";
  useEffect(() => {
    if (!unseen) return;
    const next = { ...read() };
    for (const id of unseen.split(" ")) next[id] = { shownAt: next[id]?.shownAt ?? Date.now(), seenAt: Date.now() };
    write(next);
  }, [unseen]);
  const now = Date.now();
  const items = !HIGHLIGHTS_ON || settingUp || unknown ? [] : candidates.filter((item) => !seen[item.id]?.seenAt && !(seen[item.id] && now - seen[item.id].shownAt > EXPIRES_MS)).slice(0, AT_ONCE);
  const fresh = items.filter((item) => !seen[item.id]).map((item) => item.id).join(" ");
  useEffect(() => {
    if (!fresh) return;
    const next = { ...read() };
    for (const id of fresh.split(" ")) next[id] = { shownAt: Date.now() };
    write(next);
  }, [fresh]);
  return items;
}

/** Marks `id` seen on this device. */
export function markSeen(id: string) {
  const current = read();
  write({ ...current, [id]: { shownAt: current[id]?.shownAt ?? Date.now(), seenAt: Date.now() } });
}


/** Where a section's or a machine's "new" dot sits: on the icon's top corner (dormant while HIGHLIGHTS_ON is off; the
 *  other places tried were its side, before the label and the entry's end). */
export type SectionNewDot = "corner" | "side" | "label" | "end";
export function useSectionNewDot(): SectionNewDot {
  return "corner";
}

/** An item's icon with, when something new is under it (`isNew`), its dot by the icon (corner, side, label); at the
 *  end, NewAtEnd draws it. The mark is never the only cue: the entry says it in words. */
export function NewOnIcon({ icon, isNew }: { icon: ReactNode; isNew: boolean | number }) {
  const place = useSectionNewDot();
  const here = !!isNew && place !== "end";
  return <span className="new-on-icon" data-dot={here ? place : undefined}>{icon}
    {here && <span className="new-on-icon-dot" aria-hidden="true" />}
  </span>;
}

/** An entry's end, when something new is under it: the dot where it sits at the end, and `spoken` (", new") for a
 *  screen reader — none where the entry's own name says it already. */
export function NewAtEnd({ isNew, spoken }: { isNew: boolean | number; spoken?: string }) {
  const place = useSectionNewDot();
  if (!isNew) return null;
  return <>{place === "end" && <span className="new-end-dot" aria-hidden="true" />}{spoken && <span className="sr-only">{spoken}</span>}</>;
}

/** The Settings gear's mark, with `count` things new under it: how many, on its corner — never a dot, which beside the
 *  conversations' avatars would read as a state. The gear's own name says it in words. */
export function GearNewMark({ count, attention = false }: { count: number; attention?: boolean }) {
  // Something needing the person outranks what is new: the warning dot in the count's place.
  if (attention) return <span className="settings-notice settings-attention" data-mark="attention" aria-hidden="true" />;
  if (count <= 0) return null;
  return <span className="settings-notice" data-mark="count" aria-hidden="true">{count}</span>;
}

/** The word "New" as the thing itself wears it. */
export function NewBadge() {
  const t = translator();
  return <Badge tone="accent" className="new-badge">{t("highlights.new")}</Badge>;
}

/** "New" on the thing itself. Seen (half of it in view for a second) it is cleared, but stays on screen until this view
 *  goes; its × clears it at once, while it shows. */
export function NewMark({ id }: { id: string }) {
  const t = translator();
  const items = useHighlights();
  const onboarding = useOnboardingIfAny();
  const isNew = items.some((item) => item.id === id);
  const [showing, setShowing] = useState(isNew);
  if (isNew && !showing) setShowing(true);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => announce(id), [id]);
  // Seen by looking, it stays in view until this view goes; cleared by its ×, it goes at once.
  const dismiss = () => { clear(); setShowing(false); };
  const clear = () => {
    markSeen(id);
    // A setting from What's new, seen here, is seen there too.
    if (id.startsWith("feature:")) void onboarding?.markFeatures([id.slice("feature:".length)], "seen");
  };
  useEffect(() => {
    const element = ref.current;
    if (!isNew || !element || typeof IntersectionObserver === "undefined") return;
    let timer = 0;
    const observer = new IntersectionObserver(([entry]) => {
      window.clearTimeout(timer);
      if (entry.isIntersecting && document.visibilityState === "visible") timer = window.setTimeout(clear, 1000);
    }, { threshold: 0.5 });
    observer.observe(element);
    return () => { observer.disconnect(); window.clearTimeout(timer); };
  }, [isNew, id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!showing) return null;
  return <span className="new-mark" ref={ref} data-highlight={id}>
    <NewBadge />
    {<button type="button" className="new-mark-dismiss" aria-label={t("highlights.dismiss")} title={t("highlights.dismiss")} onClick={dismiss}><CloseIcon size={12} /></button>}
  </span>;
}
