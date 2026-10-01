import { Fragment, useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ChevronIcon } from "./Icons";

export interface Choice {
  value: string;
  label: string;
  /** Beside the label: a size, «descargado», «sin clave». */
  detail?: string;
  /** Under the label, in the row itself: what the option is. */
  description?: string;
  /** Options sharing a group are listed under its heading, in the order the groups first appear. */
  group?: string;
  /** Said by the row's look (a provider with no key reads dimmer). */
  kind?: string;
  /** Drawn before the label. */
  icon?: ReactNode;
}

/** A dropdown whose rows say more than a name (operator, 2026-10-01): a label, a detail beside it and a description under
 *  it, grouped, with an icon. Always its field's full width. The list opens in the flow, under the field, so nothing in a
 *  scrolling pane clips it; arrows, Enter and Escape work as in a native list. Native selects stay the default where one
 *  line per option is enough. */
export function ChoiceSelect({ id, value, choices, onChange, disabled, placeholder = "—", labelledBy }: {
  id: string; value: string; choices: Choice[]; onChange: (value: string) => void; disabled?: boolean; placeholder?: string; labelledBy?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const current = choices.find((choice) => choice.value === value);
  const groups = [...new Set(choices.map((choice) => choice.group ?? ""))];
  const ordered = groups.flatMap((group) => choices.filter((choice) => (choice.group ?? "") === group));

  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("pointerdown", away, true);
    root.current?.querySelector<HTMLElement>("[aria-selected=true]")?.focus() ?? root.current?.querySelector<HTMLElement>("[role=option]")?.focus();
    return () => document.removeEventListener("pointerdown", away, true);
  }, [open]);
  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);

  function pick(next: string) {
    setOpen(false);
    trigger.current?.focus();
    if (next !== value) onChange(next);
  }
  function onListKey(event: KeyboardEvent) {
    const options = [...(root.current?.querySelectorAll<HTMLElement>("[role=option]") ?? [])];
    const at = options.indexOf(document.activeElement as HTMLElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      options[Math.max(0, Math.min(options.length - 1, at + (event.key === "ArrowDown" ? 1 : -1)))]?.focus();
    } else if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if ((event.key === "Enter" || event.key === " ") && at >= 0) { event.preventDefault(); pick(ordered[at].value); }
  }

  return (
    <div className="choice-select" ref={root} data-open={open || undefined}>
      <button ref={trigger} id={id} type="button" className="choice-trigger" disabled={disabled} data-value={value}
        aria-haspopup="listbox" aria-expanded={open} aria-controls={id + "-list"} aria-labelledby={labelledBy ? `${labelledBy} ${id}` : undefined}
        onClick={() => setOpen(!open)}
        onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); setOpen(true); } }}>
        {current?.icon && <span className="choice-icon">{current.icon}</span>}
        <span className="choice-current">
          <span className="choice-label">{current?.label ?? placeholder}</span>
          {current?.detail && <span className="choice-detail">{current.detail}</span>}
        </span>
        <ChevronIcon size={16} className={open ? "chevron-up" : undefined} />
      </button>
      {open && (
        <ul className="choice-list" id={id + "-list"} role="listbox" aria-labelledby={labelledBy} onKeyDown={onListKey}>
          {groups.map((group) => (
            <Fragment key={group || "_"}>
              {group && <li className="choice-group" role="presentation">{group}</li>}
              {choices.filter((choice) => (choice.group ?? "") === group).map((choice) => (
                <li key={choice.value} role="option" tabIndex={-1} className="choice-item" aria-selected={choice.value === value}
                  data-value={choice.value} data-kind={choice.kind} onClick={() => pick(choice.value)}>
                  <span className="choice-row">
                    {choice.icon && <span className="choice-icon">{choice.icon}</span>}
                    <span className="choice-label">{choice.label}</span>
                    {choice.detail && <span className="choice-detail">{choice.detail}</span>}
                    {choice.value === value && <span className="choice-check" aria-hidden="true">✓</span>}
                  </span>
                  {choice.description && <span className="choice-desc">{choice.description}</span>}
                </li>
              ))}
            </Fragment>
          ))}
        </ul>
      )}
    </div>
  );
}
