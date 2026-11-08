import { Fragment, type ReactElement, type ReactNode } from "react";
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
  /** What holds the whole row: the room's context menu (its ⋯ options on the secondary click). */
  wrap?(row: ParticipantView, node: ReactElement): ReactNode;
  /** What closes the row itself, after its title, and chooses it like the rest of it: the room's unread badge. */
  end?(row: ParticipantView): ReactNode;
  /** The row's tooltip; its title by default. */
  tooltip?(row: ParticipantView): string;
  /** Spoken name for compact rows whose visible badges may be hidden in the rail. */
  label?(row: ParticipantView): string;
  /** What leads the row; by default its initials and its state dot. The room's sidebar gives each agent's avatar. */
  lead?(row: ParticipantView): ReactNode;
  id?: string;
  className?: string;
}

/** The conversations of the call, as rows to choose from: the room's sidebar (ConversationSidebar) and the desktop app's
 *  call controls card both show them through this, each with its own words, actions and styles. A row is a plain
 *  button, not the system's Button: it is a list entry laid out by whoever shows it, and its parts are its own children. */
export function ConversationRows({ rows, onSelect, sub, disabled = (row) => row.switching, aside, wrap = (_row, node) => node, end, tooltip = (row) => row.title, label, lead, id, className }: ConversationRowsProps) {
  return (
    <div id={id} className={className}>
      {rows.map((row) => <Fragment key={row.threadId}>{wrap(row,
        <div className="participant-row" data-thread={row.threadId} data-selected={row.selected || undefined}>
          <button
            type="button"
            className="person"
            data-reach={row.reach}
            aria-pressed={row.selected}
            disabled={disabled(row)}
            title={tooltip(row)}
            aria-label={label?.(row)}
            onClick={() => onSelect(row.threadId)}
          >
            {lead ? lead(row) : <><span className="person-initials" aria-hidden="true">{initials(row.title)}</span><span className="person-state" data-state={row.reach} data-working={row.working || undefined}><span className="dot" /></span></>}
            <span className="participant-copy"><span className="person-name" title={row.title} translate="no">{row.title}</span><span className="person-sub muted">{sub(row)}</span></span>
            {end?.(row)}
          </button>
          {aside?.(row)}
        </div>)}</Fragment>)}
    </div>
  );
}
