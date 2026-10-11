import { useEffect, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { DialogSurface } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input, Textarea } from "../../components/ui/Input";
import { useRoomStore } from "../../state/room-store";
import { currentDeviceName } from "../../state/device-name";
import { hostTranslator } from "../settings/host-i18n";
import { ConnectorSteps } from "./ConnectorSteps";
import { ADDRESS_INSECURE, ADDRESS_INVALID, decodePairingCode } from "../../services/device-pairing.js";
import "./pairing.css";

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
        <section className="remote-setup-guidance" aria-labelledby="device-pairing-prepare">
          <h3 id="device-pairing-prepare">{t("noMachine.prepareTitle")}</h3>
          <ConnectorSteps />
        </section>
        <PairingCodeForm key={opened} autoFocus submitIn={actions} />
      </DialogSurface>
    </dialog>
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
 *  own machine pairs by itself and never comes here.
 *  Its Connect sits at the end of the form, or, given `submitIn`, in the footer of whatever holds the form (a dialog's,
 *  the setup's), still submitting it through its `form` attribute; `null` while that footer is not there yet. */
export function PairingCodeForm({ idPrefix = "device-pairing", autoFocus = false, rows = 3, submitIn }: {
  idPrefix?: string; autoFocus?: boolean; rows?: number; submitIn?: HTMLElement | null;
}) {
  const t = hostTranslator();
  const [code, setCode] = useState("");
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const codeField = useRef<HTMLTextAreaElement>(null);
  const errorBox = useRef<HTMLDivElement>(null);
  useEffect(() => { if (autoFocus) codeField.current?.focus(); }, [autoFocus]);
  // The form scrolls inside its dialog and Connect stays in the footer: why it failed is brought into sight.
  useEffect(() => { if (error) errorBox.current?.scrollIntoView?.({ block: "nearest" }); }, [error]);

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

  const formId = `${idPrefix}-form`;
  const connect = <Button type="submit" form={formId} variant="primary" loading={busy} disabled={busy || !code.trim() || !address.trim()}>
    {busy ? t("pairing.connecting") : t("pairing.connect")}
  </Button>;
  return (
    <form id={formId} className="pairing-form" onSubmit={submit} aria-busy={busy}>
      <Field label={t("pairing.address")} hint={t("pairing.addressHint")}>
        <Input id={`${idPrefix}-address`} type="text" inputMode="url" value={address} placeholder={t("pairing.addressPlaceholder")} required disabled={busy}
          spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" onChange={(event) => setAddress(event.currentTarget.value)} />
      </Field>
      <Field label={t("pairing.code")}>
        <Textarea ref={codeField} id={`${idPrefix}-code`} className="pairing-code" minRows={rows} maxRows={6} value={code} placeholder={t("pairing.codePlaceholder")}
          required disabled={busy} spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" onChange={(event) => {
            const next = event.currentTarget.value;
            setCode(next);
            if (!address.trim()) setAddress(codeAddress(next));
          }} />
      </Field>
      <div ref={errorBox} className="pairing-error">{error && <Alert tone="danger" live title={error} />}</div>
      {submitIn === undefined ? <div className="pairing-form-actions">{connect}</div> : submitIn && createPortal(connect, submitIn)}
    </form>
  );
}
