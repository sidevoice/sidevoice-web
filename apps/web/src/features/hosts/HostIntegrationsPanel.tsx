import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { CloseIcon } from "../../components/ui/Icons";
import type { IntegrationListing, IntegrationProvider } from "../../state/room-types";
import { hostTranslator } from "../settings/host-i18n";

function providerUses(provider: IntegrationProvider, t: ReturnType<typeof hostTranslator>) {
  return provider.capabilities.map((capability) => t(capability === "voice" ? "settings.voice" : "settings.transcription")).join(", ");
}

/** Provider keys stay in the input and are sent only to the machine whose page is open. */
export function HostIntegrationsPanel({ fp, focusProvider }: { fp: string; focusProvider?: string | null }) {
  const t = hostTranslator();
  const [listing, setListing] = useState<IntegrationListing | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);
  const request = useRef(0);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const fields = useRef<Record<string, HTMLInputElement | null>>({});

  async function refresh() {
    const action = window.sidevoiceActions?.loadHostIntegrations;
    const epoch = ++request.current;
    setLoading(true);
    setError(false);
    try {
      if (!action) throw new Error("unavailable");
      const next = await action(fp);
      if (request.current === epoch) setListing(next);
    } catch {
      if (request.current === epoch) setError(true);
    } finally {
      if (request.current === epoch) setLoading(false);
    }
  }

  useEffect(() => {
    setListing(null);
    setDrafts({});
    void refresh();
    return () => {
      request.current++;
      for (const timer of Object.values(timers.current)) clearTimeout(timer);
      timers.current = {};
    };
    // A page instance belongs to one pairing fingerprint.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fp]);

  useEffect(() => {
    const field = focusProvider ? fields.current[focusProvider] : null;
    if (!field) return;
    field.scrollIntoView?.({ block: "nearest" });
    field.focus();
  }, [focusProvider, listing]);

  async function save(provider: IntegrationProvider, entered = drafts[provider.id] || "") {
    clearTimeout(timers.current[provider.id]);
    delete timers.current[provider.id];
    const key = entered.trim();
    if (!key || busy[provider.id]) return;
    const action = window.sidevoiceActions?.setHostIntegrationKey;
    if (!action) { setError(true); return; }
    setBusy((current) => ({ ...current, [provider.id]: true }));
    setError(false);
    try {
      const next = await action(fp, provider.id, key);
      setListing(next);
      setDrafts((current) => current[provider.id]?.trim() === key ? { ...current, [provider.id]: "" } : current);
    } catch {
      setError(true);
    } finally {
      setBusy((current) => ({ ...current, [provider.id]: false }));
    }
  }

  async function remove(provider: IntegrationProvider) {
    const action = window.sidevoiceActions?.clearHostIntegrationKey;
    if (!action || provider.source === "environment") return;
    setBusy((current) => ({ ...current, [provider.id]: true }));
    setError(false);
    try { setListing(await action(fp, provider.id)); }
    catch { setError(true); }
    finally { setBusy((current) => ({ ...current, [provider.id]: false })); }
  }

  return <section className="host-integrations-panel" aria-labelledby="host-integrations-title">
    <h4 id="host-integrations-title">{t("hosts.integrations.title")}</h4>
    <p className="muted">{t("hosts.integrations.description")}</p>
    {error && <p role="alert">{t("hosts.integrations.failed")}</p>}
    {loading && !listing && <p className="muted" role="status">{t("hosts.integrations.loading")}</p>}
    {error && <Button type="button" variant="ghost" size="compact" onClick={() => void refresh()}>{t("hosts.retry")}</Button>}
    {listing && listing.providers.map((provider) => {
      const environment = provider.configured && provider.source === "environment";
      const placeholder = provider.configured ? `${t("hosts.integrations.savedKey")} ${provider.hint || ""}`.trim() : t("hosts.integrations.noKey");
      return <div className="integration-row host-integration-row" key={provider.id} data-configured={provider.configured || undefined}>
        <label htmlFor={`host-integration-${provider.id}`}>
          <span className="integration-name">{provider.label}</span>
          <span className="integration-uses muted">{providerUses(provider, t)}</span>
        </label>
        <span className="key-field">
          <input id={`host-integration-${provider.id}`} ref={(node) => { fields.current[provider.id] = node; }} type="password" autoComplete="off" spellCheck={false}
            aria-label={t("hosts.integrations.keyFor", { provider: provider.label })} placeholder={placeholder}
            value={drafts[provider.id] || ""} disabled={busy[provider.id]}
            onChange={(event) => {
              const value = event.currentTarget.value;
              setDrafts((current) => ({ ...current, [provider.id]: value }));
              clearTimeout(timers.current[provider.id]);
              if (value.trim()) timers.current[provider.id] = setTimeout(() => void save(provider, value), 650);
            }}
              onBlur={() => void save(provider)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              void save(provider);
            }} />
          <Button type="button" variant="ghost" size="icon" className="key-clear" disabled={!provider.configured || environment || !!busy[provider.id]}
            aria-label={t("hosts.integrations.removeKey", { provider: provider.label })} title={t("hosts.integrations.removeKey", { provider: provider.label })}
            onClick={() => void remove(provider)}><CloseIcon size={15} /></Button>
        </span>
        <p className="muted integration-note" role="status">
          {busy[provider.id] ? t("hosts.integrations.saving")
            : environment ? t("hosts.integrations.environment", { name: provider.environment || "" }) : provider.configured ? t("hosts.integrations.configured") : ""}
        </p>
      </div>;
    })}
    {listing?.providers.length === 0 && <p className="muted">{t("hosts.integrations.empty")}</p>}
  </section>;
}
