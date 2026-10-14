/* The desktop card's plumbing with its host (CallCard.tsx lays the card out around it): the host's state, the pointer's
 * nearness, the click guard, the drag, the window's size, and the two panels — the conversation picker and the
 * devices. */
import { useEffect, useRef, useState, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type RefObject } from "react";
import { ChevronIcon, HarnessIcon, MachinesIcon, MicrophoneIcon, SpeakerIcon } from "../components/ui/Icons";
import { ConversationRows } from "../features/room/ConversationRows";
import type { ParticipantView } from "../state/room-types";
import type { AudioDeviceOption, CallCommand, CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import type { Translate } from "../i18n/translator";

/** Space around the card inside its window, for its shadow. */
export const CARD_MARGIN = 12;
/** Before the controls show on hover, and before they hide once the pointer leaves. */
export const SHOW_DELAY_MS = 120;
export const HIDE_DELAY_MS = 500;
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
    const timer = setInterval(() => setLevels((previous) => [...previous.slice(1), latest.current]), WAVE_SAMPLE_MS);
    return () => clearInterval(timer);
  }, [muted]);
  return levels;
}

export interface CardShell {
  card: RefObject<HTMLDivElement | null>;
  panel: Panel;
  setPanel(panel: Panel): void;
  /** The controls that wait for the pointer are shown. */
  expanded: boolean;
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
export function useCardShell(host: CallControlsHost, state: CallControlsState): CardShell {
  const card = useRef<HTMLDivElement>(null);
  const [domInside, setDomInside] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const guardUntil = useRef(0);
  const drag = useRef<{ x: number; y: number; moving: boolean; id: number } | null>(null);
  const dragged = useRef(false);

  const inside = state.pointerInside ?? domInside;
  const hovered = useDelayed(inside, SHOW_DELAY_MS, HIDE_DELAY_MS);
  const expanded = state.alwaysExpanded || hovered || panel !== null;

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
      const size = { width: Math.ceil(box.width) + 2 * CARD_MARGIN, height: Math.ceil(box.height) + 2 * CARD_MARGIN };
      const key = size.width + "x" + size.height;
      if (key === last) return;
      if (last) guardUntil.current = Date.now() + CLICK_GUARD_MS;
      last = key;
      host.layout(size);
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host]);
  // Appearing is a change too (the pointer may have just come onto the card).
  useEffect(() => { if (expanded) guardUntil.current = Math.max(guardUntil.current, Date.now() + CLICK_GUARD_MS); }, [expanded]);

  const run = (command: CallCommand) => { if (Date.now() >= guardUntil.current) host.run(command); };

  const handlers: CardShell["handlers"] = {
    onPointerEnter: () => setDomInside(true),
    onPointerLeave: () => setDomInside(false),
    onPointerDown(event) {
      dragged.current = false;
      const target = event.target as Element;
      // A press anywhere in the card but in an open panel or on what opens it closes the panel.
      if (panel && !target.closest(".card-panel, .card-title, .card-devices")) setPanel(null);
      // Dragging from anywhere but a button (the title counts as card): past the threshold it moves the window.
      if (event.button > 0 || target.closest("button:not(.card-title)")) return;
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
        event.currentTarget.setPointerCapture?.(event.pointerId);
        host.drag("start");
      }
      host.drag("move");
    },
    onPointerUp() {
      const d = drag.current;
      drag.current = null;
      if (d?.moving) host.drag("end");
    },
    onPointerCancel() {
      const d = drag.current;
      drag.current = null;
      if (d?.moving) host.drag("end");
    },
    onClickCapture(event) {
      if (dragged.current) { event.stopPropagation(); event.preventDefault(); dragged.current = false; }
    },
  };
  return { card, panel, setPanel, expanded, run, handlers };
}

/** A device as the card words it: a real device keeps its own name; the system's choice, an unnamed device and a
 *  chosen device that went away are said in the card's words. */
function deviceName(option: AudioDeviceOption, kind: "input" | "output", t: Translate): string {
  if (option.system) return t("card.systemDefault");
  if (option.missing) return t("card.deviceMissing");
  if (option.number) return t(kind === "input" ? "card.microphoneNumber" : "card.speakerNumber", { n: option.number });
  return option.label;
}

export function DevicePicker({ call, run, t }: { call: CallSnapshot; run: (command: CallCommand) => void; t: Translate }) {
  const [open, setOpen] = useState<"input" | "output" | null>(null);
  const [asked, setAsked] = useState<{ kind: "input" | "output"; id: string } | null>(null);
  const devices = call.devices;
  // The room changes devices and says no by keeping the one it had: the card says so once the room has answered.
  const failed = !!asked && !!devices && !devices.busy && (asked.kind === "input" ? devices.inputId : devices.outputId) !== asked.id;
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
export function ConversationPicker({ call, disabled, onSelect, t }: { call: CallSnapshot; disabled(row: ParticipantView): boolean; onSelect(threadId: string): void; t: Translate }) {
  return (
    <div className="card-panel conversations" aria-label={t("card.conversations")}>
      <ConversationRows
        className="card-conversations"
        rows={call.participants}
        disabled={disabled}
        onSelect={onSelect}
        sub={(row) => conversationSub(row, t)}
        aside={(row) => (row.unread && !row.selected ? <span className="card-badge" aria-label={t("card.unread", { n: row.unread })}>{row.unread}</span> : null)}
      />
    </div>
  );
}
