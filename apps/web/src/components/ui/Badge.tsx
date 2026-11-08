import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "danger";

/* A short status word. Its colour repeats what the word says; it never carries meaning alone. */
export function Badge({ tone = "neutral", dot = false, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean }) {
  return <span className={cn("ui-badge", className)} data-tone={tone} {...props}>{dot && <span className="ui-badge-dot" aria-hidden />}{children}</span>;
}
