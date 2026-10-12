import { useId } from "react";
import { Button } from "../../components/ui/Button";
import { MicrophoneIcon, MicrophoneOffIcon, SpeakerIcon, SpeakerOffIcon, VoiceIcon, WarningIcon } from "../../components/ui/Icons";
import { cn } from "../../lib/cn";
import { wantToTalk } from "../../state/room-session-state.js";
import { useRoomStore } from "../../state/room-store";
import { callTranslator } from "./call-i18n";
import { useMicSilent } from "./CallIndicators";
import { voiceMicReason, voiceNote, voiceNoteText, voicePosition, waitingBadge } from "./voice-view";

/* Call model B's controls in the call bar (VARIANTS `call-model`; briefs/CALL-MODEL-B-SPEC.md §2.2–2.5): the voice
 * switch in the call's slot, its note above it, the microphone with a name that never flips, and Mute agents with the
 * count of conversations that want to talk. Each paints the session store; the runtime acts (window.sidevoiceActions). */

/** The voice switch (§2.2): a switch named "Voice" in every state, its visible label the same (a phone shows only its
 *  icon). Purple while off, neutral while on — never red, never a handset; while it turns on it is checked and busy, a
 *  spinner on its icon, and pressing it cancels. A reconnection never touches it: the line above the bar says that. */
export function VoiceSwitch() {
  const t = callTranslator();
  const position = useRoomStore((state) => voicePosition(state.facts));
  const tip = position === "off" ? t("voice.tip.off") : position === "starting" ? t("voice.tip.starting") : t("voice.tip.on");
  return (
    <button id="voice-switch" type="button" role="switch" className="voice-switch" data-position={position}
      aria-checked={position !== "off"} aria-busy={position === "starting" || undefined} title={tip}
      onClick={() => void window.sidevoiceActions?.setVoice?.(position === "off")}>
      <span className="voice-switch-icon">
        <VoiceIcon size={22} />
        {position === "starting" && <span className="voice-switch-spinner" aria-hidden="true" />}
      </span>
      <span className="voice-switch-label">{t("voice.switch")}</span>
    </button>
  );
}

/** The note anchored above the switch (§2.3): why the voice turned itself off, until it is on again, or the idle
 *  warning with "Keep voice on". One at a time; never when the person turned the voice off. It comes right before the
 *  switch, so Tab reaches "Keep voice on" just before Voice. The failures the person must act on are alerts. When the
 *  agents were muted by a lost speaker too (both of a headset gone at once), that note is a line of this one: two boxes
 *  would cover each other above the bar. */
export function VoiceNote() {
  const t = callTranslator();
  // The facts, not the note: a selector must give the same value for the same state.
  const facts = useRoomStore((state) => state.facts);
  const note = voiceNote(facts);
  const detail = facts.voiceOffDetail;
  if (!note) return null;
  const outputLost = facts.agentsMuted && facts.agentsMutedBy === "output-lost";
  return (
    <span className="voice-note" role={note.role} data-kind={note.kind}>
      <WarningIcon size={14} />
      <span className="voice-note-body">
        <span>{voiceNoteText(note.kind, detail, t)}</span>
        {note.kind === "idle-warning" && <Button variant="ghost" tone="neutral" size="sm" className="voice-note-keep"
          onClick={() => window.sidevoiceActions?.keepVoiceOn?.()}>{t("voice.idle.keep")}</Button>}
        {outputLost && <span className="voice-note-also">{t("agents.outputLost")}</span>}
      </span>
    </span>
  );
}

/** The microphone in call model B (§2.4): "Mute microphone" in every state, pressed while muted, its icon flipping.
 *  With the voice off it sets the preference. When it cannot be used it says why, and stays where Tab finds it. */
export function VoiceMuteButton() {
  const t = callTranslator();
  const facts = useRoomStore((state) => state.facts);
  const participants = useRoomStore((state) => state.participants);
  const holding = useRoomStore((state) => state.mic.holding);
  const silent = useMicSilent();
  const reasonId = useId();
  const pressed = facts.micEnabled === false;
  const reason = voiceMicReason(facts, participants, t);
  // Unusable, it is blocked rather than disabled (the design system's Button): focusable, aria-disabled, its reason read.
  return (
    <>
      <Button id="mute" variant="ghost" className={cn("call-button", holding && "holding")} aria-label={t("mic.mute")}
        title={reason ?? silent ?? t("mic.tip")} aria-description={!reason && silent ? silent : undefined}
        disabled={!!reason} blockedBy={reason ? reasonId : undefined}
        data-silent={silent ? true : undefined} aria-pressed={pressed} aria-keyshortcuts="Meta+D Control+D"
        onClick={() => window.sidevoiceActions?.toggleMic()}>
        {pressed ? <MicrophoneOffIcon size={22} /> : <MicrophoneIcon size={22} />}
      </Button>
      <span id={reasonId} hidden>{reason}</span>
    </>
  );
}

/** Mute agents (§2.5): a toggle right after the microphone. Pressed, what plays stops and the agents answer in
 *  writing; its badge counts the conversations, on every machine, that have a mark and can be reached. Muted because the
 *  speaker went away, a note above it says so until the person unmutes. Kept for the tab. */
export function MuteAgentsButton() {
  const t = callTranslator();
  const muted = useRoomStore((state) => state.facts.agentsMuted);
  // Said above the voice switch instead while that one has a note of its own (VoiceNote).
  const outputLost = useRoomStore((state) => state.facts.agentsMuted && state.facts.agentsMutedBy === "output-lost" && !voiceNote(state.facts));
  const waiting = useRoomStore((state) => wantToTalk(state.participants));
  const count = muted ? waiting : 0;
  const waitingText = count ? t(count === 1 ? "agents.waiting.one" : "agents.waiting.other", { n: count }) : null;
  const tip = muted ? [t("agents.tip.muted"), waitingText].filter(Boolean).join(". ") : t("agents.tip.audible");
  return (
    <span className="mute-agents-wrap">
      {outputLost && <span className="voice-note agents-note" role="status"><WarningIcon size={14} /><span>{t("agents.outputLost")}</span></span>}
      <Button id="mute-agents" variant="ghost" className="call-button" aria-label={t("agents.mute")} aria-pressed={muted}
        aria-description={waitingText ?? undefined} title={tip} data-muted={muted || undefined}
        onClick={() => window.sidevoiceActions?.setAgentsMuted?.(!muted)}>
        {muted ? <SpeakerOffIcon size={22} /> : <SpeakerIcon size={22} />}
        {count > 0 && <span className="mute-agents-badge" aria-hidden="true">{waitingBadge(count)}</span>}
      </Button>
    </span>
  );
}
