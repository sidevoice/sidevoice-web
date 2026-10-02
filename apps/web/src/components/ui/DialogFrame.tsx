import { useState, type PropsWithChildren, type ReactNode } from "react";
import { Button } from "./Button";
import { CloseIcon } from "./Icons";
import { OverlayPortalProvider } from "./Tooltip";

interface DialogFrameProps extends PropsWithChildren {
  id: string;
  labelledBy: string;
  eyebrow?: string;
  title: string;
  closeId: string;
  closeLabel?: string;
  closeTitle?: string;
  footer?: ReactNode;
  className?: string;
  /** For a dialog React opens and closes itself; the others are closed by the controller, by id. */
  onClose?: () => void;
}

export function DialogFrame({ id, labelledBy, eyebrow, title, closeId, closeLabel, closeTitle, footer, className = "", onClose, children }: DialogFrameProps) {
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  return (
    <dialog ref={setDialog} id={id} className={className} aria-labelledby={labelledBy}>
      <OverlayPortalProvider container={dialog}>
        <div className="settings-heading stats-heading">
        <div>{eyebrow && <span className="stats-eyebrow">{eyebrow}</span>}<h2 id={labelledBy}>{title}</h2></div>
        <Button id={closeId} variant="ghost" size="icon" aria-label={closeLabel ?? `Cerrar ${title.toLowerCase()}`} title={closeTitle ?? "Cerrar"} onClick={onClose}><CloseIcon /></Button>
      </div>
      {children}
      {footer}
      </OverlayPortalProvider>
    </dialog>
  );
}
