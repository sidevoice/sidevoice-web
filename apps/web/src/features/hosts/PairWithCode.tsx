import { useState, type FormEvent } from "react";
import { Button } from "../../components/ui/Button";
import { decodePairingCode, deviceName } from "../../services/device-pairing.js";
import { useT } from "../../i18n";
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
export function PairWithCode({ onPaired, submitLabel, use = true }: { onPaired: (fp: string) => void; submitLabel?: string; use?: boolean }) {
  const t = useT();
  const hosts = useHostsController();
  const [code, setCode] = useState("");
  const [name, setName] = useState(() => deviceName());
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
      {error && <p className="form-error" role="alert">{error.text ?? t(error.key)}</p>}
      <Button type="submit" variant="primary" disabled={busy || !code.trim()}>{busy ? t("pair.connecting") : submitLabel ?? t("pair.connect")}</Button>
    </form>
  );
}
