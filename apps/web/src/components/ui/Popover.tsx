import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ReactElement, ReactNode } from "react";
import { useOverlayPortal } from "./Tooltip";

/* A small panel anchored to what opened it: a few lines and an action, not a dialog. It closes on Escape, on a click
 * outside, or from inside (`PopoverClose`); focus goes into it and back to its trigger. */
export function Popover({ trigger, label, side = "top", align = "start", children }: {
  trigger: ReactElement; label: string; side?: "top" | "right" | "bottom" | "left"; align?: "start" | "center" | "end"; children: ReactNode;
}) {
  const container = useOverlayPortal();
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal container={container ?? undefined}>
        <PopoverPrimitive.Content className="ui-popover" side={side} align={align} sideOffset={8} collisionPadding={12} aria-label={label}>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export const PopoverClose = PopoverPrimitive.Close;
