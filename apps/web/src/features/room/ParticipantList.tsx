import { Button } from "../../components/ui/Button";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { HARNESS_NAMES, HarnessIcon, MachinesIcon, MoreIcon } from "../../components/ui/Icons";
import { useRoomStore } from "../../state/room-store";
import { ConversationRows } from "./ConversationRows";

/** The room's conversations, in its sidebar: the shared rows with the room's own line under each and its options menu. */
export function ParticipantList() {
  const participants = useRoomStore((state) => state.participants);
  return (
    <ConversationRows
      id="participants"
      rows={participants}
      onSelect={(threadId) => window.sidevoiceActions?.selectParticipant(threadId)}
      tooltip={(participant) => (participant.detail ? participant.title + "\n\n" + participant.detail : participant.title)}
      sub={(participant) => (
        <span title={participant.activityNote || undefined}>
          {participant.machine && <span className="person-machine"><MachinesIcon size={12} /> {participant.machine}</span>}{participant.harness && HARNESS_NAMES[participant.harness] && <span className="person-harness"><HarnessIcon harness={participant.harness} /> {HARNESS_NAMES[participant.harness]}{participant.route ? ` · ${participant.route}` : ""}</span>}{(participant.machine || participant.harness) && participant.subtitle ? " · " : ""}{participant.subtitle}
        </span>
      )}
      aside={(participant) => (
        <DropdownMenu label={`Opciones de ${participant.title}`} trigger={<Button variant="ghost" size="icon" className="participant-more" aria-label={`Opciones de ${participant.title}`}><MoreIcon /></Button>}>
          <DropdownMenuItem danger onSelect={() => void window.sidevoiceActions?.closeParticipant(participant.threadId)}>Cerrar conversación</DropdownMenuItem>
        </DropdownMenu>
      )}
    />
  );
}
