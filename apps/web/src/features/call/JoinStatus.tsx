import { useRoomStore } from "../../state/room-store";
import { WarningIcon } from "../../components/ui/Icons";

/**
 * The single line that accompanies a join: one step at a time, above the call controls, where the
 * person just tapped. It disappears the moment the call is up, and a failure stays in its place
 * with what to do about it. The download modal is a different thing: it belongs to the long steps.
 * Before any tap it can hold one standing note — no machine to talk to — which is not a step and
 * so has no progress dot. A failure carries a warning mark, so it does not rest on its colour alone.
 */
export function JoinStatus() {
  const join = useRoomStore((state) => state.join);
  return (
    <p
      id="join-status"
      className="join-status"
      role={join?.failed ? "alert" : "status"}
      aria-live="polite"
      data-state={join ? (join.failed ? "failed" : join.note ? "note" : "busy") : ""}
      hidden={!join}
    >
      {join ? (
        <>
          {join.failed ? <WarningIcon size={14} /> : join.note ? null : <i className="join-status-dot" aria-hidden="true" />}
          <span>{join.text}</span>
        </>
      ) : null}
    </p>
  );
}
