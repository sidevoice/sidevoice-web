import type { ReactNode } from "react";
import { Button } from "./Button";
import { InfoIcon } from "./Icons";
import { Tooltip } from "./Tooltip";

/* An (i) beside a label that says a little more on hover or focus — reachable by keyboard, named for screen readers.
 * What a person must know to act goes in the label or its description, not here. */
export function InfoTip({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Tooltip content={children}>
      <Button variant="ghost" tone="neutral" size="icon-sm" className="ui-infotip" aria-label={label}><InfoIcon /></Button>
    </Tooltip>
  );
}
