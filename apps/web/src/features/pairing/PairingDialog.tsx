import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { DialogFrame } from "../../components/ui/DialogFrame";
import { useRoomStore } from "../../state/room-store";
import { currentDeviceName } from "../../state/device-name";
import { hostTranslator } from "../settings/host-i18n";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "./connector-commands";

function pairingError(reason: unknown, t: ReturnType<typeof hostTranslator>) {
  const message = reason instanceof Error ? reason.message : String(reason);
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
  const setupCommand = CONNECTOR_INSTALL;
  const prompt = useRoomStore((state) => state.pairing);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [copyNote, setCopyNote] = useState("");
  const codeField = useRef<HTMLTextAreaElement>(null);

  // The store says whether it is open; the element follows. Escape, or the close button, tell the store.
  useEffect(() => {
    const dialog = document.getElementById("device-pairing") as HTMLDialogElement | null;
    if (!dialog) return;
    if (prompt.open && !dialog.open) {
      setError("");
      if (typeof dialog.showModal === "function") dialog.showModal(); else dialog.setAttribute("open", "");
      codeField.current?.focus();
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

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError("");
    try {
      await window.sidevoiceActions?.pairDevice(code, currentDeviceName((where) => t("pair.deviceName", { where })));
      setCode("");
    } catch (reason) {
      setError(pairingError(reason, t));
    } finally {
      setBusy(false);
    }
  }

  async function copySetupCommand() {
    try {
      await navigator.clipboard.writeText(setupCommand);
      setCopyNote(t("noMachine.commandCopied"));
    } catch {
      setCopyNote(t("noMachine.commandCopyFailed"));
    }
  }

  return (
    <DialogFrame id="device-pairing" className="pair-dialog device-pairing" labelledBy="device-pairing-title" title={t("noMachine.connect")}
      closeId="device-pairing-close" closeLabel={t("noMachine.closePairing")} closeTitle={t("noMachine.closePairing")} onClose={() => window.sidevoiceActions?.closePairing()}>
      <section className="remote-setup-guidance">
        <h3>{t("noMachine.prepareTitle")}</h3>
        <p>{t("noMachine.prepareBody")}</p>
        <div className="setup-command"><code>{setupCommand}</code><Button variant="ghost" size="compact" onClick={() => void copySetupCommand()}>{t("noMachine.copyCommand")}</Button></div>
        <p className="muted" role="status">{copyNote || t("noMachine.pairingBody", { command: CONNECTOR_PAIR_DEVICE })}</p>
      </section>
      {prompt.note && <p className="pairing-note" role="status">{prompt.note}</p>}
      <form className="pairing-form" onSubmit={submit} aria-busy={busy}>
        <label>{t("pairing.code")}
          <textarea ref={codeField} id="device-pairing-code" rows={4} value={code} placeholder={t("pairing.codePlaceholder")} required disabled={busy}
            spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" onChange={(event) => setCode(event.currentTarget.value)} />
        </label>
        <p id="device-pairing-error" className="pairing-error" role="alert">{error}</p>
        <Button type="submit" variant="primary" disabled={busy || !code.trim()}>{busy ? t("pairing.connecting") : t("pairing.connect")}</Button>
      </form>
    </DialogFrame>
  );
}
