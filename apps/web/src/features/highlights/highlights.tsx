import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { Badge } from "../../components/ui/Badge";
import { CloseIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { actionableAgent } from "../../services/host-agents";
import { useRoomStore } from "../../state/room-store";
import { useOnboardingIfAny } from "../onboarding/onboarding-context";
import { hostTranslator } from "../settings/host-i18n";
import { useWhatsNew, useWhatsNewPlace } from "../whats-new/WhatsNew";
import "./highlights.css";

/* What is new to this person, marked where it is, one way across the app: a dot on the Settings gear, a dot on the
 * section (and the machine) it is under, and "New" on the thing itself. It is information, never a warning: the accent,
 * not amber — what needs an action (a model to download, a key missing) keeps its own attention style and clears only
 * when resolved. Seeing the thing clears it (half of it in view for a second), and the dots above it go once nothing
 * new is under them; it also goes on its own two weeks after it was first shown. At most three show at once, the rest
 * waiting their turn. Whether each also has a × to clear it without looking is a design to compare (VARIANTS
 * `new-dismiss`). What was seen is this device's.
 *
 * Today: agents a machine found and Sidevoice could connect, and — where What's new shows as dots (VARIANTS
 * `whats-new`) — the settings a release added. */

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

/** Everything new now, before the record says what was seen or is past its time. */
function useCandidates(): Highlight[] {
  const hostAgents = useRoomStore((state) => state.facts.hostAgents);
  const pairings = useRoomStore((state) => state.facts.pairings);
  const dots = useWhatsNewPlace() === "dots";
  const features = useWhatsNew().items;
  const active = new Set(pairings.filter((pairing) => !pairing.revoked).map((pairing) => pairing.fp));
  const agents = Object.entries(hostAgents).filter(([fp, listing]) => active.has(fp) && !!listing.value)
    .flatMap(([fp, listing]) => (listing.value?.agents ?? []).filter(actionableAgent).map((agent) => ({ id: `agent:${fp}:${agent.id}`, section: "machines", machine: fp })));
  return [...agents, ...(dots ? features.map((feature) => ({ id: `feature:${feature.id}`, section: feature.section })) : [])];
}

/** What shows as new now: not seen, not past its two weeks, at most three. Each is recorded as shown the first time. */
export function useHighlights() {
  const seen = useSyncExternalStore(subscribe, read, read);
  const candidates = useCandidates();
  const now = Date.now();
  const items = candidates.filter((item) => !seen[item.id]?.seenAt && !(seen[item.id] && now - seen[item.id].shownAt > EXPIRES_MS)).slice(0, AT_ONCE);
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


/** An item's icon with, when something new is under it, the dot on the icon's corner (as on the Settings gear) — never
 *  a dot of its own beside the item's state dot. Said in words to screen readers. */
export function NewOnIcon({ icon, isNew, label }: { icon: ReactNode; isNew: boolean; label?: string }) {
  return <span className="new-on-icon">{icon}{isNew && <span className="new-on-icon-dot" aria-hidden={label ? undefined : true}>{label && <span className="sr-only">{label}</span>}</span>}</span>;
}

/** "New" on the thing itself. Seen (half of it in view for a second) it is cleared, but stays on screen until this view
 *  goes; with VARIANTS new-dismiss "with", a × clears it at once. */
export function NewMark({ id }: { id: string }) {
  const t = hostTranslator();
  const items = useHighlights();
  const onboarding = useOnboardingIfAny();
  const dismissable = useVariant("new-dismiss", ["with", "without"] as const) === "with";
  const isNew = items.some((item) => item.id === id);
  const [showing, setShowing] = useState(isNew);
  if (isNew && !showing) setShowing(true);
  const ref = useRef<HTMLSpanElement>(null);
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
    <Badge tone="accent">{t("highlights.new")}</Badge>
    {dismissable && isNew && <button type="button" className="new-mark-dismiss" aria-label={t("highlights.dismiss")} title={t("highlights.dismiss")} onClick={dismiss}><CloseIcon size={12} /></button>}
  </span>;
}
