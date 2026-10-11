import type { ReactNode } from "react";
import { Button, type ButtonProps } from "./Button";
import { DropdownMenu } from "./DropdownMenu";
import { ChevronIcon } from "./Icons";

/* A split button: the main action, and joined to it a chevron that opens the others (DropdownMenuItems). Without
 * others it is the plain button. */
export function SplitButton({ menuLabel, items, ...button }: ButtonProps & { menuLabel: string; items: ReactNode[] }) {
  if (!items.length) return <Button {...button} />;
  return (
    <span className="ui-split">
      <Button {...button} />
      <DropdownMenu label={menuLabel}
        trigger={<Button variant={button.variant} tone={button.tone} size={button.size} className="ui-split-more" aria-label={menuLabel} disabled={button.disabled || button.loading}><ChevronIcon size={14} /></Button>}>
        {items}
      </DropdownMenu>
    </span>
  );
}
