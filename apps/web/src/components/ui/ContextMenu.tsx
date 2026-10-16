import * as ContextPrimitive from "@radix-ui/react-context-menu";
import type { ReactNode } from "react";
import { overlayContainer, useOverlayPortal } from "./Tooltip";

/* The same options as a row's ⋯ menu, opened with the secondary click (or a long press on touch) where the row is: the
 * system's context menu on that element, in the dropdown's own look (ui-dropdown). */
export function ContextMenu({ label, children, items }: { label: string; children: ReactNode; items: ReactNode }) {
  const provided = useOverlayPortal();
  return (
    <ContextPrimitive.Root>
      <ContextPrimitive.Trigger asChild>{children}</ContextPrimitive.Trigger>
      <ContextPrimitive.Portal container={overlayContainer(provided, null)}>
        <ContextPrimitive.Content className="ui-dropdown" collisionPadding={12} aria-label={label}>{items}</ContextPrimitive.Content>
      </ContextPrimitive.Portal>
    </ContextPrimitive.Root>
  );
}

export function ContextMenuItem({ children, danger = false, onSelect }: { children: ReactNode; danger?: boolean; onSelect?: () => void }) {
  return <ContextPrimitive.Item className="ui-dropdown-item" data-danger={danger || undefined} onSelect={onSelect}>{children}</ContextPrimitive.Item>;
}
