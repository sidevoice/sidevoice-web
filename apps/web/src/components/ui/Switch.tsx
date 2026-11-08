import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

/* An on/off setting that applies at once. Something that waits for Save is a checkbox, not this. */
export const Switch = forwardRef<HTMLButtonElement, Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onChange"> & { checked: boolean; onChange: (checked: boolean) => void }>(
  function Switch({ checked, onChange, className, ...props }, ref) {
    return <button ref={ref} type="button" role="switch" aria-checked={checked} className={cn("ui-switch", className)} onClick={() => onChange(!checked)} {...props}><span className="ui-switch-thumb" aria-hidden /></button>;
  });
