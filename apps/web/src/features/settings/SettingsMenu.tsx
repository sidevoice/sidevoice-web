import type { ButtonHTMLAttributes, ReactNode } from "react";
import { OpenPageIcon } from "../../components/ui/Icons";
import { cn } from "../../lib/cn";

/* A row of a phone's Settings menu (settings-levels.tsx): its icon (with the "new" mark on it), its label over a line
 * that says how it stands, what it carries (a badge, "New"), and a chevron when it opens a page of its own. Read in that
 * order: the label, the line, the badge's words, then "new" when something new is under it; the icon and the chevron are
 * not read. A row with a line keeps it, blank until there is something to say, so nothing moves under a finger when it
 * arrives. */
export function MenuRow({ icon, label, summary, badge, end, chevron = true, className, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & {
  icon: ReactNode;
  label: ReactNode;
  /** The line under the label; absent for a row that has none (a section of preferences rather than of a state). */
  summary?: ReactNode;
  badge?: ReactNode;
  /** After the badge: what is new under it ("New", or its words to a screen reader; its mark is on the icon). */
  end?: ReactNode;
  /** Off for a row that opens a dialog rather than a page (Add a machine). */
  chevron?: boolean;
}) {
  return (
    <button type="button" {...props} className={cn("settings-menu-row", className)} data-lines={summary === undefined ? undefined : 2}>
      <span className="settings-menu-icon" aria-hidden="true">{icon}</span>
      <span className="settings-menu-text">
        <span className="settings-menu-label">{label}</span>
        {summary !== undefined && <span className="settings-menu-summary">{summary}</span>}
      </span>
      {badge}
      {end}
      {chevron && <span className="settings-menu-chevron" aria-hidden="true"><OpenPageIcon /></span>}
    </button>
  );
}
