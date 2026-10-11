import { cn } from "../../lib/cn";

/* How far something has got: `value` from 0 to 1, or none while that is not known yet (it moves without a figure). */
export function ProgressBar({ value, label, className }: { value: number | null; label: string; className?: string }) {
  const known = value != null;
  return (
    <div className={cn("ui-progress", className)} role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100}
      aria-valuenow={known ? Math.round(value * 100) : undefined} data-indeterminate={known ? undefined : true}>
      <span className="ui-progress-fill" style={known ? { width: `${Math.max(0, Math.min(1, value)) * 100}%` } : undefined} />
    </div>
  );
}
