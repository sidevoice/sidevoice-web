import { forwardRef, type SelectHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/* The platform's own select, dressed as the other fields: the list it opens stays the system's (right on a phone,
 * read by every screen reader); only the closed box and its chevron are ours. */
export type SelectProps = Omit<SelectHTMLAttributes<HTMLSelectElement>, "size"> & { size?: "sm" | "md"; invalid?: boolean };

export const NativeSelect = forwardRef<HTMLSelectElement, SelectProps>(function NativeSelect({ className, size = "md", invalid, ...props }, ref) {
  return <select ref={ref} className={cn("ui-select", size === "sm" && "ui-control--sm", className)} aria-invalid={invalid || undefined} {...props} />;
});
