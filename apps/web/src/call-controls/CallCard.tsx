/* The desktop app's call controls card (sidevoice/sidevoice-desktop#4): a compact call surface that floats over the
 * person's other apps while the room's window is not in front.
 *
 * Which card it is, is a design variant (VARIANTS `floating-card`, briefs/FLOATING-CARD-SPEC.md): today's card, the
 * default until the operator chooses — the desktop app has no panel, so it ships it —, or one of the spec's options 1–4
 * (FloatingCard.tsx). This file keeps what they share: the gate, the host's state and the plumbing (card-shell.tsx).
 *
 * Today's card, at rest, is one row: the agent (the avatar, which shows only what the agent is doing), the conversation
 * the call is on and who is on it, and your microphone (the wave, which shows only you). Near the pointer, without
 * growing wider and without moving anything, it offers the rest: the title becomes the conversation picker, "open
 * Sidevoice" appears in the slot kept for it beside your wave, and the room's call controls appear below. Panels open
 * below the controls and close by themselves. */
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronIcon, HangupIcon, HarnessIcon, MachinesIcon, MicrophoneIcon, MicrophoneOffIcon, OpenAppIcon, PowerIcon, SkipIcon, SpeakerIcon, SpeakerOffIcon } from "../components/ui/Icons";
import { useVariant } from "../lib/variants";
import { resolveTheme } from "../lib/theme";
import { ConversationPicker, DevicePicker, duration, useCardShell, useHostState, useNow, useWave } from "./card-shell";
import { exitText, FLOATING_CARD, gateOpen, isVoiceSwitch } from "./card-view";
import { FloatingCardBody } from "./FloatingCard";
import type { CallControlsHost, CallControlsState } from "./host";
import { cardLanguage, translator, type Translate } from "./i18n";

export { CARD_MARGIN, CLICK_GUARD_MS, DRAG_THRESHOLD_PX, HIDE_DELAY_MS, PANEL_CLOSE_MS, SHOW_DELAY_MS, WAVE_SAMPLE_MS, duration } from "./card-shell";

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

/** The call's exit notice (§2.1, O6): once the gate this card saw open closes by itself, why, until the person closes
 *  it or a new call or voice session opens the gate again. How long the card stays is its host's (the desktop's
 *  `wanted()`, FC7). */
function useExit(state: CallControlsState | null, open: boolean, t: Translate) {
  const seen = useRef<{ since: number | null } | null>(null);
  const [dismissed, setDismissed] = useState<{ since: number | null } | null>(null);
  if (state && open) seen.current = { since: state.call.since };
  const session = seen.current;
  const text = state && !open && session && dismissed !== session ? exitText(state.call, t) : null;
  return { text, since: session?.since ?? null, dismiss: () => setDismissed(session) };
}

export function CallCard({ host, t }: { host: CallControlsHost; t: Translate }) {
  const state = useHostState(host);
  const variant = useVariant("floating-card", FLOATING_CARD);
  const options = variant !== "today";
  // The options wear the room's theme and language (FC12): the system's where the host does not say them.
  const language = state?.call.language;
  const tc = useMemo(() => (options && language ? translator(cardLanguage([language])) : t), [options, language, t]);
  const theme = options ? state?.call.theme ?? resolveTheme("system") : null;
  useEffect(() => {
    const root = document.documentElement;
    if (theme) root.dataset.theme = theme; else delete root.dataset.theme;
    if (options && language) root.lang = cardLanguage([language]);
  }, [theme, options, language]);
  const open = !!state && (options ? gateOpen(state.call) : isVoiceSwitch(state.call) ? !!state.call.voiceOn : state.call.joined);
  const exit = useExit(state, open, tc);
  if (!state) return null;
  if (!options) {
    // With the voice switch (call model B) the card is there while the voice is on; the room's window says why it went off.
    if (!open) return null;
    // Each call gets a card of its own: nothing of the last one (a panel, the wave, a drag) carries over.
    return <TodayCard key={state.call.since ?? "call"} host={host} state={state} t={t} />;
  }
  if (!open && !exit.text) return null;
  return (
    <FloatingCardBody key={(open ? state.call.since : exit.since) ?? "call"} host={host} state={state} variant={variant} t={tc}
      exit={open ? null : exit.text} onDismiss={exit.dismiss} />
  );
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
  // With the voice switch the microphone keeps one name, its state pressed (call model B).
  const switching = isVoiceSwitch(call);
  const muteLabel = switching ? t("card.muteMic") : muted ? t("card.unmute") : t("card.mute");
  const agentsMuted = !!call.agentsMuted;
  const waiting = agentsMuted ? call.wantToTalk ?? 0 : 0;
  const waitingText = waiting ? t(waiting === 1 ? "card.waiting.one" : "card.waiting.other", { n: waiting }) : null;
  const unreadElsewhere = call.participants.reduce((n, row) => n + (row.selected ? 0 : row.unread || 0), 0);

  return (
    <div ref={shell.card} className="call-card" data-expanded={expanded || undefined} {...shell.handlers}>
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
          {switching && <button type="button" className="card-agents" aria-pressed={agentsMuted} title={[t("card.muteAgents"), waitingText].filter(Boolean).join(" · ")}
            aria-label={t("card.muteAgents")} aria-description={waitingText ?? undefined} onClick={() => run({ command: "toggle-agents" })}>
            {agentsMuted ? <SpeakerOffIcon size={17} /> : <SpeakerIcon size={17} />}
            {waiting > 0 && <span className="card-agents-badge" aria-hidden="true">{waiting > 9 ? "9+" : waiting}</span>}
          </button>}
          <button type="button" className="card-skip" disabled={!call.canSkip} title={t("card.skip")} aria-label={t("card.skip")} onClick={() => run({ command: "skip-reply" })}>
            <SkipIcon size={17} />
          </button>
          {switching
            ? <button type="button" className="card-voice-off" title={t("card.voiceOff")} aria-label={t("card.voiceOff")} onClick={() => run({ command: "voice-off" })}>
                <PowerIcon size={17} />
              </button>
            : <button type="button" className="card-hangup" title={t("card.hangUp")} aria-label={t("card.hangUp")} onClick={() => run({ command: "hang-up" })}>
                <HangupIcon size={18} />
              </button>}
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
