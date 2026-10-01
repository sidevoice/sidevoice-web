/* The desktop app's call controls card (sidevoice/sidevoice-desktop#4): a compact call surface that floats over the
 * person's other apps while the room's window is not in front.
 *
 * At rest, one row: the agent (the avatar, which shows only what the agent is doing), the conversation the call is on
 * and who is on it, and your microphone (the wave, which shows only you). Near the pointer, without growing wider and
 * without moving anything, it offers the rest: the title becomes the conversation picker, "open Sidevoice" appears in
 * the slot kept for it beside your wave, and the room's call controls appear below. Panels open below the controls
 * and close by themselves. */
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronIcon, HangupIcon, HARNESS_NAMES, HarnessIcon, MachinesIcon, MicrophoneIcon, MicrophoneOffIcon, OpenAppIcon, SkipIcon, SpeakerIcon } from "../components/ui/Icons";
import { ConversationRows } from "../features/room/ConversationRows";
import type { AudioDeviceOption } from "../state/room-session-state";
import type { ParticipantView } from "../state/room-types";
import type { CallCommand, CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import type { Translate } from "./i18n";

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

type Panel = "conversations" | "devices" | null;

/** The latest state the app sent, null until the first. */
function useHostState(host: CallControlsHost): CallControlsState | null {
  const [state, setState] = useState<CallControlsState | null>(null);
  useEffect(() => host.subscribe(setState), [host]);
  return state;
}

/** `value`, but turning on only after `onDelay` and off only after `offDelay`. */
function useDelayed(value: boolean, onDelay: number, offDelay: number): boolean {
  const [shown, setShown] = useState(value);
  useEffect(() => {
    if (value === shown) return;
    const timer = setTimeout(() => setShown(value), value ? onDelay : offDelay);
    return () => clearTimeout(timer);
  }, [value, shown, onDelay, offDelay]);
  return shown;
}

function useNow(every: number): number {
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

/** The brand mark, whose bars move with what the agent does (the mustard fourth bar is the agent's voice). */
function AgentMark({ state }: { state: string }) {
  return (
    <svg className="agent-mark" data-state={state} viewBox="0 0 24 24" aria-hidden="true">
      <rect className="b1" x="1.5" y="9" width="3" height="6" rx="1.5" />
      <rect className="b2" x="6" y="6" width="3" height="12" rx="1.5" />
      <rect className="b3" x="10.5" y="1.5" width="3" height="21" rx="1.5" />
      <rect className="b4" x="15" y="6" width="3" height="12" rx="1.5" />
      <rect className="b5" x="19.5" y="9" width="3" height="6" rx="1.5" />
    </svg>
  );
}

/** Your microphone: the last samples of its level, as the room's own meter draws them; flat and crossed out when
 *  muted, flat while reconnecting. */
function YourWave({ levels, muted, still, t }: { levels: number[]; muted: boolean; still: boolean; t: Translate }) {
  return (
    <span className="your-wave" data-muted={muted || undefined} data-still={still || undefined} role="img"
      aria-label={muted ? t("card.youAreMuted") : t("card.yourMicrophone")}>
      {levels.map((level, i) => <i key={i} style={{ height: muted || still ? undefined : Math.max(3, Math.round(level * 0.16)) + "px" }} />)}
    </span>
  );
}

/** The level's last samples, taken every WAVE_SAMPLE_MS whatever arrives (the room sends a level only when it
 *  changes), so silence drains the wave instead of freezing old peaks. Muted, it is flat and starts over. */
function useWave(level: number, muted: boolean): number[] {
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

/** A device as the card words it: a real device keeps its own name; the system's choice, an unnamed device and a
 *  chosen device that went away are said in the card's words. */
function deviceName(option: AudioDeviceOption, kind: "input" | "output", t: Translate): string {
  if (option.system) return t("card.systemDefault");
  if (option.missing) return t("card.deviceMissing");
  if (option.number) return t(kind === "input" ? "card.microphoneNumber" : "card.speakerNumber", { n: option.number });
  return option.label;
}

function DevicePicker({ call, run, t }: { call: CallSnapshot; run: (command: CallCommand) => void; t: Translate }) {
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
  const harness = row.harness && HARNESS_NAMES[row.harness] ? row.harness : null;
  const reach = row.reach === "holding" ? t("card.reach.holding") : row.reach === "offline" || !row.available ? t("card.reach.offline") : null;
  return (
    <>
      {row.machine && <span className="person-machine"><MachinesIcon size={11} /> {row.machine}</span>}
      {harness && <span className="person-harness"><HarnessIcon harness={harness} size={11} /> {HARNESS_NAMES[harness]}</span>}
      {reach && <span className="person-reach"> · {reach}</span>}
    </>
  );
}

export function CallCard({ host, t }: { host: CallControlsHost; t: Translate }) {
  const state = useHostState(host);
  if (!state || !state.call.joined) return null;
  // Each call gets a card of its own: nothing of the last one (a panel, the wave, a drag) carries over.
  return <ActiveCard key={state.call.since ?? "call"} host={host} state={state} t={t} />;
}

function ActiveCard({ host, state, t }: { host: CallControlsHost; state: CallControlsState; t: Translate }) {
  const call = state.call;
  const card = useRef<HTMLDivElement>(null);
  const now = useNow(1000);
  const [domInside, setDomInside] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const guardUntil = useRef(0);
  const drag = useRef<{ x: number; y: number; moving: boolean; id: number } | null>(null);
  const dragged = useRef(false);

  const muted = !call.micEnabled;
  const reconnecting = call.busy;
  const inside = state.pointerInside ?? domInside;
  const hovered = useDelayed(inside, SHOW_DELAY_MS, HIDE_DELAY_MS);
  const expanded = state.alwaysExpanded || hovered || panel !== null;
  const levels = useWave(state.level, muted);

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

  const selected = call.participants.find((participant) => participant.selected);
  const harness = selected?.harness && HARNESS_NAMES[selected.harness] ? selected.harness : null;
  const agent = reconnecting ? "reconnecting" : call.agent;
  const run = (command: CallCommand) => { if (Date.now() >= guardUntil.current) host.run(command); };
  const muteLabel = muted ? t("card.unmute") : t("card.mute");
  const unreadElsewhere = call.participants.reduce((n, row) => n + (row.selected ? 0 : row.unread || 0), 0);

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    const target = event.target as Element;
    // A press anywhere in the card but in an open panel or on what opens it closes the panel.
    if (panel && !target.closest(".card-panel, .card-title, .card-devices")) setPanel(null);
    // Dragging from anywhere but a button (the title counts as card): past the threshold it moves the window.
    if (event.button > 0 || target.closest("button:not(.card-title)")) return;
    drag.current = { x: event.screenX, y: event.screenY, moving: false, id: event.pointerId };
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
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
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moving) host.drag("end");
  };

  return (
    <div ref={card} className="call-card" data-expanded={expanded || undefined}
      onPointerEnter={() => setDomInside(true)} onPointerLeave={() => setDomInside(false)}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}
      onClickCapture={(event) => { if (dragged.current) { event.stopPropagation(); event.preventDefault(); dragged.current = false; } }}>
      <div className="card-row">
        <span className="card-avatar" data-state={agent} role="img" aria-label={reconnecting ? t("card.reconnecting") : t(`card.agent.${call.agent}`)}>
          <AgentMark state={agent} />
        </span>
        <div className="card-who">
          <button type="button" className="card-title" aria-expanded={panel === "conversations"} title={t("card.switchConversation")}
            onClick={() => setPanel(panel === "conversations" ? null : "conversations")}>
            <span className="card-title-text">{call.title}</span>
            <span className="card-title-chevron" aria-hidden="true"><ChevronIcon size={13} /></span>
            {unreadElsewhere > 0 && <span className="card-unread" aria-label={t("card.unread", { n: unreadElsewhere })} />}
          </button>
          {reconnecting
            ? <span className="card-sub reconnecting">{t("card.reconnecting")}</span>
            : <span className="card-sub">{[
                selected?.machine && <span key="machine" className="card-machine"><MachinesIcon size={11} /> <span>{selected.machine}</span></span>,
                harness && <span key="harness" className="card-harness"><HarnessIcon harness={harness} size={11} /> <span>{HARNESS_NAMES[harness]}</span></span>,
                call.since && <span key="clock" className="card-clock">{duration(call.since, now)}</span>,
              ].filter(Boolean).flatMap((part, i) => (i ? [<span key={"dot" + i} aria-hidden="true">·</span>, part] : [part]))}</span>}
        </div>
        <button type="button" className="card-open" title={t("card.openApp")} aria-label={t("card.openApp")} tabIndex={expanded ? 0 : -1}
          onClick={() => run({ command: "open-app" })}>
          <OpenAppIcon size={15} />
        </button>
        <YourWave levels={levels} muted={muted} still={reconnecting} t={t} />
      </div>

      {expanded && (
        <div className="card-controls">
          <span className="card-mic" data-muted={muted || undefined}>
            <button type="button" className="card-devices" aria-expanded={panel === "devices"} title={t("card.devices")} aria-label={t("card.devices")}
              onClick={() => setPanel(panel === "devices" ? null : "devices")} disabled={!call.devices}>
              <ChevronIcon size={13} />
            </button>
            <button type="button" className="card-mute" aria-pressed={muted} disabled={call.micDisabled || reconnecting}
              title={state.muteShortcut ? t("card.shortcut", { action: muteLabel, shortcut: state.muteShortcut }) : muteLabel} aria-label={muteLabel}
              onClick={() => run({ command: "toggle-mute" })}>
              {muted ? <MicrophoneOffIcon size={17} /> : <MicrophoneIcon size={17} />}
            </button>
          </span>
          <button type="button" className="card-skip" disabled={!call.canSkip} title={t("card.skip")} aria-label={t("card.skip")} onClick={() => run({ command: "skip-reply" })}>
            <SkipIcon size={17} />
          </button>
          <button type="button" className="card-hangup" title={t("card.hangUp")} aria-label={t("card.hangUp")} onClick={() => run({ command: "hang-up" })}>
            <HangupIcon size={18} />
          </button>
        </div>
      )}

      {panel === "conversations" && (
        <div className="card-panel conversations" aria-label={t("card.conversations")}>
          <ConversationRows
            className="card-conversations"
            rows={call.participants}
            // The call can only go to a conversation that is there; the room browses the others.
            disabled={(row) => row.switching || !row.available || row.reach === "offline"}
            onSelect={(threadId) => { setPanel(null); run({ command: "select-participant", threadId }); }}
            sub={(row) => conversationSub(row, t)}
            aside={(row) => (row.unread && !row.selected ? <span className="card-badge" aria-label={t("card.unread", { n: row.unread })}>{row.unread}</span> : null)}
          />
        </div>
      )}

      {panel === "devices" && <DevicePicker call={call} run={run} t={t} />}
    </div>
  );
}
