import { forwardRef } from "react";
import { cn } from "../../lib/cn";
import { Button, type ButtonProps } from "./Button";
import { ChevronIcon } from "./Icons";

/* What shows or hides a how-to under it, beside or under the action that does the same thing for the person ("I'll do
 * it myself", on an agent's row and when preparing this computer): a small ghost button, its chevron turned up while
 * what it opens shows. `controls`: the id of what it opens. Pressing it is the caller's (`onClick`), so a tooltip
 * around it still hears the press. */
export const DisclosureButton = forwardRef<HTMLButtonElement, Omit<ButtonProps, "variant" | "size"> & { open: boolean; controls: string }>(
  function DisclosureButton({ open, controls, className, children, ...props }, ref) {
    return (
      <Button ref={ref} variant="ghost" size="sm" {...props} className={cn("ui-disclosure", className)} aria-expanded={open} aria-controls={controls}>
        {children}<ChevronIcon size={14} className={open ? "ui-disclosure-chevron--open" : undefined} />
      </Button>
    );
  });
