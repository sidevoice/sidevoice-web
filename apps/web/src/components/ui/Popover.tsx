import * as PopoverPrimitive from "@radix-ui/react-popover";
import { useRef, useState, type ReactElement, type ReactNode } from "react";
import { overlayContainer, useOverlayPortal } from "./Tooltip";

/* A small panel anchored to what opened it: a few lines and an action, not a dialog. It closes on Escape, on a click
 * outside, or from inside (`PopoverClose`); focus goes into it and back to its trigger. */
export function Popover({ trigger, label, side = "top", align = "start", children }: {
  trigger: ReactElement; label: string; side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; children: ReactNode;
}) {
  const provided = useOverlayPortal();
  // Its own open state, so it renders as it opens and finds where it is drawn (overlayContainer) from its trigger.
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild ref={anchor}>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={overlayContainer(provided, anchor.current)}>
        <PopoverPrimitive.Content className="ui-popover" side={side} align={align} sideOffset={8} collisionPadding={12} aria-label={label}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const PopoverClose = PopoverPrimitive.Close;
