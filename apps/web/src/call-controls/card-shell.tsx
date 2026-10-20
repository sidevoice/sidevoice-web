/* The desktop card's plumbing with its host (CallCard.tsx lays the card out around it): the host's state, the pointer's
 * nearness, the click guard, the drag, the window's size, and the two panels — the conversation picker and the
 * devices. */
import { useCallback, useEffect, useRef, useState, type ReactNode, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ChevronIcon, HarnessIcon, MachinesIcon, MicrophoneIcon, SpeakerIcon } from "../components/ui/Icons";
import { ConversationRows } from "../features/room/ConversationRows";
import { hasUnread } from "../features/call/conversation-state";
import type { ParticipantView } from "../state/room-types";
import type { AudioDeviceOption, CallCommand, CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import type { Translate } from "../i18n/translator";

/** Space around the card inside its window, for its shadow. */
export const CARD_MARGIN = 12;
/** Before the controls show on hover, and before they hide once the pointer leaves. */
export const SHOW_DELAY_MS = 120;
export const HIDE_DELAY_MS = 500;
/** The avatar's compact card fades out this long before it leaves the window's flow (call-card.css). */
export const FADE_MS = 160;
/** A panel left open closes this long after the pointer leaves. */
export const PANEL_CLOSE_MS = 2500;
/** Right after the card changes size (the app may move its window under the pointer), its buttons ignore clicks. */
export const CLICK_GUARD_MS = 350;
/** More than this many pixels between pressing and releasing is a drag, not a click. */
export const DRAG_THRESHOLD_PX = 4;
/** Your wave: the microphone's level, sampled this often, the last five samples. */
export const WAVE_SAMPLE_MS = 100;
const WAVE_BARS = 5;

export type Panel = "conversations" | "devices" | null;

/** The latest state the app sent, null until the first. */
export function useHostState(host: CallControlsHost): CallControlsState | null {
  const [state, setState] = useState<CallControlsState | null>(null);
  useEffect(() => host.subscribe(setState), [host]);
  return state;
}

/** `value`, but turning on only after `onDelay` and off only after `offDelay`. */
export function useDelayed(value: boolean, onDelay: number, offDelay: number): boolean {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value === shown) return;
    const timer = setTimeout(() => setShown(value), value ? onDelay : offDelay);
    return () => clearTimeout(timer);
  }, [value, shown, onDelay, offDelay]);
  return shown;
}

export function useNow(every: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(timer);
  }, [every]);
  return now;
}

export function duration(since: number | null, now: number): string {
  if (!since) return "";
  const seconds = Math.max(0, Math.floor((now - since) / 1000));
  const h = Math.floor(seconds / 3600), m = Math.floor((seconds % 3600) / 60), s = seconds % 60;
  const two = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${m}:${two(s)}`;
}

/** The level's last samples, taken every WAVE_SAMPLE_MS whatever arrives (the room sends a level only when it
 *  changes), so silence drains the wave instead of freezing old peaks. Muted, it is flat and starts over. */
export function useWave(level: number, muted: boolean): number[] {
  const latest = useRef(level);
  latest.current = muted ? 0 : level;
  const [levels, setLevels] = useState<number[]>(() => Array(WAVE_BARS).fill(0));
  useEffect(() => {
    if (muted) {
      setLevels(Array(WAVE_BARS).fill(0));
      return;
    }
    // Drained flat and still silent: the same samples, so the card does not render again ten times a second for
    // nothing (desktop#149).
    const timer = setInterval(() => setLevels((previous) =>
      latest.current === 0 && previous.every((value) => value === 0) ? previous : [...previous.slice(1), latest.current]), WAVE_SAMPLE_MS);
    return () => clearInterval(timer);
  }, [muted]);
  return levels;
}

export interface CardShell {
  /** All the card shows (its body, and what opens from it): the window's size, its margin added. */
  card: RefObject<HTMLDivElement | null>;
  /** The card's body, which the host keeps where it rests while the window grows around it; the whole card by default. */
  body: RefObject<HTMLDivElement | null>;
  panel: Panel;
  setPanel(panel: Panel): void;
  /** The controls that wait for the pointer are shown. */
  expanded: boolean;
  /** The avatar's compact card (zones): its box is in the window's flow (shown, fading out, or kept while the creature is
   *  dragged), and the creature is being dragged (the card is put away, whatever else holds it out). */
  flow: boolean;
  dragging: boolean;
  /** What the pointer is on (the card opens after SHOW_DELAY_MS on the creature or the card, folds after HIDE_DELAY_MS off
   *  both), the keyboard's focus in the card, and Escape. */
  zone: { aim(zone: "none" | "creature" | "card"): void; fold(): void; focusWithin(within: boolean): void };
  /** Runs a command unless the click guard holds it. */
  run(command: CallCommand): void;
  handlers: {
    onPointerEnter(): void; onPointerLeave(): void;
    onPointerDown(event: ReactPointerEvent<HTMLDivElement>): void; onPointerMove(event: ReactPointerEvent<HTMLDivElement>): void;
    onPointerUp(event: ReactPointerEvent<HTMLDivElement>): void; onPointerCancel(event: ReactPointerEvent<HTMLDivElement>): void;
    onClickCapture(event: ReactMouseEvent): void;
  };
}

/** The card's plumbing with its host. The click guard holds every command. */
export function useCardShell(host: CallControlsHost, state: CallControlsState, resizable?: { minWidth: number; minHeight: number }, zones = false): CardShell {
  const card = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLDivElement>(null);
  const resizeRule = resizable ? resizable.minWidth + "x" + resizable.minHeight : "";
  const [domInside, setDomInside] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const guardUntil = useRef(0);
  const drag = useRef<{ x: number; y: number; moving: boolean; id: number } | null>(null);
  const dragged = useRef(false);

  const inside = state.pointerInside ?? domInside;
  const hovered = useDelayed(inside, SHOW_DELAY_MS, HIDE_DELAY_MS);
  // The avatar's compact card comes out by what the pointer is on, never by the pointer nearing the window: the creature or
  // the card opens it after SHOW_DELAY_MS, leaving both folds it after HIDE_DELAY_MS. Held out by a panel open, the app's
  // "always" and the keyboard's focus in the card (:focus-visible, never a control clicked with the pointer); those fold
  // HIDE_DELAY_MS after they let go. Escape folds at once. A drag puts it away (its box stays in the window's flow until the
  // drop: a size report mid-drag makes the app place the window).
  const [aim, setAim] = useState<"none" | "creature" | "card">("none");
  const [opened, setOpened] = useState(false);
  const [focusIn, setFocusIn] = useState(false);
  const [escaped, setEscaped] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [dragBox, setDragBox] = useState(false);
  const draggingNow = useRef(false);
  const wantOpen = aim !== "none";
  useEffect(() => {
    if (!zones || dragging || wantOpen === opened) return;
    const timer = setTimeout(() => setOpened(wantOpen), wantOpen ? SHOW_DELAY_MS : HIDE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [zones, dragging, wantOpen, opened]);
  const held = useDelayed(zones && (state.alwaysExpanded || panel !== null), 0, HIDE_DELAY_MS);
  const open = zones && !dragging && !escaped && (held || opened || focusIn);
  const expanded = zones ? open : state.alwaysExpanded || hovered || panel !== null;
  const lingering = useDelayed(open, 0, FADE_MS);
  const flow = zones && (open || lingering || dragBox);
  // Dropped: the box leaves the flow once the card is back out, or at once if it is not coming back.
  useEffect(() => {
    if (!dragging && dragBox && (open || aim === "none")) setDragBox(false);
  }, [dragging, dragBox, open, aim]);
  const zone = {
    aim: useCallback((next: "none" | "creature" | "card") => {
      if (draggingNow.current) return;
      if (next !== "none") setEscaped(false);
      setAim(next);
    }, []),
    fold: useCallback(() => {
      setEscaped(true); setFocusIn(false); setAim("none"); setOpened(false);
      const active = document.activeElement as HTMLElement | null;
      if (active?.closest(".avatar-compact")) active.blur();
    }, []),
    focusWithin: useCallback((within: boolean) => { setFocusIn(within); if (within) setEscaped(false); }, []),
  };
  // The app says the pointer is not in the window: nothing is on the creature or the card.
  useEffect(() => { if (zones && state.pointerInside === false) setAim("none"); }, [zones, state.pointerInside]);

  // A panel left open closes once the pointer has been away a while; a click outside the card closes it at once (the
  // app tells the card about clicks elsewhere, which a window that is never focused does not see itself).
  useEffect(() => {
    if (!panel || inside) return;
    const timer = setTimeout(() => setPanel(null), PANEL_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [panel, inside]);
  const outside = state.outsideClicks ?? 0;
  const firstOutside = useRef(outside);
  useEffect(() => {
    if (outside !== firstOutside.current) setPanel(null);
  }, [outside]);

  // The window is the card's size, margin included: the app sizes (and may move) it to what is shown, so every change
  // of size re-arms the click guard.
  useEffect(() => {
    const element = card.current;
    if (!element) return;
    let last = "";
    const report = () => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return;
      const inner = body.current?.getBoundingClientRect();
      const cardBox = inner && inner.width && inner.height
        ? { x: Math.round(inner.left - box.left) + CARD_MARGIN, y: Math.round(inner.top - box.top) + CARD_MARGIN, width: Math.ceil(inner.width), height: Math.ceil(inner.height) }
        : undefined;
      const size = { width: Math.ceil(box.width) + 2 * CARD_MARGIN, height: Math.ceil(box.height) + 2 * CARD_MARGIN };
      const key = JSON.stringify([size, cardBox, resizeRule]);
      if (key === last) return;
      if (last) guardUntil.current = Date.now() + CLICK_GUARD_MS;
      last = key;
      host.layout({ ...size, ...(cardBox ? { card: cardBox } : {}), ...(resizable ? { resizable } : {}) });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    if (body.current && body.current !== element) observer.observe(body.current);
    return () => observer.disconnect();
  }, [host, resizeRule]); // eslint-disable-line react-hooks/exhaustive-deps
  // Appearing is a change too (the pointer may have just come onto the card).
  useEffect(() => { if (expanded) guardUntil.current = Math.max(guardUntil.current, Date.now() + CLICK_GUARD_MS); }, [expanded]);

  // The click guard is for a pointer landing on controls that just appeared; a key press is never that (spec §2.4).
  const keyboardClick = useRef(false);
  const run = (command: CallCommand) => { if (keyboardClick.current || Date.now() >= guardUntil.current) host.run(command); };

  // Dropped: the card comes back (after SHOW_DELAY_MS) if the pointer is on the creature, or at once if it is always shown.
  const endDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d?.moving) return;
    host.drag("end");
    if (!zones) return;
    draggingNow.current = false;
    setDragging(false);
    if (document.elementFromPoint?.(event.clientX, event.clientY)?.closest(".avatar-figure")) { setEscaped(false); setAim("creature"); }
  };

  const handlers: CardShell["handlers"] = {
    onPointerEnter: () => setDomInside(true),
    onPointerLeave: () => { setDomInside(false); if (zones) setAim("none"); },
    onPointerDown(event) {
      dragged.current = false;
      const target = event.target as Element;
      // A press anywhere in the card but in an open panel or on what opens it closes the panel.
      if (panel && !target.closest(".card-panel, .card-title, .card-devices, .card-conversations-button")) setPanel(null);
      // Dragging from anywhere but a button (the title counts as card): past the threshold it moves the window.
      // The avatar's balloons are inert, as the room's are: a press on one moves nothing (its button acts).
      if (event.button > 0 || target.closest("button:not(.card-title), .card-panel, .card-grip, .ui-popover, .avatar-balloons .speech-bubble")) return;
      drag.current = { x: event.screenX, y: event.screenY, moving: false, id: event.pointerId };
    },
    onPointerMove(event) {
      const d = drag.current;
      if (!d || d.id !== event.pointerId) return;
      if (!d.moving) {
        if (Math.hypot(event.screenX - d.x, event.screenY - d.y) <= DRAG_THRESHOLD_PX) return;
        d.moving = true;
        dragged.current = true;
        setPanel(null);
        if (zones) {
          draggingNow.current = true;
          setDragBox(open); setDragging(true); setAim("none"); setOpened(false); setFocusIn(false);
        }
        event.currentTarget.setPointerCapture?.(event.pointerId);
        host.drag("start");
      }
      host.drag("move");
    },
    onPointerUp: (event) => endDrag(event),
    onPointerCancel: (event) => endDrag(event),
    onClickCapture(event) {
      keyboardClick.current = event.detail === 0;
      // After "Cancel sending" (its balloon goes with it) nothing of the card keeps focus, which would hold the controls out; from the
      // keyboard, focus goes to the microphone, the call's nearest control.
      if ((event.target as Element).closest(".cancel-input")) {
        const keyboard = event.detail === 0;
        setTimeout(() => { if (keyboard) card.current?.querySelector<HTMLElement>(".card-mute")?.focus(); else (document.activeElement as HTMLElement | null)?.blur(); });
      }
      if (keyboardClick.current) setTimeout(() => { keyboardClick.current = false; });
      if (dragged.current) { event.stopPropagation(); event.preventDefault(); dragged.current = false; }
    },
  };
  return { card, body, panel, setPanel, expanded, flow, dragging, zone, run, handlers };
}

/** A device as the card words it: a real device keeps its own name; the system's choice, an unnamed device and a
 *  chosen device that went away are said in the card's words. */
function deviceName(option: AudioDeviceOption, kind: "input" | "output", t: Translate): string {
  if (option.system) return t("card.systemDefault");
  if (option.missing) return t("card.deviceMissing");
  if (option.number) return t(kind === "input" ? "card.microphoneNumber" : "card.speakerNumber", { n: option.number });
  return option.label;
}

export function DevicePicker({ call, run, onDone, t }: { call: CallSnapshot; run: (command: CallCommand) => void; onDone(): void; t: Translate }) {
  const [open, setOpen] = useState<"input" | "output" | null>(null);
  const [asked, setAsked] = useState<{ kind: "input" | "output"; id: string } | null>(null);
  const devices = call.devices;
  // The room changes devices and says no by keeping the one it had: the card says so once the room has answered.
  const failed = !!asked && !!devices && !devices.busy && (asked.kind === "input" ? devices.inputId : devices.outputId) !== asked.id;
  // Once the room has confirmed the choice (it now has the device that was asked), the panel is done; a refusal keeps it open.
  const confirmed = !!asked && !!devices && !devices.busy && (asked.kind === "input" ? devices.inputId : devices.outputId) === asked.id;
  useEffect(() => {
    if (!confirmed) return;
    setAsked(null);
    onDone();
  }, [confirmed, onDone]);
  if (!devices) return null;
  const rows = [
    { kind: "input" as const, label: t("card.microphone"), Icon: MicrophoneIcon, options: devices.inputs, current: devices.inputId, usable: devices.available },
    { kind: "output" as const, label: t("card.speaker"), Icon: SpeakerIcon, options: devices.outputs, current: devices.outputId, usable: devices.available && devices.outputAvailable },
  ];
  return (
    <div className="card-panel devices" role="group" aria-label={t("card.devices")}>
      {rows.map((row) => {
        const current = row.options.find((option) => option.id === row.current);
        return (
          <div key={row.kind}>
            <button type="button" className="device-row" aria-expanded={open === row.kind} disabled={devices.busy || !row.usable}
              title={row.usable ? undefined : t("card.devicesInSystem")}
              onClick={() => setOpen(open === row.kind ? null : row.kind)}>
              <row.Icon size={15} /><span className="device-kind">{row.label}</span>
              <span className="device-current">{current ? deviceName(current, row.kind, t) : t("card.systemDefault")}</span><ChevronIcon size={14} />
            </button>
            {open === row.kind && (
              <div className="device-options" role="listbox" aria-label={row.label}>
                {row.options.map((option) => (
                  <button type="button" role="option" key={option.id} aria-selected={option.id === row.current}
                    className="device-option" onClick={() => {
                      setOpen(null);
                      setAsked({ kind: row.kind, id: option.id });
                      run({ command: "select-audio-device", kind: row.kind, id: option.id });
                    }}>
                    <span className="check" aria-hidden="true">{option.id === row.current ? "✓" : ""}</span>{deviceName(option, row.kind, t)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
      {!devices.available && <p className="card-note">{t("card.devicesInSystem")}</p>}
      {failed && <p className="card-note" role="status">{t("card.deviceFailed")}</p>}
    </div>
  );
}

/** One row's line in the card's words: where it runs, and a reach that is not normal (the dot says the rest). */
function conversationSub(row: ParticipantView, t: Translate) {
  const reach = row.reach === "holding" ? t("card.reach.holding") : row.reach === "offline" || !row.available ? t("card.reach.offline") : null;
  return (
    <>
      {row.machine && <span className="person-machine"><MachinesIcon size={11} /> {row.machine}</span>}
      {(row.harness || row.model) && <span className="person-harness">{row.harness && <HarnessIcon harness={row.harness} size={11} />} {[row.model, row.effort].filter(Boolean).join(" · ")}</span>}
      {reach && <span className="person-reach"> · {reach}</span>}
    </>
  );
}

/** The conversation picker: the room's rows. Which can be chosen is the caller's. */
export function ConversationPicker({ call, disabled, onSelect, lead, t }: { call: CallSnapshot; disabled(row: ParticipantView): boolean; onSelect(threadId: string): void;
  lead?(row: ParticipantView): ReactNode; t: Translate }) {
  return (
    <div className="card-panel conversations" aria-label={t("card.conversations")}>
      <ConversationRows
        className="card-conversations"
        rows={call.participants}
        disabled={disabled}
        onSelect={onSelect}
        sub={(row) => conversationSub(row, t)}
        lead={lead}
        aside={(row) => (hasUnread(row, null) ? <span className="card-unread" role="img" aria-label={t("state.unread")} /> : null)}
      />
    </div>
  );
}
