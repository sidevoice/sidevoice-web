import { useState, type FormEvent, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { decodePairingCode, deviceName } from "../../services/device-pairing.js";
import { currentLanguage, useT } from "../../i18n";
import { useHostsController } from "../../state/hosts/hosts-store";

const LOOPBACK = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?(\/|$)/;

/** Why a code could not be used, as a message key (W2′, §5.1). device-pairing.js still words its refusals in Spanish
 *  sentences (#128); they are recognised here by their stable start and said through the bundles. */
export function pairingFailureKey(error: unknown): { key: string; text?: string } {
  const message = error instanceof Error ? error.message : String(error);
  if (message === "storage") return { key: "pair.error.storage" };
  if (/^Eso no es un código|incompleto o dañado|Pega el código/.test(message)) return { key: "pair.error.malformed" };
  if (/ya caducó/.test(message)) return { key: "pair.error.expired" };
  if (/no puede comprobar la identidad/.test(message)) return { key: "pair.error.noWebCrypto" };
  if (/^No se pudo llegar/.test(message)) return { key: "pair.error.unreachable" };
  if (/no es la del código/.test(message)) return { key: "pair.error.mismatch" };
  if (/^Ese código no vale|REFUSED_SECRET|ya no vale/.test(message)) return { key: "pair.error.used" };
  // The pairing module still says these in Spanish (#17): each one is a key here, so it reads in the UI's language.
  if (/por http sin cifrar/.test(message)) return { key: "pair.error.plaintext" };
  if (/de otra versión de Sidevoice/.test(message)) return { key: "pair.error.version" };
  if (/no dice dónde encontrar/.test(message)) return { key: "pair.error.noAddress" };
  if (/no aceptó el emparejamiento/.test(message)) return { key: "pair.error.refused" };
  return { key: "pair.error.other", text: message };
}

/** A code that leads only to the machine's own loopback cannot be used from another device (F2 step 3). */
export function loopbackOnly(code: string): boolean {
  try {
    const payload = decodePairingCode(code);
    return !payload.rv && payload.urls.length > 0 && payload.urls.every((url: string) => LOOPBACK.test(url));
  } catch { return false; }
}

/** W2′ «Conecta con tu máquina», and Configuración › Máquinas › «Añadir una máquina» (F4): a code and this
 *  device's name; the page redeems it. */
export function PairWithCode({ onPaired, submitLabel, use = true, renderActions = (submit) => submit }: { onPaired: (fp: string) => void; submitLabel?: string; use?: boolean; renderActions?: (submit: ReactNode) => ReactNode }) {
  const t = useT();
  const hosts = useHostsController();
  const [code, setCode] = useState("");
  // device-pairing.js names this device in Spanish (#128); the platform it found is said through the bundles.
  const [name, setName] = useState(() => { const where = deviceName().replace(/^Sidevoice( en )?/, ""); return where ? t("pair.deviceName", { where }) : "Sidevoice"; });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<{ key: string; text?: string } | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setError(null);
    if (loopbackOnly(code)) { setError({ key: "pair.error.loopbackOnly" }); return; }
    setBusy(true);
    try {
      const pairing = await hosts.addRemote(code, name, { use });
      setCode("");
      onPaired(pairing.fp);
    } catch (reason) {
      setError(pairingFailureKey(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="pair-with-code" onSubmit={submit} aria-busy={busy}>
      <ol className="pair-steps muted">
        <li>{t("pair.step1")}</li>
        <li>{t("pair.step2")} <code>sidevoice pair-device</code></li>
        <li>{t("pair.step3")}</li>
      </ol>
      <label className="ui-field">{t("pair.code")}
        <textarea id="pair-code" className="pair-code" rows={3} value={code} placeholder="SV1.…" required disabled={busy}
          spellCheck={false} autoComplete="off" autoCapitalize="off" autoCorrect="off" onChange={(event) => setCode(event.currentTarget.value)} />
      </label>
      <label className="ui-field">{t("pair.name")}
        <input id="pair-name" value={name} maxLength={60} autoComplete="off" disabled={busy} onChange={(event) => setName(event.currentTarget.value)} />
      </label>
      {error && <p className="form-error" role="alert">{error.text && currentLanguage() === "es" ? error.text : t(error.key)}</p>}
      {renderActions(<Button type="submit" variant="primary" disabled={busy || !code.trim()}>{busy ? t("pair.connecting") : submitLabel ?? t("pair.connect")}</Button>)}
    </form>
  );
}
