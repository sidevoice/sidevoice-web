import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type Item<Value extends string> = { value: Value; label: ReactNode; icon?: ReactNode; disabled?: boolean };

/** Arrow keys move between items and choose as they go, as the WAI-ARIA tabs and radio patterns do. */
function useRoving<Value extends string>(items: Item<Value>[], value: Value, onChange: (value: Value) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  function onKeyDown(event: KeyboardEvent) {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    const edge = event.key === "Home" ? 0 : event.key === "End" ? items.length - 1 : null;
    if (!step && edge === null) return;
    event.preventDefault();
    const enabled = items.map((item, index) => (item.disabled ? -1 : index)).filter((index) => index >= 0);
    const at = enabled.indexOf(items.findIndex((item) => item.value === value));
    const next = edge !== null ? (edge === 0 ? enabled[0] : enabled[enabled.length - 1]) : enabled[(at + step + enabled.length) % enabled.length];
    onChange(items[next].value);
    refs.current[next]?.focus();
  }
  return { refs, onKeyDown };
}

/* Tabs: switch which panel shows. Each tab controls `${idPrefix}-panel-${value}`, which the caller renders. */
export function Tabs<Value extends string>({ items, value, onChange, label, idPrefix, className }: { items: Item<Value>[]; value: Value; onChange: (value: Value) => void; label: string; idPrefix?: string; className?: string }) {
  const auto = useId();
  const prefix = idPrefix ?? auto;
  const { refs, onKeyDown } = useRoving(items, value, onChange);
  return (
    <div className={cn("ui-tabs", className)} role="tablist" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <button key={item.value} ref={(node) => { refs.current[index] = node; }} type="button" role="tab" className="ui-tab" id={`${prefix}-tab-${item.value}`}
          aria-selected={item.value === value} aria-controls={`${prefix}-panel-${item.value}`} tabIndex={item.value === value ? 0 : -1}
          disabled={item.disabled} onClick={() => onChange(item.value)}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

/* A segmented control: one value of a few, all in sight — a radio group drawn as joined buttons. */
export function Segmented<Value extends string>({ items, value, onChange, label, size = "md", className }: { items: Item<Value>[]; value: Value; onChange: (value: Value) => void; label: string; size?: "sm" | "md"; className?: string }) {
  const { refs, onKeyDown } = useRoving(items, value, onChange);
  return (
    <div className={cn("ui-segmented", size === "sm" && "ui-segmented--sm", className)} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      {items.map((item, index) => (
        <button key={item.value} ref={(node) => { refs.current[index] = node; }} type="button" role="radio" className="ui-segment"
          aria-checked={item.value === value} tabIndex={item.value === value ? 0 : -1} disabled={item.disabled} onClick={() => onChange(item.value)}>
          {item.icon}<span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}
