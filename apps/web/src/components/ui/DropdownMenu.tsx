import * as DropdownPrimitive from "@radix-ui/react-dropdown-menu";
import { useRef, useState, type ReactNode } from "react";
import { overlayContainer, useOverlayPortal } from "./Tooltip";

interface DropdownMenuProps {
  label: string;
  trigger: ReactNode;
  children: ReactNode;
  /** Once it has closed, as focus goes back to its trigger: where an item that opens something else opens it, so
   *  that focus going back does not land after it (and close a popover it opened). */
  onCloseAutoFocus?: (event: Event) => void;
}

export function DropdownMenu({ label, trigger, children, onCloseAutoFocus }: DropdownMenuProps) {
  const provided = useOverlayPortal();
  // Its own open state, so it renders as it opens and finds where it is drawn (overlayContainer) from its trigger.
  const [open, setOpen] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  return (
    <DropdownPrimitive.Root open={open} onOpenChange={setOpen}>
      <DropdownPrimitive.Trigger asChild aria-label={label} ref={anchor}>{trigger}</DropdownPrimitive.Trigger>
      <DropdownPrimitive.Portal container={overlayContainer(provided, anchor.current)}>
        <DropdownPrimitive.Content className="ui-dropdown" sideOffset={8} collisionPadding={12} aria-label={label} onCloseAutoFocus={onCloseAutoFocus}>
          {children}
        </DropdownPrimitive.Content>
      </DropdownPrimitive.Portal>
    </DropdownPrimitive.Root>
  );
}

export function DropdownMenuItem({ children, danger = false, onSelect }: { children: ReactNode; danger?: boolean; onSelect?: () => void }) {
  return <DropdownPrimitive.Item className="ui-dropdown-item" data-danger={danger || undefined} onSelect={onSelect}>{children}</DropdownPrimitive.Item>;
}
