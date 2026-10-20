import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon } from "./Icons";

/* A surface that groups things: a border and the lightest shadow, nothing more. */
export function Card({ className, padded = true, ...props }: HTMLAttributes<HTMLDivElement> & { padded?: boolean }) {
  return <div className={cn("ui-card", padded && "ui-card--padded", className)} {...props} />;
}

/* A whole card that is one choice of a few (inside a `role="radiogroup"`): selected, it is outlined in the accent and
 * carries a check, so the choice never rests on colour alone. */
export function ChoiceCard({ selected, onSelect, className, children, ...props }: Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onSelect"> & { selected: boolean; onSelect: () => void }) {
  return (
    <button type="button" role="radio" aria-checked={selected} className={cn("ui-card ui-card--padded ui-card--interactive", className)} data-selected={selected || undefined}
      onClick={onSelect} {...props}>
      {selected && <span className="ui-card-check" aria-hidden><CheckIcon /></span>}
      {children}
    </button>
  );
}

/* A settings section: its title and what it is for, then its groups. */
export function Section({ title, description, actions, id, className, children }: { title: ReactNode; description?: ReactNode; actions?: ReactNode; id?: string; className?: string; children: ReactNode }) {
  const headingId = id ? id + "-title" : undefined;
  return (
    <section className={cn("ui-section", className)} id={id} aria-labelledby={headingId}>
      <header className="ui-section-head">
        <div>
          <h2 className="ui-section-title" id={headingId}>{title}</h2>
          {description && <p className="ui-section-description">{description}</p>}
        </div>
        {actions && <div className="ui-section-actions">{actions}</div>}
      </header>
      <div className="ui-section-body">{children}</div>
    </section>
  );
}

/* A group of rows on one card, with an optional title above it. */
export function Group({ title, className, children }: { title?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <div className={cn("ui-group", className)}>
      {title && <h3 className="ui-group-title">{title}</h3>}
      <div className="ui-group-card">{children}</div>
    </div>
  );
}

/* One row of a group: what it sets (and a line about it) beside its control; stacked when the group is narrow. A
 * `block` row puts a whole block (a model's preparation, a list) under its label. */
export function Row({ label, description, htmlFor, block = false, children, className }: { label: ReactNode; description?: ReactNode; htmlFor?: string; block?: boolean; children?: ReactNode; className?: string }) {
  return (
    <div className={cn("ui-row", block && "ui-row--block", className)}>
      <div className="ui-row-text">
        {htmlFor ? <label className="ui-row-label" htmlFor={htmlFor}>{label}</label> : <span className="ui-row-label">{label}</span>}
        {description && <p className="ui-row-description">{description}</p>}
      </div>
      {children && <div className="ui-row-control">{children}</div>}
    </div>
  );
}
