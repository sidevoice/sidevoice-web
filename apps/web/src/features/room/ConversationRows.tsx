import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import type { ParticipantView } from "../../state/room-types";

/** The shortest thing that still tells two conversations apart, for the narrow rail a phone gets. */
function initials(title: string) {
  const words = title.split(/[\s·—–-]+/).filter(Boolean);
  return (words.slice(0, 2).map((word) => word[0]).join("") || "?").toUpperCase();
}

export interface ConversationRowsProps {
  rows: ParticipantView[];
  onSelect(threadId: string): void;
  /** The line under each title. */
  sub(row: ParticipantView): ReactNode;
  /** Rows that cannot be chosen here; by default while the call is switching. */
  disabled?(row: ParticipantView): boolean;
  /** What goes beside a row: the room's options menu, the card's unread badge. */
  aside?(row: ParticipantView): ReactNode;
  /** The row's tooltip; its title by default. */
  tooltip?(row: ParticipantView): string;
  /** What leads the row; by default its initials and its state dot. The room's sidebar gives each agent's avatar. */
  lead?(row: ParticipantView): ReactNode;
  id?: string;
  className?: string;
}

/** The conversations of the call, as rows to choose from: the room's sidebar (ConversationSidebar) and the desktop app's
 *  call controls card both show them through this, each with its own words and actions. */
export function ConversationRows({ rows, onSelect, sub, disabled = (row) => row.switching, aside, tooltip = (row) => row.title, lead, id, className }: ConversationRowsProps) {
  return (
    <div id={id} className={className}>
      {rows.map((row) => (
        <div className="participant-row" data-selected={row.selected || undefined} key={row.threadId}>
          <Button
            variant="ghost"
            className="person"
            data-reach={row.reach}
            aria-pressed={row.selected}
            disabled={disabled(row)}
            title={tooltip(row)}
            onClick={() => onSelect(row.threadId)}
          >
            {lead ? lead(row) : <><span className="person-initials" aria-hidden="true">{initials(row.title)}</span><span className="person-state" data-state={row.reach} data-working={row.working || undefined} title={row.stateLabel}><span className="dot" /></span></>}
            <span className="participant-copy"><span className="person-name" title={row.title} translate="no">{row.title}</span><span className="person-sub muted">{sub(row)}</span></span>
          </Button>
          {aside?.(row)}
        </div>
      ))}
    </div>
  );
}
