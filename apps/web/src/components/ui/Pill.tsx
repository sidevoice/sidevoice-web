import type { ComponentPropsWithRef, ReactNode } from "react";
import { cn } from "../../lib/cn";
import "./pill.css";

/** A rounded surface with three slots, in a row: `lead` (an icon or a mark), `label` (a word) and `action` (a control at the end). Its look
 *  is its own (size, padding, gaps, colours of the lead); where it sits, and the fill of the surface behind it, are the caller's, through
 *  `className`. `size` is a type step (the pill's own units are `em`): "inline" in a row of text, "stage" at the size of the call's stage. */
export type PillProps = Omit<ComponentPropsWithRef<"div">, "children"> & {
  lead?: ReactNode;
  label?: ReactNode;
  action?: ReactNode;
  size?: "inline" | "stage";
  /** Things that belong to the pill but draw nothing (a screen reader's announcer). */
  children?: ReactNode;
};

export function Pill({ lead, label, action, size = "inline", className, children, ...rest }: PillProps) {
  return (
    <div {...rest} className={cn("ui-pill", className)} data-size={size} data-action={action ? "" : undefined}>
      {lead != null && <span className="ui-pill-lead">{lead}</span>}
      {label != null && <span className="ui-pill-label">{label}</span>}
      {children}
      {action}
    </div>
  );
}
