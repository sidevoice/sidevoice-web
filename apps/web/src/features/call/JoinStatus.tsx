import { useRoomStore } from "../../state/room-store";
import { WarningIcon } from "../../components/ui/Icons";
import { callTranslator } from "./call-i18n";
import { useVoiceSwitch } from "../../state/call-model";
import { voiceJoinLine } from "./voice-view";

/**
 * The single line that accompanies a join: one step at a time, above the call controls, where the
 * person just tapped. It disappears the moment the call is up, and a failure stays in its place
 * with what to do about it. The download modal is a different thing: it belongs to the long steps.
 * Before any tap it can hold one standing note — no machine to talk to — which is not a step and
 * so has no progress dot. A failure carries a warning mark, so it does not rest on its colour alone.
 * With the voice switch (call model B) there is no join: the line says the voice getting ready, a move to another
 * machine, a reconnection, the room's refusal and the standing note (voice-view.ts).
 */
export function JoinStatus() {
  const join = useRoomStore((state) => state.join);
  const voiceSwitch = useVoiceSwitch();
  // Only call model B reads the facts and the rows: A renders on the join alone.
  const facts = useRoomStore((state) => (voiceSwitch ? state.facts : null));
  const participants = useRoomStore((state) => (voiceSwitch ? state.participants : null));
  const line = facts && participants ? voiceJoinLine(facts, participants, callTranslator()) : join
    ? { text: join.text, state: join.failed ? "failed" as const : join.note ? "note" as const : "busy" as const } : null;
  return (
    <p
      id="join-status"
      className="join-status"
      role={line?.state === "failed" ? "alert" : "status"}
      aria-live="polite"
      data-state={line?.state ?? ""}
      hidden={!line}
    >
      {line ? (
        <>
          {line.state === "failed" ? <WarningIcon size={14} /> : line.state === "note" ? null : <i className="join-status-dot" aria-hidden="true" />}
          <span>{line.text}</span>
        </>
      ) : null}
    </p>
  );
}
