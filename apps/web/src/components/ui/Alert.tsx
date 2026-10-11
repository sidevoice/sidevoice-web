import type { ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon, InfoIcon, WarningIcon } from "./Icons";

export type AlertTone = "accent" | "positive" | "warning" | "danger";

/* A message in the flow of the page: an icon, a title, a line of why, and at most one action. `live` for a failure
 * that just happened (read out at once); a standing notice is not. */
export function Alert({ tone = "accent", title, children, action, live = false, className }: { tone?: AlertTone; title: ReactNode; children?: ReactNode; action?: ReactNode; live?: boolean; className?: string }) {
  const Icon = tone === "positive" ? CheckIcon : tone === "accent" ? InfoIcon : WarningIcon;
  return (
    <div className={cn("ui-alert", className)} data-tone={tone} role={live ? "alert" : undefined}>
      <Icon />
      <div>
        <p className="ui-alert-title">{title}</p>
        {children && <p className="ui-alert-body">{children}</p>}
      </div>
      {action ? <div className="ui-alert-action">{action}</div> : <span />}
    </div>
  );
}
