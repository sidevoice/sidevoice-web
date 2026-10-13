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

/** Where an overlay opened from `trigger` is drawn: the container given above it (a dialog that says so), else the
 *  open `<dialog>` the trigger sits in, else the page. A modal dialog lives in the browser's top layer: an overlay drawn
 *  in the page, outside it, is open and invisible beneath it — which is how the setup's tooltips showed nothing. Read
 *  as the overlay opens (it renders then), so the trigger is in the page. */
export function overlayContainer(provided: HTMLElement | null, trigger: Element | null): HTMLElement | undefined {
  return provided ?? (trigger?.closest("dialog[open]") as HTMLElement | null) ?? undefined;
}

interface TooltipProps {
  content: ReactNode;
  children: ReactElement;
}

/** Focus the browser shows, as a key moves it (not a click's, nor a script's after one). An engine without
 *  `:focus-visible` counts any focus. */
function focusVisible(element: Element) {
  try { return element.matches(":focus-visible"); } catch { return true; }
}

/* A few words more about what it points at. On a desktop: on hover, and on keyboard focus — focus the browser shows
 * (`:focus-visible`), never focus a script put there (a dialog or a notice closing); a click keeps it open (Radix's own
 * closes it on a click, which is just what an (i) gets). On touch: a tap toggles it, a tap outside or Escape closes it.
 * Drawn in a portal (the open dialog's, else the page's), so no scrolling box clips it. */
export function Tooltip({ content, children }: TooltipProps) {
  const provided = useOverlayPortal();
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
    // Nothing in a tooltip is to be pointed at: it closes as the pointer leaves what it explains.
    <TooltipPrimitive.Provider delayDuration={350} disableHoverableContent>
    <TooltipPrimitive.Root delayDuration={350} open={open}
      // A press is ours to answer (onClick below): Radix's close on it is not taken.
      onOpenChange={(next) => { if (pressing.current) return; setOpen(next); }}>
      <TooltipPrimitive.Trigger asChild ref={trigger}
        onPointerDown={(event) => { pointer.current = event.pointerType; pressing.current = true; }}
        // Before Radix's own, which opens it on any focus: only on focus the browser shows.
        onFocus={(event) => { if (!focusVisible(event.currentTarget)) event.preventDefault(); }}
        onClick={(event) => {
          // Before Radix's own handler, which would close it.
          event.preventDefault();
          // A tap toggles, a click opens. Some browsers (WebKit) say "mouse" for a tap: a screen with no hover is a touch one.
          const type = (event.nativeEvent as PointerEvent).pointerType || pointer.current;
          const touch = type === "touch" || type === "pen" || (typeof matchMedia === "function" && matchMedia("(hover: none)").matches);
          setOpen(touch ? !openRef.current : true);
          window.setTimeout(() => { pressing.current = false; }, 0);
        }}>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal container={overlayContainer(provided, trigger.current)}>
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
