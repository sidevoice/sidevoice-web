import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { DialogFrame } from "../../components/ui/DialogFrame";
import { deviceName } from "../../services/device-pairing.js";
import { useRoomStore } from "../../state/room-store";

/** Pairing this device with a machine (docs/DEVICE_PAIRING.md): the machine issues a one-time code — shown by
 *  the agent when the person asks, or by `sidevoice pair-device` — and it is pasted here. The page opens this by
 *  itself when it has no machine to talk to, or when the one it used no longer knows it; it says why on top.
 *  The code is checked and redeemed by the controller; this only collects it and says how that went. */
export function PairingDialog() {
  const prompt = useRoomStore((state) => state.pairing);
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => deviceName());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
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
      await window.sidevoiceActions?.pairDevice(code, name);
      setCode("");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogFrame id="device-pairing" className="pair-dialog device-pairing" labelledBy="device-pairing-title" title="Emparejar este dispositivo"
      closeId="device-pairing-close" onClose={() => window.sidevoiceActions?.closePairing()}>
      {prompt.note && <p className="pairing-note" role="status">{prompt.note}</p>}
      <form className="pairing-form" onSubmit={submit} aria-busy={busy}>
        <label>Código de emparejamiento
          <textarea ref={codeField} id="device-pairing-code" rows={4} value={code} placeholder="SV1.…" required disabled={busy}
            spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" onChange={(event) => setCode(event.currentTarget.value)} />
        </label>
        <label>Nombre de este dispositivo
          <input id="device-pairing-name" value={name} maxLength={60} autoComplete="off" disabled={busy} onChange={(event) => setName(event.currentTarget.value)} />
        </label>
        <p className="muted">Pide el código a tu agente («empareja un dispositivo») o ejecuta <code>sidevoice pair-device</code> en la máquina.</p>
        <p id="device-pairing-error" className="pairing-error" role="alert">{error}</p>
        <Button type="submit" variant="primary" disabled={busy || !code.trim()}>{busy ? "Emparejando…" : "Emparejar"}</Button>
      </form>
    </DialogFrame>
  );
}
