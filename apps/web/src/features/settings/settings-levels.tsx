import { createContext, useContext, useEffect, useLayoutEffect, useReducer, useRef, useState, type RefObject } from "react";
import { useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore, type RoomStore } from "../../state/room-store";
import type { SessionFacts } from "../../state/room-session-state.js";

/* Settings on a phone: a menu rather than its sections beside the page. The list of sections is its first level, a
 * section's page its second, and within Machines a machine's page its third. It is always a hierarchy: Back goes to the
 * parent, never to wherever the person was before, so the system's back agrees with it. Each level is one entry in the
 * browser's history — the system's back (an edge swipe, the browser's Back) goes up a level, and from the list closes
 * Settings rather than leaving the room; Escape and Android's back come as the dialog's `cancel`, and do the same. Every
 * way up goes through history.back(), and `popstate` alone shows the level its entry names; every close takes the
 * entries left back off. A jump inside Settings (This device's rename to General), an opening at a page, an agent's
 * request and a crossing of the breakpoint rebuild the entries without a slide. A desktop pushes nothing.
 *
 * The levels slide (the next one in from the inline end, the one left a quarter of the way out; back is the mirror),
 * never under reduced motion; once a slide ends the level left is hidden, so what is new on it is not seen there, and
 * where it was scrolled is kept here by value. */

/** Below this width Settings is the menu: the breakpoint of the strip of sections it replaced. */
export const SETTINGS_PHONE_QUERY = "(max-width: 767px)";

/** 1 the list of sections, 2 a section's page, 3 a machine's page (Machines only). */
export type SettingsLevel = 1 | 2 | 3;
/** A slide under way, between two levels: `shift` keeps the page left where it was scrolled, where both share a scroll
 *  (Machines' list and a machine's page). */
export interface SettingsMotion { from: SettingsLevel; to: SettingsLevel; dir: "forward" | "back"; shift: number }

interface SettingsLevels {
  phone: boolean;
  level: SettingsLevel;
  motion: SettingsMotion | null;
  /** Into a section's page from the list, or a machine's page from Machines. */
  open(section: string, machine?: string): void;
  /** Up a level, as the system's back does. `instantly`, with no slide (what was shown is gone); `focus: "title"`, focus
   *  on the title rather than on the row that led there. */
  back(options?: { instantly?: boolean; focus?: "title" }): void;
  /** Said once, politely, in Settings' own region (never the call's). */
  say(text: string): void;
}

const SettingsLevelsContext = createContext<SettingsLevels>({ phone: false, level: 2, motion: null, open() {}, back() {}, say() {} });
export const SettingsLevelsProvider = SettingsLevelsContext.Provider;
/** Settings' levels, for what a level shows (Machines' list and a machine's page). Outside Settings, a desktop's. */
export function useSettingsLevels() { return useContext(SettingsLevelsContext); }

/** Which way a level moves in a slide, if it does: "in-forward", "out-back"… */
export function motionOf(motion: SettingsMotion | null, level: SettingsLevel) {
  if (!motion) return undefined;
  return motion.to === level ? "in-" + motion.dir : motion.from === level ? "out-" + motion.dir : undefined;
}

/** A section on show: its page, on a phone (not the list above it, nor Settings closed); the section chosen, on a
 *  desktop. What runs in a section (a try) stops when it is not. */
export function useSectionShown(section: string) {
  const phone = useMedia(SETTINGS_PHONE_QUERY);
  return useRoomStore((state) => (state.facts.settingsSection || "general") === section && (!phone || state.facts.settingsLevel === "page"));
}

/** Each level's history entry: the page's load and the opening it belongs to, and the levels down to it. */
const KEY = "sidevoiceSettings";
const LOAD = Math.random().toString(36).slice(2);
let openings = 0;
type Stack = string[];
interface Entry { opening: string; stack: Stack }

/** What sits over Settings and goes first on a system back: a dialog opened from it (pairing, a provider's key, a
 *  question), an open menu, a popover, a select's list. */
const LAYERS = "dialog[open]:not(#language-settings), [role=menu], .ui-popover, .ui-select-content";

/** The levels down to what the store says Settings shows: the list; a section; Machines and one of them. */
function stackOf(facts: SessionFacts): Stack {
  if (facts.settingsLevel !== "page") return ["list"];
  const section = facts.settingsSection || "general";
  const machine = section === "machines" ? facts.machinesView?.machine ?? null : null;
  return machine ? ["list", section, machine] : ["list", section];
}
const same = (a: Stack, b: Stack) => a.length === b.length && a.every((part, index) => part === b[index]);
/** The store as a stack of levels says it. The list keeps the section last shown: its row takes the focus back. */
function factsOf(stack: Stack): Partial<SessionFacts> {
  if (stack.length < 2) return { settingsLevel: "list" };
  return { settingsLevel: "page", settingsSection: stack[1], ...(stack[1] === "machines" ? { machinesView: { machine: stack[2] ?? null } } : {}) };
}

/** How long a slide takes here: none under reduced motion (a shorter one is still motion), else the theme's. */
function slideMs(element: Element | null) {
  if (!element || globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return 0;
  const value = getComputedStyle(element).getPropertyValue("--sv-dur-slow").trim();
  const ms = value.endsWith("ms") ? parseFloat(value) : value.endsWith("s") ? parseFloat(value) * 1000 : NaN;
  return Number.isFinite(ms) ? ms : 0;
}

/** A dialog closed; where a browser has no modal dialog (an old engine, a test's DOM), its attribute taken off. */
function closeDialog(dialog: HTMLDialogElement) {
  if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
}

/** A layer over Settings, closed as its own Escape would: a dialog by its cancel (one that can't be put off stays), a
 *  menu, a popover or a list by the key. */
function closeLayer(layer: HTMLElement) {
  if (layer instanceof HTMLDialogElement) {
    const cancel = new Event("cancel", { cancelable: true });
    layer.dispatchEvent(cancel);
    if (!cancel.defaultPrevented) closeDialog(layer);
    return;
  }
  (document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
}

interface Parts {
  /** The list of sections, the first level. */
  nav: RefObject<HTMLElement | null>;
  /** The pages, the second and third levels. */
  content: RefObject<HTMLElement | null>;
}

/** Settings' levels, kept by its dialog: which shows, the slide between them, the history entries under them, and where
 *  focus and each level's scroll go. */
export function useSettingsLevelsOf(dialog: HTMLDialogElement | null, { nav, content }: Parts): { levels: SettingsLevels; said: string } {
  const store = useContext(RoomStoreContext) as RoomStore;
  const phone = useMedia(SETTINGS_PHONE_QUERY);
  const settingsLevel = useRoomStore((state) => state.facts.settingsLevel);
  const section = useRoomStore((state) => state.facts.settingsSection) || "general";
  const machine = useRoomStore((state) => state.facts.machinesView?.machine ?? null);
  const level: SettingsLevel = !phone ? 2 : settingsLevel !== "page" ? 1 : section === "machines" && machine ? 3 : 2;
  const [motion, setMotion] = useState<SettingsMotion | null>(null);
  const [said, setSaid] = useState("");
  const [, rendered] = useReducer((n: number) => n + 1, 0);
  const live = useRef({
    phone, motion, open: false, opening: "",
    /** The levels this opening has in the history, one entry each, over the room's. */
    entries: [] as Stack,
    /** Entries being taken off (a close, a rebuild one level up): the `popstate` that ends it is ours, not a back. */
    unwinding: null as { depth: number; then?: () => void } | null,
    /** How the next `popstate` up is shown, when it was asked for here. */
    backAs: null as { instantly?: boolean; focus?: "title" } | null,
    timer: 0, navScroll: 0, listScroll: 0, agentsFocused: -1,
    /** What to do once the level shown is drawn: its scroll, and where focus goes. */
    after: null as (() => void) | null,
  });
  live.current.phone = phone;
  live.current.motion = motion;

  const write = (stack: Stack, how: "push" | "replace") => {
    const state: Record<string, Entry> = { [KEY]: { opening: live.current.opening, stack } };
    if (how === "push") history.pushState(state, ""); else history.replaceState(state, "");
  };
  const unwind = (steps: number, then?: () => void) => {
    live.current.unwinding = { depth: live.current.entries.length, then };
    history.go(-steps);
  };
  /** The history made to hold `target`, one entry per level, from what it holds now. */
  const rebuild = (target: Stack) => {
    const now = live.current.entries;
    live.current.entries = target;
    if (target.length >= now.length) {
      if (now.length) write(target.slice(0, now.length), "replace");
      for (let depth = now.length + 1; depth <= target.length; depth++) write(target.slice(0, depth), "push");
    } else unwind(now.length - target.length, () => write(target, "replace"));
  };
  const finishMotion = () => {
    window.clearTimeout(live.current.timer);
    if (live.current.motion) { live.current.motion = null; setMotion(null); }
  };
  const focusTitle = () => document.getElementById("settings-title")?.focus({ preventScroll: true });
  /** Where focus lands where Settings opened or was rebuilt: the agents a request asked for, else the title. */
  const focusLanding = (stack: Stack) => {
    // A control asked for (settingsFocus) that already took it, lit in its row, keeps it: the title comes first only.
    if (document.activeElement?.closest(".settings-highlight")) return;
    const request = store.getState().facts.settingsAgentRequest;
    const page = stack.length === 3 || stack[1] === "this-computer" ? document.getElementById("pane-" + stack[1]) : null;
    const agents = request?.fp && request.id !== live.current.agentsFocused ? page?.querySelector<HTMLElement>("#host-agents-title") : null;
    if (!agents || !request) { focusTitle(); return; }
    live.current.agentsFocused = request.id;
    agents.closest("section")?.scrollIntoView?.({ block: "start" });
    agents.focus({ preventScroll: true });
  };
  /** Back on the level above, focus on what led to the level left: its row in the list, or the machine's in Machines —
   *  the first machine, else Add a machine, when that one is gone. */
  const focusRow = (left: Stack) => {
    if (left.length === 2) { document.getElementById("settings-" + left[1])?.focus({ preventScroll: true }); return; }
    const page = content.current;
    const row = [...page?.querySelectorAll<HTMLElement>("[data-machine]") ?? []].find((entry) => entry.dataset.machine === left[2])
      ?? page?.querySelector<HTMLElement>(".machines-menu .settings-menu-row") ?? document.getElementById("pair-device-open");
    row?.focus({ preventScroll: true });
  };

  /** A level shown without a slide: an opening, a rebuild. The pages start at their top. */
  const land = (from: Stack, to: Stack, opening: boolean) => {
    finishMotion();
    live.current.after = () => {
      if (opening && nav.current) { nav.current.scrollTop = 0; live.current.navScroll = 0; }
      if (content.current && (opening || from[1] !== to[1] || from.length !== to.length)) content.current.scrollTop = 0;
      focusLanding(to);
    };
    rendered();
  };
  /** A level shown from another next to it, sliding unless `instantly` or under reduced motion; each level's scroll
   *  kept or restored, and focus on the title going in, on the row that led there coming back. */
  const step = (from: Stack, to: Stack, dir: "forward" | "back", { instantly = false, focus }: { instantly?: boolean; focus?: "title" } = {}) => {
    const now = live.current;
    const fromLevel = from.length as SettingsLevel, toLevel = to.length as SettingsLevel;
    const scrolled = content.current?.scrollTop ?? 0;
    if (fromLevel === 1) now.navScroll = nav.current?.scrollTop ?? 0;
    if (fromLevel === 2 && toLevel === 3) now.listScroll = scrolled;
    const ms = instantly ? 0 : slideMs(content.current ?? nav.current);
    const shift = fromLevel === 2 && toLevel === 3 ? -scrolled : fromLevel === 3 && toLevel === 2 ? now.listScroll - scrolled : 0;
    window.clearTimeout(now.timer);
    const next = ms ? { from: fromLevel, to: toLevel, dir, shift } : null;
    now.motion = next;
    setMotion(next);
    if (ms) now.timer = window.setTimeout(() => { now.motion = null; setMotion(null); }, ms);
    now.after = () => {
      if (toLevel === 1 && nav.current) nav.current.scrollTop = now.navScroll;
      if (content.current && toLevel > fromLevel) content.current.scrollTop = 0;
      if (content.current && toLevel === 2 && fromLevel === 3) content.current.scrollTop = now.listScroll;
      if (dir === "back" && focus !== "title") focusRow(from); else focusTitle();
    };
    store.patch(factsOf(to));
    rendered();
  };

  const levels: SettingsLevels = {
    phone, level, motion,
    open: (to, at) => {
      const now = live.current;
      if (!now.phone || now.motion || !now.open) return;
      const from = now.entries;
      const next = at ? ["list", to, at] : ["list", to];
      if (next.length !== from.length + 1) return;
      now.entries = next;
      write(next, "push");
      step(from, next, "forward");
    },
    back: (options = {}) => {
      const now = live.current;
      if (!now.phone || now.entries.length < 2 || (now.motion && !options.instantly)) return;
      now.backAs = options;
      history.back();
    },
    say: (text) => { setSaid(""); window.setTimeout(() => setSaid(text), 50); },
  };

  // Opened, or closed: an opening shows the level asked for — the list unless something asked for a page — with an
  // entry per level; a close takes them back off, and the next opening starts at the list again.
  useEffect(() => {
    if (!dialog) return;
    const seen = () => {
      const now = live.current;
      const open = dialog.hasAttribute("open");
      if (open === now.open) return;
      now.open = open;
      finishMotion();
      if (open) {
        now.opening = `${LOAD}:${++openings}`;
        if (!now.phone) return;
        const target = stackOf(store.getState().facts);
        now.entries = [];
        rebuild(target);
        land([], target, true);
        return;
      }
      if (now.entries.length) { const steps = now.entries.length; now.entries = []; unwind(steps); }
      store.patch({ settingsLevel: "list", ...(now.phone ? { machinesView: { machine: null } } : {}) });
    };
    const observer = new MutationObserver(seen);
    observer.observe(dialog, { attributes: true, attributeFilter: ["open"] });
    seen();
    return () => observer.disconnect();
  }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps

  // The history moved: up a level (or more), out of Settings from its list, or a layer over it closed first.
  useEffect(() => {
    const popped = (event: PopStateEvent) => {
      const now = live.current;
      const entry = (event.state as Record<string, Entry> | null)?.[KEY];
      const stack = entry && entry.opening === now.opening ? entry.stack : [];
      if (now.unwinding) {
        const { depth, then } = now.unwinding;
        now.unwinding = null;
        if (stack.length === depth) { then?.(); return; }
      }
      // Closed (a reload left its entries behind), Settings stays closed.
      if (!now.open || !now.phone) return;
      const layer = [...document.querySelectorAll<HTMLElement>(LAYERS)].pop();
      if (layer) { closeLayer(layer); write(now.entries, "push"); now.backAs = null; return; }
      const as = now.backAs ?? {};
      now.backAs = null;
      if (!stack.length) { now.entries = []; if (dialog) closeDialog(dialog); return; }
      const from = now.entries;
      now.entries = stack;
      // A slide under way ends where it was going, then this one starts.
      finishMotion();
      step(from, stack, stack.length < from.length ? "back" : "forward", as);
    };
    window.addEventListener("popstate", popped);
    return () => window.removeEventListener("popstate", popped);
  }, [dialog]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape, and Android's back: up a level from a page; from the list (or when the browser no longer lets it be put
  // off) Settings closes.
  useEffect(() => {
    if (!dialog) return;
    const cancelled = (event: Event) => {
      const now = live.current;
      if (event.target !== dialog || !now.phone || now.entries.length < 2 || !event.cancelable) return;
      event.preventDefault();
      history.back();
    };
    dialog.addEventListener("cancel", cancelled);
    return () => dialog.removeEventListener("cancel", cancelled);
  }, [dialog]);

  // Across the breakpoint while open: into a phone, the section shown as its page (Machines at its list); out of one,
  // the entries off and the same section beside the others.
  useEffect(() => {
    const now = live.current;
    if (!now.open) return;
    finishMotion();
    if (phone) {
      const facts = store.getState().facts;
      store.patch({ settingsLevel: "page", ...(facts.settingsSection === "machines" ? { machinesView: { machine: null } } : {}) });
      const target = stackOf(store.getState().facts);
      rebuild(target);
      live.current.after = () => { if (!dialog?.contains(document.activeElement)) focusTitle(); };
      rendered();
    } else if (now.entries.length) { const steps = now.entries.length; now.entries = []; unwind(steps); }
  }, [phone]); // eslint-disable-line react-hooks/exhaustive-deps

  // What Settings shows changed from outside its levels — an agent's request, a jump inside Settings, a page asked for
  // while open: the entries rebuilt to it, with no slide.
  const shown = phone ? [settingsLevel, section, machine].join("|") : "";
  useEffect(() => {
    const now = live.current;
    if (!phone || !now.open) return;
    const target = stackOf(store.getState().facts);
    if (same(target, now.entries)) return;
    const from = now.entries;
    rebuild(target);
    land(from, target, false);
  }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    const after = live.current.after;
    live.current.after = null;
    after?.();
  });
  useEffect(() => () => window.clearTimeout(live.current.timer), []);

  return { levels, said };
}
