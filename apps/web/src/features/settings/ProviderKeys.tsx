import { useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { remoteProviders } from "../../services/voice-settings.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";

/* The remote providers' keys, one per remote catalogue of the engine, kept by the engine's host on this device: the
 * desktop app in the system keychain, a browser in this page's storage. A key typed here goes to the engine's host and
 * nowhere else; the page never reads it back. */

function keyError(t: HostTranslate, error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code ? t("keys.failed", { code }) : (error as Error | null)?.message || t("keys.failedPlain");
}

function ProviderKey({ provider, name, t }: { provider: string; name: string; t: HostTranslate }) {
  const kept = useRoomStore((state) => state.facts.providerKeys[provider]);
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const keep = async (key: string | null) => {
    setBusy(true);
    setNote("");
    try {
      await window.sidevoiceActions?.saveProviderKey(provider, key);
      setValue("");
      setNote(key ? t("keys.saved") : t("keys.removed"));
    } catch (error) {
      setNote(keyError(t, error));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="provider-key" data-provider={provider}>
      <div className="provider-key-head"><strong>{name}</strong><span className="muted">{kept === true ? t("keys.kept") : kept === false ? t("keys.missing") : "—"}</span></div>
      <label>{t("keys.label", { provider: name })}
        <input id={"provider-key-" + provider} type="password" autoComplete="off" spellCheck={false} value={value} placeholder={kept ? t("keys.placeholder.replace") : t("keys.placeholder.new")} onChange={(event) => setValue(event.target.value)} />
      </label>
      <div className="provider-key-actions">
        <Button id={"provider-key-save-" + provider} disabled={busy || !value.trim()} onClick={() => void keep(value.trim())}>{t("keys.save")}</Button>
        <Button id={"provider-key-remove-" + provider} variant="ghost" disabled={busy || kept !== true} onClick={() => void keep(null)}>{t("keys.remove")}</Button>
      </div>
      <p className="muted" role="status">{note}</p>
    </div>
  );
}

export function ProviderKeys() {
  const t = hostTranslator();
  const inApp = useRoomStore((state) => state.facts.inApp);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const providers = remoteProviders(catalogue.catalogs);
  return (
    <section id="pane-providers" aria-labelledby="settings-providers" hidden>
      <h3>{t("keys.title")}</h3>
      <p className="muted">{t("keys.intro")}</p>
      {inApp
        ? <p className="muted" id="provider-keys-where">{t("keys.inApp")}</p>
        : <p className="provider-keys-warning" id="provider-keys-where" role="note">{t("keys.browser")}</p>}
      {/* The providers are the engine's remote catalogues: while they load, or when they could not be read, it says so
          rather than listing none. */}
      {catalogue.state === "loading" || catalogue.state === "idle" ? <p className="muted" role="status" id="provider-keys-loading">{t("keys.loading")}</p> : null}
      {catalogue.state === "failed" ? (
        <p role="alert" className="voice-catalogue-error" id="provider-keys-failed">{catalogue.error} <Button id="provider-keys-retry" variant="ghost" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button></p>
      ) : null}
      {catalogue.state === "ready" ? (providers.length
        ? providers.map((provider) => <ProviderKey key={provider.id} provider={provider.id} name={provider.name} t={t} />)
        : <p className="muted" id="provider-keys-none">{t("keys.none")}</p>) : null}
    </section>
  );
}
