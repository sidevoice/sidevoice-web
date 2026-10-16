import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { ErrorDetails } from "./ErrorText";
import { CheckIcon, InfoIcon, WarningIcon } from "./Icons";

export type AlertTone = "accent" | "positive" | "warning" | "danger";

/* A message in the flow of the page: an icon, a title, a line of why, and at most one action. `live` for a failure
 * that just happened (read out at once); a standing notice is not. A failure's raw text, when it has any, is `details`:
 * closed behind "Details" under the rest (ErrorText.tsx), never the title. */
export function Alert({ tone = "accent", title, children, details, action, live = false, className, id }: { id?: string; tone?: AlertTone; title: ReactNode; children?: ReactNode; details?: string; action?: ReactNode; live?: boolean; className?: string }) {
  const Icon = tone === "positive" ? CheckIcon : tone === "accent" ? InfoIcon : WarningIcon;
  return (
    <div id={id} className={cn("ui-alert", className)} data-tone={tone} role={live ? "alert" : undefined}>
      <Icon />
      <div>
        <p className="ui-alert-title">{title}</p>
        {children && <p className="ui-alert-body">{children}</p>}
        <ErrorDetails details={details} />
      </div>
      {action ? <div className="ui-alert-action">{action}</div> : <span />}
    </div>
  );
}
