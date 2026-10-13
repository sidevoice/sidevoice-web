import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useRef, useState, type ReactElement, type ReactNode, type RefObject } from "react";
import { cn } from "../../lib/cn";
import { overlayContainer, useOverlayPortal } from "./Tooltip";

/* A small panel anchored to what opened it: a few lines and an action, not a dialog. It closes on Escape, on a click
 * outside, or from inside (`PopoverClose`); focus goes into it and back to its trigger. Or, with `anchor` for a
 * trigger, it is drawn beside something that is not what opens it (a menu's item opens it, or a button that changes
 * once it is used): it opens by `open`, and focus goes back where its opener puts it. With `open`, the caller holds
 * it, and a close asks `onOpenChange(false)` first, which may keep it open (while what it shows can't be left). */
interface PopoverProps {
  /** What opens it, and what it is drawn beside. */
  trigger?: ReactElement;
  /** Instead of a trigger: what it is drawn beside; it opens by `open`. */
  anchor?: ReactElement;
  label: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
  children: ReactNode;
}

export function Popover({ trigger, anchor, label, side = "top", align = "start", open: held, onOpenChange, className, children }: PopoverProps) {
  const provided = useOverlayPortal();
  // Its own open state unless the caller holds it, so it renders as it opens and finds where it is drawn
  // (overlayContainer) from what it is beside.
  const [own, setOwn] = useState(false);
  const open = held ?? own;
  const change = (next: boolean) => { if (held === undefined) setOwn(next); onOpenChange?.(next); };
  // Typed as Radix types its trigger and its anchor; it is whatever element it is beside.
  const beside = useRef<HTMLButtonElement & HTMLDivElement>(null);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={change}>
      {anchor ? <PopoverPrimitive.Anchor asChild ref={beside as RefObject<HTMLDivElement>}>{anchor}</PopoverPrimitive.Anchor>
        : <PopoverPrimitive.Trigger asChild ref={beside as RefObject<HTMLButtonElement>}>{trigger}</PopoverPrimitive.Trigger>}
      <PopoverPrimitive.Portal container={overlayContainer(provided, beside.current)}>
        <PopoverPrimitive.Content className={cn("ui-popover", className)} side={side} align={align} sideOffset={8} collisionPadding={12} aria-label={label}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const PopoverClose = PopoverPrimitive.Close;
