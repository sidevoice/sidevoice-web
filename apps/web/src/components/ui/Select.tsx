import * as SelectPrimitive from "@radix-ui/react-select";
import { useId, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { CheckIcon, ChevronIcon, MoreAboveIcon, MoreBelowIcon } from "./Icons";
import { overlayContainer, useOverlayPortal } from "./Tooltip";

/* One value of a list, in a box like the other fields: the list drops from it, at least as wide as it, and goes up
 * when there is no room below. Each option may say more — a line under it, why it cannot be chosen, an icon before
 * it, a badge after it — and the options may come in labelled groups. Arrows, Home and End move, typing a name jumps
 * to it, Enter or Space picks, Escape closes; a tap opens and picks on a phone. Drawn in a portal (the open dialog's,
 * else the page's), so no scrolling box clips it and no modal dialog hides it. */

export interface SelectOption {
  /** "" is a value like any other here ("Automatic", "Never"): the component keeps it apart from "nothing chosen". */
  value: string;
  label: ReactNode;
  /** A line under the label: what the choice means. */
  description?: ReactNode;
  icon?: ReactNode;
  /** After the label: a short status (a Badge). */
  badge?: ReactNode;
  disabled?: boolean;
  /** Why it cannot be chosen, under the label; said only while it is disabled. */
  reason?: ReactNode;
  /** What typing jumps to, when the label is not plain text. */
  textValue?: string;
}

export interface SelectGroup {
  label: ReactNode;
  options: SelectOption[];
}

export type SelectItems = (SelectOption | SelectGroup)[];

export interface SelectProps {
  id?: string;
  /** Controlled; with neither this nor `defaultValue`, nothing is chosen and the placeholder shows. */
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  options: SelectItems;
  size?: "sm" | "md";
  disabled?: boolean;
  invalid?: boolean;
  /** What the box says while nothing (or a value no option has) is chosen. */
  placeholder?: ReactNode;
  className?: string;
  style?: CSSProperties;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

// Radix keeps "" for "nothing chosen" and refuses it as an option's value; ours is a real choice, so it goes by
// another name inside.
const EMPTY = "__sv-select-empty__";

const isGroup = (item: SelectOption | SelectGroup): item is SelectGroup => "options" in item;

export function Select({ id, value, defaultValue, onValueChange, options, size = "md", disabled, invalid, placeholder, className, style, ...aria }: SelectProps) {
  const provided = useOverlayPortal();
  // Its own open state, so it renders as it opens and finds where it is drawn (overlayContainer) from its trigger.
  const [open, setOpen] = useState(false);
  const [own, setOwn] = useState(defaultValue ?? "");
  const trigger = useRef<HTMLButtonElement>(null);
  const current = value ?? own;
  const flat = options.flatMap((item) => isGroup(item) ? item.options : [item]);
  const chosen = flat.find((option) => option.value === current);
  const hasEmpty = flat.some((option) => option.value === "");
  const inner = (external: string) => external === "" && hasEmpty ? EMPTY : external;
  const choose = (next: string) => {
    const external = next === EMPTY ? "" : next;
    setOwn(external);
    onValueChange?.(external);
  };
  // The list is drawn outside its trigger's box: it wears that box's theme (the design system shows both at once).
  const theme = open ? trigger.current?.closest("[data-theme]")?.getAttribute("data-theme") ?? undefined : undefined;
  return (
    <SelectPrimitive.Root value={inner(current)} onValueChange={choose} open={open} onOpenChange={setOpen} disabled={disabled}>
      <SelectPrimitive.Trigger ref={trigger} id={id} className={cn("ui-select", size === "sm" && "ui-control--sm", className)} style={style}
        aria-label={aria["aria-label"]} aria-labelledby={aria["aria-labelledby"]} aria-describedby={aria["aria-describedby"]}
        aria-invalid={invalid || aria["aria-invalid"] || undefined}
        // Its value as data, for whatever reads the page rather than looks at it: a test, the runtime.
        data-value={current}>
        <SelectPrimitive.Value placeholder={<span className="ui-select-placeholder">{placeholder}</span>}>
          {chosen ? <span className="ui-select-value">
            {chosen.icon && <span className="ui-select-icon" aria-hidden>{chosen.icon}</span>}
            <span className="ui-select-value-text">{chosen.label}</span>
          </span> : <span className="ui-select-placeholder">{placeholder}</span>}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon className="ui-select-chevron"><ChevronIcon size={size === "sm" ? 14 : 16} /></SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal container={overlayContainer(provided, trigger.current)}>
        <SelectPrimitive.Content className="ui-select-content" data-size={size} data-theme={theme}
          position="popper" side="bottom" align="start" sideOffset={4} collisionPadding={12}>
          <SelectPrimitive.ScrollUpButton className="ui-select-scroll"><MoreAboveIcon /></SelectPrimitive.ScrollUpButton>
          <SelectPrimitive.Viewport className="ui-select-viewport">
            {options.map((item, index) => isGroup(item)
              ? <SelectPrimitive.Group key={"group-" + index} className="ui-select-group">
                {index > 0 && <SelectPrimitive.Separator className="ui-select-separator" />}
                <SelectPrimitive.Label className="ui-select-label">{item.label}</SelectPrimitive.Label>
                {item.options.map((option) => <Item key={option.value} option={option} value={inner(option.value)} />)}
              </SelectPrimitive.Group>
              : <Item key={item.value} option={item} value={inner(item.value)} />)}
          </SelectPrimitive.Viewport>
          <SelectPrimitive.ScrollDownButton className="ui-select-scroll"><MoreBelowIcon /></SelectPrimitive.ScrollDownButton>
        </SelectPrimitive.Content>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}

/** One option: its label names it; the line under it and why it is disabled describe it. */
function Item({ option, value }: { option: SelectOption; value: string }) {
  const id = useId();
  const reason = option.disabled && option.reason;
  const described = [option.description && id + "-description", reason && id + "-reason"].filter(Boolean).join(" ") || undefined;
  return (
    <SelectPrimitive.Item className="ui-select-item" value={value} disabled={option.disabled} textValue={option.textValue}
      data-value={option.value} aria-describedby={described}>
      {option.icon && <span className="ui-select-icon" aria-hidden>{option.icon}</span>}
      <span className="ui-select-item-text">
        <SelectPrimitive.ItemText>{option.label}</SelectPrimitive.ItemText>
        {option.description && <span className="ui-select-item-description" id={id + "-description"}>{option.description}</span>}
        {reason && <span className="ui-select-item-reason" id={id + "-reason"}>{reason}</span>}
      </span>
      {option.badge && <span className="ui-select-item-badge">{option.badge}</span>}
      <span className="ui-select-item-check"><SelectPrimitive.ItemIndicator><CheckIcon size={16} /></SelectPrimitive.ItemIndicator></span>
    </SelectPrimitive.Item>
  );
}
