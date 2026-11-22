import type { HTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export type BadgeTone = "neutral" | "accent" | "positive" | "warning" | "danger";

/* A short status word. Its colour repeats what the word says; it never carries meaning alone. A `tag` is the one
 * beside a row's name (a provider's, an agent's): smaller and lighter, with a quiet border in its own colour. */
export function Badge({ tone = "neutral", dot = false, tag = false, className, children, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; dot?: boolean; tag?: boolean }) {
  return <span className={cn("ui-badge", className)} data-tone={tone} data-tag={tag || undefined} {...props}>{dot && <span className="ui-badge-dot" aria-hidden />}{children}</span>;
}
