import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { DialogFrame } from "../../components/ui/DialogFrame";
import { useRoomStore } from "../../state/room-store";
import { currentDeviceName } from "../../state/device-name";
import { hostTranslator } from "../settings/host-i18n";
import { ConnectorSteps } from "./ConnectorSteps";
import { ADDRESS_INSECURE, ADDRESS_INVALID, decodePairingCode } from "../../services/device-pairing.js";

function pairingError(reason: unknown, t: ReturnType<typeof hostTranslator>) {
  const message = reason instanceof Error ? reason.message : String(reason);
  if (message === ADDRESS_INVALID) return t("pairing.addressInvalid");
  if (message === ADDRESS_INSECURE) return t("pairing.addressInsecure");
  if (/Pega el código/.test(message)) return t("pairing.empty");
  if (/empieza por|incompleto o dañado/.test(message)) return t("pairing.invalid");
  if (/caduc|expired|already used|already been used/i.test(message)) return t("pairing.expired");
  if (/otra versión|another version|incompatible/i.test(message)) return t("pairing.incompatible");
  if (/dónde encontrar|where the machine can be found/i.test(message)) return t("pairing.noRoute");
  if (/navegador no puede comprobar|WebCrypto|verify the machine/i.test(message)) return t("pairing.noWebCrypto");
  if (/no es la del código|does not match this code/i.test(message)) return t("pairing.identityMismatch");
  if (/no se pudo llegar|could not reach|unreachable|Failed to fetch/i.test(message)) return t("pairing.unreachable");
  return t("pairing.failed", { reason: t("pairing.unreachable") });
}

/** Pairing this device with a machine (the node side: sidevoice-core `server/devices.py`): the machine issues a one-time code — shown by
 *  the agent when the person asks, or by `sidevoice pair-device` — and it is pasted here. The page opens this by
 *  itself when it has no machine to talk to, or when the one it used no longer knows it; it says why on top.
 *  The code is checked and redeemed by the controller; this only collects it and says how that went. */
export function PairingDialog() {
  const t = hostTranslator();
  const prompt = useRoomStore((state) => state.pairing);
  const [opened, setOpened] = useState(0);

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

  return (
    <DialogFrame id="device-pairing" className="pair-dialog device-pairing" labelledBy="device-pairing-title" title={t("noMachine.connect")}
      closeId="device-pairing-close" closeLabel={t("noMachine.closePairing")} closeTitle={t("noMachine.closePairing")} onClose={() => window.sidevoiceActions?.closePairing()}>
      <section className="remote-setup-guidance">
        <h3>{t("noMachine.prepareTitle")}</h3>
        <ConnectorSteps />
      </section>
      {prompt.note && <p className="pairing-note" role="status">{prompt.note}</p>}
      <PairingCodeForm key={opened} autoFocus />
    </DialogFrame>
  );
}

/** Where a code says its machine is, for the address field to start from: its first address another device could
 *  reach (not this computer's loopback). Nothing when the code cannot be read yet. */
function codeAddress(code: string): string {
  try {
    return decodePairingCode(code).urls.find((url) => !/^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:|\/|$)/.test(url)) ?? "";
  } catch {
    return "";
  }
}

/** The pairing form: the machine's address and the code it issued (`sidevoice pair-device`, or the agent). Another
 *  machine is not this one, so the page asks where it is: its address and port, over https. The code fills the
 *  address in when it carries one. Used by the pairing dialog and, inline, by the first-run setup; this computer's
 *  own machine pairs by itself and never comes here. */
export function PairingCodeForm({ idPrefix = "device-pairing", autoFocus = false, rows = 4 }: { idPrefix?: string; autoFocus?: boolean; rows?: number }) {
  const t = hostTranslator();
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeField = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (autoFocus) codeField.current?.focus(); }, [autoFocus]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !code.trim() || !address.trim()) return;
    setBusy(true);
    setError("");
    try {
      await window.sidevoiceActions?.pairDevice(code, currentDeviceName((where) => t("pair.deviceName", { where })), address);
      setCode("");
    } catch (reason) {
      setError(pairingError(reason, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pairing-form" onSubmit={submit} aria-busy={busy}>
      <label>{t("pairing.address")}
        <input id={`${idPrefix}-address`} type="text" inputMode="url" value={address} placeholder={t("pairing.addressPlaceholder")} required disabled={busy}
          spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" aria-describedby={`${idPrefix}-address-hint`}
          onChange={(event) => setAddress(event.currentTarget.value)} />
        <span id={`${idPrefix}-address-hint`} className="muted pairing-hint">{t("pairing.addressHint")}</span>
      </label>
      <label>{t("pairing.code")}
        <textarea ref={codeField} id={`${idPrefix}-code`} rows={rows} value={code} placeholder={t("pairing.codePlaceholder")} required disabled={busy}
          spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" onChange={(event) => {
            const next = event.currentTarget.value;
            setCode(next);
            if (!address.trim()) setAddress(codeAddress(next));
          }} />
      </label>
      <p id={`${idPrefix}-error`} className="pairing-error" role="alert">{error}</p>
      <Button type="submit" variant="primary" disabled={busy || !code.trim() || !address.trim()}>{busy ? t("pairing.connecting") : t("pairing.connect")}</Button>
    </form>
  );
}
