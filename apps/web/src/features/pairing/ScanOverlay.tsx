import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button";
import { translator } from "../../i18n/translator";

/* The viewfinder of a pairing-code scan (`host.codeScanner`): the app draws the camera behind the page and the page shows it
 * through. While this is open the page is transparent (`data-scanning` on the root, pairing.css) and everything but this is
 * hidden, so what is seen is the camera, a frame to aim at and a Cancel. A modal dialog of its own, so that Escape and the
 * system's back gesture end the scan, the focus stays on Cancel and the page behind is inert. */
export function ScanOverlay({ onCancel }: { onCancel: () => void }) {
  const t = translator();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    // Where a browser has no modal dialog (an old engine, a test's DOM), it is shown open all the same.
    if (!node.open) typeof node.showModal === "function" ? node.showModal() : node.setAttribute("open", "");
    document.documentElement.setAttribute("data-scanning", "");
    return () => {
      document.documentElement.removeAttribute("data-scanning");
      if (node.open) typeof node.close === "function" ? node.close() : node.removeAttribute("open");
    };
  }, []);
  return createPortal(
    <dialog ref={dialog} className="scan-overlay" aria-label={t("pairing.scanTitle")}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onCancel(); }}>
      <p className="scan-hint">{t("pairing.scanHint")}</p>
      <div className="scan-frame" aria-hidden="true" />
      <Button variant="secondary" className="scan-cancel" autoFocus onClick={onCancel}>{t("pairing.scanCancel")}</Button>
    </dialog>,
    document.body,
  );
}
