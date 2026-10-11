import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { WarningIcon } from "./Icons";

/* A labelled control: its label, the control, then the error when there is one, then the hint. The control is given
 * its id and what describes it, so a screen reader reads them together. Optional fields say so in `aside`; nothing is
 * starred. */
interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  /** Something at the label's end: "(optional)", a link, a counter. */
  aside?: ReactNode;
  className?: string;
  children: ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
}

export function Field({ label, hint, error, aside, className, children }: FieldProps) {
  const auto = useId();
  const id = children.props.id ?? auto;
  const described = [error && id + "-error", hint && id + "-hint"].filter(Boolean).join(" ") || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, "aria-describedby": described, "aria-invalid": error ? true : undefined })
    : children;
  return (
    <div className={cn("ui-field", className)} data-invalid={error ? true : undefined}>
      <div className="ui-field-head">
        <label className="ui-field-label" htmlFor={id}>{label}</label>
        {aside && <span className="ui-field-aside">{aside}</span>}
      </div>
      <div className="ui-field-control">
        {control}
        {error && <p className="ui-field-error" id={id + "-error"}><WarningIcon />{error}</p>}
        {hint && <p className="ui-field-hint" id={id + "-hint"}>{hint}</p>}
      </div>
    </div>
  );
}
