import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { createContext, useContext, useRef, useState, type PropsWithChildren, type ReactElement, type ReactNode } from "react";

const OverlayPortalContext = createContext<HTMLElement | null>(null);

export const TooltipProvider = TooltipPrimitive.Provider;

export function OverlayPortalProvider({ container, children }: PropsWithChildren<{ container: HTMLElement | null }>) {
  return <OverlayPortalContext.Provider value={container}>{children}</OverlayPortalContext.Provider>;
}

export function useOverlayPortal() {
  return useContext(OverlayPortalContext);
}

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
}

/* A few words more about what it points at. On a desktop: on hover, and on keyboard focus; a click keeps it open (Radix's
 * own closes it on a click, which is just what an (i) gets). On touch: a tap toggles it, a tap outside or Escape closes
 * it. Drawn in a portal (the open dialog's, else the page's), so no scrolling box clips it. */
export function Tooltip({ content, children }: TooltipProps) {
  const container = useOverlayPortal();
  const [open, setOpenState] = useState(false);
  const openRef = useRef(false);
  const setOpen = (next: boolean) => { openRef.current = next; setOpenState(next); };
  const pointer = useRef<string>("mouse");
  const pressing = useRef(false);
  // Typed as Radix types its trigger; it is whatever element the tooltip is on.
  const trigger = useRef<HTMLButtonElement>(null);
  if (!content) return children;
  // A provider of its own, so a tooltip drawn outside the app's (a pattern page, a pane on its own) never throws; each
  // tooltip keeps its own delay.
  return (
    <TooltipPrimitive.Provider delayDuration={350}>
    <TooltipPrimitive.Root delayDuration={350} open={open}
      // A press is ours to answer (onClick below): Radix's close on it is not taken.
      onOpenChange={(next) => { if (pressing.current) return; setOpen(next); }}>
      <TooltipPrimitive.Trigger asChild ref={trigger}
        onPointerDown={(event) => { pointer.current = event.pointerType; pressing.current = true; }}
        onClick={(event) => {
          // Before Radix's own handler, which would close it.
          event.preventDefault();
          const type = (event.nativeEvent as PointerEvent).pointerType || pointer.current;
          setOpen(type === "mouse" ? true : !openRef.current);
          window.setTimeout(() => { pressing.current = false; }, 0);
        }}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={container ?? undefined}>
        <TooltipPrimitive.Content className="ui-tooltip" sideOffset={8} collisionPadding={12}
          // A press on the trigger itself is its own toggle (onClick), not a press outside.
          onPointerDownOutside={(event) => { if (trigger.current?.contains(event.target as Node)) { event.preventDefault(); return; } setOpen(false); }}
          onEscapeKeyDown={() => setOpen(false)}>
          {content}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  );
}
