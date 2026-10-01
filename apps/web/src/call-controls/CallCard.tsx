/* The desktop app's call controls card (sidevoice/sidevoice-desktop#4): a compact call surface that floats over the
 * person's other apps while the room's window is not in front.
 *
 * At rest, one row: the agent (the avatar, which shows only what the agent is doing), the conversation and who is on
 * it, and your microphone (the wave, which shows only you). Near the pointer, without growing wider, it offers the
 * rest: the title becomes the conversation picker, "open Sidevoice" appears beside your wave, and the room's call
 * controls appear below. Panels open below the controls and close by themselves. */
import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { ChevronIcon, HangupIcon, HARNESS_NAMES, HarnessIcon, MachinesIcon, MicrophoneIcon, MicrophoneOffIcon, OpenAppIcon, SkipIcon, SpeakerIcon } from "../components/ui/Icons";
import { ParticipantList } from "../features/room/ParticipantList";
import { RoomStoreContext, type RoomStore } from "../state/room-store";
import type { CallCommand, CallControlsHost, CallControlsState, CallSnapshot } from "./host";
import type { Translate } from "./i18n";

/** Space around the card inside its window, for its shadow. */
export const CARD_MARGIN = 12;
/** Before the controls show on hover, and before they hide once the pointer leaves. */
export const SHOW_DELAY_MS = 120;
export const HIDE_DELAY_MS = 500;
/** A panel left open closes this long after the pointer leaves. */
export const PANEL_CLOSE_MS = 2500;
/** Right after the controls appear (the card may just have moved under the pointer) their buttons ignore clicks. */
export const CLICK_GUARD_MS = 350;
/** More than this many pixels between pressing and releasing is a drag, not a click. */
export const DRAG_THRESHOLD_PX = 4;

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

/** Your microphone: the last five levels, as the room's own meter draws them; flat and crossed out when muted. */
function YourWave({ levels, muted, still, t }: { levels: number[]; muted: boolean; still: boolean; t: Translate }) {
  return (
    <span className="your-wave" data-muted={muted || undefined} data-still={still || undefined} role="img"
      aria-label={muted ? t("card.youAreMuted") : t("card.yourMicrophone")}>
      {levels.map((level, i) => <i key={i} style={{ height: muted || still ? undefined : Math.max(3, Math.round(level * 0.16)) + "px" }} />)}
    </span>
  );
}

/** A store with just what ParticipantList reads (`participants`), fed from the call the app relays. */
function participantsStore(call: CallSnapshot): RoomStore {
  const state = { participants: call.participants };
  return { getState: () => state, getInitialState: () => state, subscribe: () => () => {} } as unknown as RoomStore;
}

function DevicePicker({ call, run, t }: { call: CallSnapshot; run: (command: CallCommand) => void; t: Translate }) {
  const [open, setOpen] = useState<"input" | "output" | null>(null);
  const devices = call.devices;
  if (!devices) return null;
  const rows: { kind: "input" | "output"; label: string; Icon: typeof MicrophoneIcon; options: { id: string; label: string }[]; current: string; usable: boolean }[] = [
    { kind: "input", label: t("card.microphone"), Icon: MicrophoneIcon, options: devices.inputs, current: devices.inputId, usable: devices.available },
    { kind: "output", label: t("card.speaker"), Icon: SpeakerIcon, options: devices.outputs, current: devices.outputId, usable: devices.available && devices.outputAvailable },
  ];
  // The room names the system's choice in its own words; here it is the card's.
  const name = (option: { id: string; label: string }) => (option.id === "default" ? t("card.systemDefault") : option.label);
  return (
    <div className="card-panel devices" role="group" aria-label={t("card.devices")}>
      {rows.filter((row) => row.usable).map((row) => {
        const current = row.options.find((option) => option.id === row.current);
        return (
          <div key={row.kind}>
            <button type="button" className="device-row" aria-expanded={open === row.kind} disabled={devices.busy}
              onClick={() => setOpen(open === row.kind ? null : row.kind)}>
              <row.Icon size={15} /><span className="device-kind">{row.label}</span>
              <span className="device-current">{current ? name(current) : t("card.systemDefault")}</span><ChevronIcon size={14} />
            </button>
            {open === row.kind && (
              <div className="device-options" role="listbox" aria-label={row.label}>
                {row.options.map((option) => (
                  <button type="button" role="option" key={option.id} aria-selected={option.id === row.current}
                    className="device-option" onClick={() => { setOpen(null); run({ command: "select-audio-device", kind: row.kind, id: option.id }); }}>
                    <span className="check" aria-hidden="true">{option.id === row.current ? "✓" : ""}</span>{name(option)}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function CallCard({ host, t }: { host: CallControlsHost; t: Translate }) {
  const state = useHostState(host);
  const card = useRef<HTMLDivElement>(null);
  const now = useNow(1000);
  const [domInside, setDomInside] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [levels, setLevels] = useState<number[]>([0, 0, 0, 0, 0]);
  const shownAt = useRef(0);
  const drag = useRef<{ x: number; y: number; moving: boolean; id: number } | null>(null);
  const dragged = useRef(false);

  const call = state?.call;
  const inside = state?.pointerInside ?? domInside;
  const hovered = useDelayed(inside, SHOW_DELAY_MS, HIDE_DELAY_MS);
  const expanded = !!state && (state.alwaysExpanded || hovered || panel !== null);

  // The wave keeps the last five levels, as the room's meter does.
  const level = state?.level ?? 0;
  useEffect(() => { setLevels((previous) => [...previous.slice(1), level]); }, [level]);

  useEffect(() => { if (expanded) shownAt.current = Date.now(); }, [expanded]);

  // A panel left open closes once the pointer has been away a while.
  useEffect(() => {
    if (!panel || inside) return;
    const timer = setTimeout(() => setPanel(null), PANEL_CLOSE_MS);
    return () => clearTimeout(timer);
  }, [panel, inside]);

  // The window is the card's size, margin included: the app sizes it to what is shown.
  useEffect(() => {
    const element = card.current;
    if (!element) return;
    const report = () => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height) return; // just removed: the card is not shown, nothing to size
      host.layout({ width: Math.ceil(box.width) + 2 * CARD_MARGIN, height: Math.ceil(box.height) + 2 * CARD_MARGIN });
    };
    report();
    const observer = new ResizeObserver(report);
    observer.observe(element);
    return () => observer.disconnect();
  }, [host, !!call?.joined]);

  const store = useMemo(() => (call ? participantsStore(call) : null), [call]);
  // ParticipantList switches through the room's own action; here the action travels to the room through the app.
  useEffect(() => {
    window.sidevoiceActions = { selectParticipant: (threadId: string) => { setPanel(null); host.run({ command: "select-participant", threadId }); } } as unknown as typeof window.sidevoiceActions;
  }, [host]);

  if (!state || !call || !call.joined) return null;

  const muted = !call.micEnabled;
  const reconnecting = call.busy;
  const agent = reconnecting ? "reconnecting" : call.agent;
  const selected = call.participants.find((participant) => participant.selected);
  const harness = selected?.harness && HARNESS_NAMES[selected.harness] ? selected.harness : null;
  const guard = () => Date.now() - shownAt.current < CLICK_GUARD_MS;
  const run = (command: CallCommand) => { if (!guard()) host.run(command); };
  const muteLabel = muted ? t("card.unmute") : t("card.mute");

  // Dragging from anywhere but a button (the title counts as card): past the threshold it moves the window.
  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    dragged.current = false;
    if (event.button > 0 || (event.target as Element).closest("button:not(.card-title)")) return;
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
      host.drag("start", d.x, d.y);
    }
    host.drag("move", event.screenX, event.screenY);
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    drag.current = null;
    if (d?.moving) host.drag("end", event.screenX, event.screenY);
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
          </button>
          {reconnecting
            ? <span className="card-sub reconnecting">{t("card.reconnecting")}</span>
            : <span className="card-sub">{[
                selected?.machine && <span key="machine" className="card-machine"><MachinesIcon size={11} /> {selected.machine}</span>,
                harness && <span key="harness" className="card-harness"><HarnessIcon harness={harness} size={11} /> {HARNESS_NAMES[harness]}</span>,
                call.since && <span key="clock" className="card-clock">{duration(call.since, now)}</span>,
              ].filter(Boolean).flatMap((part, i) => (i ? [<span key={"dot" + i} aria-hidden="true">·</span>, part] : [part]))}</span>}
        </div>
        <button type="button" className="card-open" title={t("card.openApp")} aria-label={t("card.openApp")} onClick={() => run({ command: "open-app" })}>
          <OpenAppIcon size={15} />
        </button>
        <YourWave levels={levels} muted={muted} still={reconnecting} t={t} />
      </div>

      {panel === "conversations" && store && (
        <div className="card-panel conversations" aria-label={t("card.conversations")}>
          <RoomStoreContext.Provider value={store}><ParticipantList menu={false} /></RoomStoreContext.Provider>
        </div>
      )}

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

      {panel === "devices" && <DevicePicker call={call} run={(command) => { setPanel(null); run(command); }} t={t} />}
    </div>
  );
}
