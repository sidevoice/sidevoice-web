import { useEffect, useState } from "react";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { DialogSurface } from "../../components/ui/Dialog";
import { useRoomStore } from "../../state/room-store";
import { hostTranslator } from "../settings/host-i18n";
import { PairMachine } from "./PairMachine";
import "./pairing.css";

/** Pairing this device with a machine (the node side: sidevoice-core `server/devices.py`): the machine issues a one-time code — shown by
 *  the agent when the person asks, or by `sidevoice pair-device` — and it is pasted here. The page opens this by
 *  itself when it has no machine to talk to, or when the one it used no longer knows it; it says why on top.
 *  The code is checked and redeemed by the controller; this only collects it and says how that went. The dialog stays
 *  in the page while closed, so the form is there (emptied) for the next time. */
export function PairingDialog() {
  const t = hostTranslator();
  const prompt = useRoomStore((state) => state.pairing);
  const [opened, setOpened] = useState(0);
  // Where the form's Connect goes: the dialog's footer, beside Cancel.
  const [actions, setActions] = useState<HTMLElement | null>(null);

  // The store says whether it is open; the element follows. Escape, or the close button, tell the store.
  useEffect(() => {
    const dialog = document.getElementById("device-pairing") as HTMLDialogElement | null;
    if (!dialog) return;
    if (prompt.open && !dialog.open) {
      setOpened((count) => count + 1);
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
    }
    if (!prompt.open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close(); else dialog.removeAttribute("open");
    }
  }, [prompt.open]);
  useEffect(() => {
    const dialog = document.getElementById("device-pairing");
    const closed = () => window.sidevoiceActions?.closePairing();
    dialog?.addEventListener("close", closed);
    return () => dialog?.removeEventListener("close", closed);
  }, []);
  const close = () => window.sidevoiceActions?.closePairing();

  return (
    <dialog id="device-pairing" className="ui-dialog pair-dialog" data-layout="dialog" aria-labelledby="device-pairing-title">
      <DialogSurface titleId="device-pairing-title" title={t("noMachine.connect")} closeId="device-pairing-close" closeLabel={t("noMachine.closePairing")} onClose={close}
        footer={<><Button variant="ghost" tone="neutral" onClick={close}>{t("hosts.cancel")}</Button><span ref={setActions} className="pairing-submit" /></>}>
        {prompt.note && <div className="pairing-note" role="status"><Alert tone="warning" title={prompt.note} /></div>}
        <PairMachine key={opened} autoFocus submitIn={actions} />
      </DialogSurface>
    </dialog>
  );
}
