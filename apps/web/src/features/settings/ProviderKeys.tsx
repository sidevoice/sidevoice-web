import { useState } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Group, Row, Section } from "../../components/ui/Card";
import { ProviderLogo } from "../../components/ui/Icons";
import { remoteProviders } from "../../services/voice-settings.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";

/* The remote providers' keys, one per remote catalogue of the engine, kept by the engine's host on this device: the
 * desktop app in the system keychain, a browser in this page's storage. A key typed here goes to the engine's host and
 * nowhere else; the page never reads it back. */

function keyError(t: HostTranslate, error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code ? t("keys.failed", { code }) : (error as Error | null)?.message || t("keys.failedPlain");
}

/** One provider's key: kept or not, typed and saved through the engine's host, removed. */
export function ProviderKey({ provider, name, t }: { provider: string; name: string; t: HostTranslate }) {
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
      <Field label={t("keys.label", { provider: name })} aside={<Badge tone={kept === true ? "positive" : "neutral"} dot={kept === true}>{kept === true ? t("keys.kept") : kept === false ? t("keys.missing") : "—"}</Badge>}>
        <Input id={"provider-key-" + provider} type="password" autoComplete="off" spellCheck={false} value={value} placeholder={kept ? t("keys.placeholder.replace") : t("keys.placeholder.new")} onChange={(event) => setValue(event.target.value)} />
      </Field>
      <div className="provider-key-actions">
        <p className="muted" role="status">{note}</p>
        <Button id={"provider-key-remove-" + provider} variant="ghost" tone="neutral" size="sm" disabled={busy || kept !== true} onClick={() => void keep(null)}>{t("keys.remove")}</Button>
        <Button id={"provider-key-save-" + provider} size="sm" disabled={busy || !value.trim()} loading={busy} onClick={() => void keep(value.trim())}>{t("keys.save")}</Button>
      </div>
    </div>
  );
}

/** A provider's name with its own mark, when it has one here. */
export function ProviderName({ provider, name }: { provider: string; name: string }) {
  return <span className="provider-name"><span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={18} /></span>{name}</span>;
}

export function ProviderKeys() {
  const t = hostTranslator();
  const inApp = useRoomStore((state) => state.facts.inApp);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const providers = remoteProviders(catalogue.catalogs);
  return (
    <Section id="providers" title={t("keys.title")} description={t("keys.intro")}>
      {inApp
        ? <p className="muted" id="provider-keys-where">{t("keys.inApp")}</p>
        : <div id="provider-keys-where" role="note"><Alert tone="warning" title={t("keys.browserTitle")}>{t("keys.browser")}</Alert></div>}
      {/* The providers are the engine's remote catalogues: while they load, or when they could not be read, it says so
          rather than listing none. */}
      {catalogue.state === "loading" || catalogue.state === "idle" ? <p className="muted" role="status" id="provider-keys-loading">{t("keys.loading")}</p> : null}
      {catalogue.state === "failed" ? (
        <div id="provider-keys-failed" role="alert"><Alert tone="danger" title={catalogue.error}
          action={<Button id="provider-keys-retry" size="sm" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button>} /></div>
      ) : null}
      {catalogue.state === "ready" ? (providers.length
        ? <Group>{providers.map((provider) => <Row key={provider.id} label={<ProviderName provider={provider.id} name={provider.name} />} block>
            <ProviderKey provider={provider.id} name={provider.name} t={t} />
          </Row>)}</Group>
        : <p className="muted" id="provider-keys-none">{t("keys.none")}</p>) : null}
    </Section>
  );
}
