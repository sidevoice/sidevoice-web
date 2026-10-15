/* The desktop app's call controls card (sidevoice/sidevoice-desktop#4): a compact call surface that floats over the
 * person's other apps while the room's window is not in front.
 *
 * The host's state and the plumbing are card-shell.tsx.
 *
 * Today's card, at rest, is one row: the agent (the avatar, which shows only what the agent is doing), the conversation
 * the call is on and who is on it, and your microphone (the wave, which shows only you). Near the pointer, without
 * growing wider and without moving anything, it offers the rest: the title becomes the conversation picker, "open
 * Sidevoice" appears in the slot kept for it beside your wave, and the room's call controls appear below. Panels open
 * below the controls and close by themselves. */
import { ChevronIcon, HangupIcon, HarnessIcon, MachinesIcon, MicrophoneIcon, MicrophoneOffIcon, OpenAppIcon, SkipIcon } from "../components/ui/Icons";
import { ConversationPicker, DevicePicker, duration, useCardShell, useHostState, useNow, useWave } from "./card-shell";
import type { CallControlsHost, CallControlsState } from "./host";
import type { Translate } from "../i18n/translator";
import type { CSSProperties } from "react";
import { useVariant } from "../lib/variants";
import { avatarFor, avatarTone } from "../features/avatar/avatar-spec";
import { avatarColor } from "../features/avatar/bicho-draw";
import { CharacterAvatar } from "../features/avatar/CharacterAvatar";

export { CARD_MARGIN, CLICK_GUARD_MS, DRAG_THRESHOLD_PX, HIDE_DELAY_MS, PANEL_CLOSE_MS, SHOW_DELAY_MS, WAVE_SAMPLE_MS, duration } from "./card-shell";

/** What the avatar says of the agent: its state's words, or — a state this version does not know (sidevoice-core#112) —
 *  only that it is the agent, never the raw key. */
function agentLabel(agent: unknown) {
  return agent === "idle" ? "card.agent.idle" as const : agent === "working" ? "card.agent.working" as const
    : agent === "speaking" ? "card.agent.speaking" as const : "card.agent.unknown" as const;
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

/* The card's look, compared on the live page (lib/variants.ts; briefs/plans/floating-cards-options.md): today's, or
 * "sticker" — option A, drawn as the stage's balloon and the bichos are (paper and their ink in any theme, uneven
 * corners, a soft shadow), with the conversation's own bicho in the avatar's place. Behaviour is the same. The desktop
 * app has no panel, so it shows today's until one is chosen. */
const LOOKS = ["today", "sticker"] as const;

/** The conversation's bicho, as small as the sidebar's, acting out what the agent does (reconnecting: at rest). */
function AgentBicho({ threadId, agent }: { threadId: string; agent: string }) {
  const spec = avatarFor(threadId);
  const mood = agent === "working" || agent === "speaking" ? agent : "idle";
  return <span className="card-bicho" style={avatarTone(avatarColor(spec)) as CSSProperties}><CharacterAvatar spec={spec} mood={mood} size="small" /></span>;
}

export function CallCard({ host, t }: { host: CallControlsHost; t: Translate }) {
  const state = useHostState(host);
  if (!state) return null;
  if (!state.call.joined) return null;
  // Each call gets a card of its own: nothing of the last one (a panel, the wave, a drag) carries over.
  return <TodayCard key={state.call.since ?? "call"} host={host} state={state} t={t} />;
}

function TodayCard({ host, state, t }: { host: CallControlsHost; state: CallControlsState; t: Translate }) {
  const call = state.call;
  const now = useNow(1000);
  const shell = useCardShell(host, state);
  const { panel, setPanel, expanded, run } = shell;

  const muted = !call.micEnabled;
  const reconnecting = call.busy;
  const levels = useWave(state.level, muted);

  const selected = call.participants.find((participant) => participant.selected);
  const agent = reconnecting ? "reconnecting" : call.agent;
  const muteLabel = muted ? t("card.unmute") : t("card.mute");
  const look = useVariant("floatingCard", LOOKS);
  const unreadElsewhere = call.participants.reduce((n, row) => n + (row.selected ? 0 : row.unread || 0), 0);

  return (
    <div ref={shell.card} className="call-card" data-look={look} data-expanded={expanded || undefined} {...shell.handlers}>
      <div className="card-row">
        <span className="card-avatar" data-state={agent} role="img" aria-label={reconnecting ? t("card.reconnecting") : t(agentLabel(call.agent))}>
          {look === "sticker" && selected ? <AgentBicho threadId={selected.threadId} agent={agent} /> : <AgentMark state={agent} />}
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
                (selected?.harness || selected?.model) && <span key="harness" className="card-harness">{selected?.harness && <HarnessIcon harness={selected.harness} size={11} />} <span>{[selected?.model, selected?.effort].filter(Boolean).join(" · ")}</span></span>,
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
            <button type="button" className="card-mute" aria-pressed={muted} disabled={call.micDisabled}
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
        <ConversationPicker call={call} t={t}
          // The call can only go to a conversation that is there; the room browses the others.
          disabled={(row) => row.switching || !row.available || row.reach === "offline"}
          onSelect={(threadId) => { setPanel(null); run({ command: "select-participant", threadId }); }} />
      )}

      {panel === "devices" && <DevicePicker call={call} run={run} t={t} />}
    </div>
  );
}
