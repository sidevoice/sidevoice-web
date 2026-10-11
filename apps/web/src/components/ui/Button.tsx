import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "../../lib/cn";

/* The one button: a pill, its content — a label, an icon, both — always centred. One primary per region (a dialog's
 * footer, a page's, a step); the rest secondary or ghost. A loading button keeps its width and shows a spinner over
 * its hidden label, so nothing around it moves. */
const buttonVariants = cva("ui-button", {
  variants: {
    variant: {
      primary: "ui-button--primary",
      secondary: "ui-button--secondary",
      ghost: "ui-button--ghost",
      danger: "ui-button--danger",
    },
    /** A ghost's colour: the accent's (default), plain (close, back, cancel), or a destructive entry point's. */
    tone: { accent: "", neutral: "ui-button--neutral", danger: "ui-button--danger-text" },
    size: {
      sm: "ui-button--sm",
      md: "ui-button--md",
      lg: "ui-button--lg",
      icon: "ui-button--icon",
      "icon-sm": "ui-button--icon ui-button--sm",
    },
    block: { true: "ui-button--block" },
  },
  defaultVariants: { variant: "secondary", size: "md" },
});

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof buttonVariants> & {
  /** Busy: the button keeps its size, says so to assistive tech and cannot be pressed again. */
  loading?: boolean;
  /** Disabled for a reason shown on the page: the id of the text that says why. The button stays reachable, reads
   *  that text as its description, and a press calls `onBlocked` (to take the person to what blocks it) instead. */
  blockedBy?: string;
  onBlocked?: () => void;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant, tone, size, block, loading = false, blockedBy, onBlocked, className, type = "button", disabled, onClick, children, ...props }, ref) {
  const blocked = !!disabled && !!blockedBy;
  const unavailable = loading || blocked;
  // Only a button with something to do takes a click handler: a runtime may wire one itself (`onclick`), and React
  // would replace it on a render.
  const click = (event: MouseEvent<HTMLButtonElement>) => {
    if (unavailable) { event.preventDefault(); if (blocked) onBlocked?.(); return; }
    onClick?.(event);
  };
  return (
    <button ref={ref} type={type} {...props} className={cn(buttonVariants({ variant, tone, size, block }), className)}
      disabled={disabled && !blocked} aria-disabled={unavailable || undefined}
      aria-describedby={blocked ? blockedBy : props["aria-describedby"]} aria-busy={loading || undefined} data-loading={loading || undefined}
      onClick={onClick || unavailable ? click : undefined}>
      {loading && <span className="ui-spinner" aria-hidden />}
      <span className="ui-button-content">{children}</span>
    </button>
  );
});
