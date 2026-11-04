import { useEffect, useRef, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button } from "../../components/ui/Button";
import { translator } from "../../i18n/translator";
import { SIDEVOICE_MASCOT } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { useAvatarState } from "../avatar/avatar-state";
import { CharacterAvatar } from "../avatar/CharacterAvatar";

/* The viewfinder of a pairing-code scan (`host.codeScanner`): the app draws the camera behind the page and the page shows it
 * through. While this is open the page is transparent (`data-scanning` on the root, pairing.css) and everything but this is
 * hidden, so what is seen is the camera, a frame to aim at and a Cancel. A modal dialog of its own, so that Escape ends the
 * scan, the focus stays on Cancel and the page behind is inert. The phone's back gesture is not a dialog `cancel` (the app
 * navigates the web view back or sends itself to the background): leaving the screen is PairMachine's to handle, by
 * cancelling the scan when it unmounts.
 *
 * How it is drawn is an open decision (VARIANTS `pairingScan`, PairMachine): `plain` is today's white frame; `stage` is
 * the app's own look, whatever the page's theme — the dark stage's tint around the frame, its corners in the accent, the
 * mascot perched on it and the type of a dialog's title. */

export type ViewfinderLook = "plain" | "stage";

/** The Sidevoice mascot, idle (it blinks), in its tone: what waits beside a frame the page draws. */
export function ScanMascot({ className }: { className?: string }) {
  const avatar = useAvatarState(SIDEVOICE_MASCOT, "idle");
  return <span className={"scan-mascot " + (className ?? "")} style={{ "--scan-tone": avatarColor(SIDEVOICE_MASCOT) } as CSSProperties} aria-hidden="true">
    <CharacterAvatar spec={SIDEVOICE_MASCOT} state={avatar} size="small" />
  </span>;
}

/** The frame's four corners, in the accent: what to aim at, without a box drawn over the camera. */
export function ScanCorners() {
  return <>{(["tl", "tr", "bl", "br"] as const).map((corner) => <span key={corner} className="scan-corner" data-corner={corner} aria-hidden="true" />)}</>;
}

/** What the viewfinder shows over the camera: the hint, the frame and Cancel. Also the design system's picture of it. */
export function Viewfinder({ look, cancel }: { look: ViewfinderLook; cancel: ReactNode }) {
  const t = translator();
  if (look === "plain") return <>
    <p className="scan-hint">{t("pairing.scanHint")}</p>
    <div className="scan-frame" aria-hidden="true" />
    {cancel}
  </>;
  return <>
    <div className="scan-head">
      <p className="scan-title">{t("pairing.scanTitle")}</p>
      <p className="scan-lead">{t("pairing.scanHint")}</p>
    </div>
    <div className="scan-window" aria-hidden="true"><ScanCorners /><ScanMascot /></div>
    {cancel}
  </>;
}

export function ScanOverlay({ onCancel, look = "plain" }: { onCancel: () => void; look?: ViewfinderLook }) {
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
    <dialog ref={dialog} className="scan-overlay" data-look={look} data-theme={look === "stage" ? "dark" : undefined} aria-label={t("pairing.scanTitle")}
      onCancel={(event) => { event.preventDefault(); event.stopPropagation(); onCancel(); }}>
      <Viewfinder look={look} cancel={<Button variant="secondary" className="scan-cancel" autoFocus onClick={onCancel}>{t("pairing.scanCancel")}</Button>} />
    </dialog>,
    document.body,
  );
}

/** C's viewfinder, inside the pairing card itself (VARIANTS `pairingScan` = `scanFirst`): at rest, the dark stage with the
 *  frame's corners, the mascot and the way to start; while scanning, the camera shows through this very box. Every layer
 *  above the camera is then transparent where the box is (`data-scanning="inline"`, pairing.css): its ancestors lose their
 *  background, and the box paints the colour they had (`--scan-fill`) everywhere around itself. Not a modal: Escape and
 *  Cancel end the scan, and the rest of the card stays where it was. */
export function ScanInCard({ scanning, start, onCancel }: { scanning: boolean; start: ReactNode; onCancel: () => void }) {
  const t = translator();
  const box = useRef<HTMLDivElement>(null);
  const cancel = useRef(onCancel);
  useEffect(() => { cancel.current = onCancel; });
  useEffect(() => {
    const node = box.current;
    if (!scanning || !node) return;
    // The colour the box sits on (a dialog's surface, the setup's page), read before its ancestors go transparent.
    let fill = "";
    for (let at = node.parentElement; at && !fill; at = at.parentElement) {
      const colour = getComputedStyle(at).backgroundColor;
      if (colour && colour !== "transparent" && !/rgba\(.*,\s*0\)$/.test(colour)) fill = colour;
    }
    node.style.setProperty("--scan-fill", fill || "var(--sv-surface)");
    document.documentElement.setAttribute("data-scanning", "inline");
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); cancel.current(); } };
    document.addEventListener("keydown", escape, true);
    return () => {
      document.removeEventListener("keydown", escape, true);
      document.documentElement.removeAttribute("data-scanning");
      node.style.removeProperty("--scan-fill");
    };
  }, [scanning]);
  return (
    <div ref={box} className="scan-card" data-theme="dark" data-scanning={scanning || undefined}
      role={scanning ? "region" : undefined} aria-label={scanning ? t("pairing.scanTitle") : undefined}>
      <span className="scan-card-fill" aria-hidden="true" />
      <ScanCorners />
      <ScanMascot />
      <p className="scan-card-hint">{t("pairing.scanHint")}</p>
      {scanning ? <Button variant="secondary" className="scan-card-action" autoFocus onClick={onCancel}>{t("pairing.scanCancel")}</Button> : start}
    </div>
  );
}
