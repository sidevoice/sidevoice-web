import { useEffect, useState, type PropsWithChildren, type ReactNode } from "react";
import { cn } from "../../lib/cn";
import { Button } from "./Button";
import { CloseIcon } from "./Icons";
import { OverlayPortalProvider } from "./Tooltip";
import { uiTranslator } from "./ui-i18n";

/* A dialog, and the full-screen page that is the same thing on a bigger stage (Settings, the first-run setup): a head
 * with its title and close, a body that alone scrolls, and a footer that stays in sight. `DialogSurface` is that
 * frame without the modal around it — what the design system page shows, and what both kinds wear. */

interface SurfaceProps extends PropsWithChildren {
  titleId: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  /** Something before the title: the brand's mark, a back button. */
  leading?: ReactNode;
  footer?: ReactNode;
  closeId?: string;
  /** No close button when absent (a step that must be finished), unless `closeable`: a close whose click the runtime
   *  binds itself, by `closeId`. */
  onClose?: () => void;
  closeable?: boolean;
  /** The body's own layout takes the whole space (a nav beside the content): no padding of its own. */
  flush?: boolean;
  /** The text of the close button, for the title when it is not plain text. */
  closeLabel?: string;
}

export function DialogSurface({ titleId, title, eyebrow, leading, footer, closeId, onClose, closeable = false, flush = false, closeLabel, children }: SurfaceProps) {
  const t = uiTranslator();
  return (
    <div className="ui-dialog-surface">
      <header className="ui-dialog-head">
        {leading}
        <div className="ui-dialog-titles">
          {eyebrow && <span className="ui-dialog-eyebrow">{eyebrow}</span>}
          <h2 className="ui-dialog-title" id={titleId}>{title}</h2>
        </div>
        {(onClose || closeable) && <Button id={closeId} variant="ghost" size="icon" className="ui-dialog-close" aria-label={closeLabel ?? (typeof title === "string" ? t("ui.closeNamed", { name: title }) : t("ui.close"))}
          title={t("ui.close")} onClick={onClose} tone="neutral"><CloseIcon /></Button>}
      </header>
      <div className={cn("ui-dialog-body", flush && "ui-dialog-body--flush")}>{children}</div>
      {footer && <footer className="ui-dialog-foot">{footer}</footer>}
    </div>
  );
}

interface DialogProps extends SurfaceProps {
  id?: string;
  open: boolean;
  /** `dialog`: a card over the page; `page`: the whole screen. Below 640px both are the whole screen. */
  layout?: "dialog" | "page";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function Dialog({ id, open, layout = "dialog", size = "md", className, onClose, ...surface }: DialogProps) {
  const [node, setNode] = useState<HTMLDialogElement | null>(null);
  useEffect(() => {
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [node, open]);
  return (
    <dialog ref={setNode} id={id} className={cn("ui-dialog", className)} data-layout={layout} data-size={size} aria-labelledby={surface.titleId}
      onCancel={(event) => { event.preventDefault(); onClose?.(); }}>
      <OverlayPortalProvider container={node}>
        {open && <DialogSurface {...surface} onClose={onClose} />}
      </OverlayPortalProvider>
    </dialog>
  );
}
