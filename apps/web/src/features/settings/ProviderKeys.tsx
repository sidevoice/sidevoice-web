import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Section } from "../../components/ui/Card";
import { CheckIcon, ExternalLinkIcon, ProviderLogo, WarningIcon } from "../../components/ui/Icons";
import { remoteProviders } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { catalogueShown } from "./ModelSetup";
import type { HostMessageKey } from "./messages/en";

/* The remote providers, a card each, as apps show an account to connect: its mark, its name and what it is used for,
 * and Connect. Connect opens the key's form in the card — paste the key, Test and save (the provider is asked with it
 * before it is kept), Get a key. Connected, the card says so with a check, shows the key's last four, and offers Replace
 * and Remove; when the provider refuses the key, the card says why in its words. The key goes to the engine's host —
 * the system keychain in the app, this browser's storage on the web — and is never read back: the last four are the
 * page's own note of it. */

/** Where each provider gives its keys. */
const KEY_PAGES: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
};

/** The page's own note of a kept key: its last four and when it was added. Only this file writes it. */
const HINT_PREFIX = "sidevoice.provider-key-hint.";
type Hint = { last4: string; addedAt: number };
function readHint(provider: string): Hint | null {
  try { return JSON.parse(localStorage.getItem(HINT_PREFIX + provider) || "null"); } catch { return null; }
}
function writeHint(provider: string, key: string | null) {
  try {
    if (key) localStorage.setItem(HINT_PREFIX + provider, JSON.stringify({ last4: key.slice(-4), addedAt: Date.now() }));
    else localStorage.removeItem(HINT_PREFIX + provider);
  } catch { /* Shown for this visit only. */ }
}

type State = "absent" | "checking" | "connected" | "rejected" | "permission" | "quota" | "limited" | "unreachable" | "unreadable" | "unknown" | "problem";

/** A provider's reason code as the card's state. */
function reasonState(code: string | undefined): State {
  if (!code) return "connected";
  if (code === "credential-rejected") return "rejected";
  if (code === "listing-not-permitted") return "permission";
  if (code === "provider-quota") return "quota";
  if (code === "rate-limited") return "limited";
  if (code === "provider-unreachable" || code === "listing-failed") return "unreachable";
  if (code === "credentials-failed" || code === "storage-blocked" || code === "credential-missing") return "unreadable";
  return "problem";
}

/** Where a provider's key stands: what the host keeps, and what the provider said last about it. */
function keyState(kept: boolean | null | undefined, catalog: CatalogView | undefined, busy: boolean): State {
  if (busy) return "checking";
  if (kept === false) return "absent";
  if (kept === undefined || kept === null) return "unknown";
  return reasonState(catalog?.status.reason?.code);
}

const TONE: Record<State, BadgeTone> = {
  absent: "neutral", checking: "neutral", connected: "positive", rejected: "danger", permission: "warning", quota: "warning",
  limited: "warning", unreachable: "neutral", unreadable: "danger", unknown: "neutral", problem: "warning",
};

/** What a provider is used for: its own line where we have one, else from the models it lists, else a general one. */
function usedFor(provider: string, catalog: CatalogView | undefined, t: HostTranslate) {
  if (provider === "openai" || provider === "elevenlabs") return t(`keys.purpose.${provider}` as HostMessageKey);
  const caps = new Set((catalog?.models ?? []).flatMap((model) => model.capabilities));
  return caps.has("stt") && caps.has("tts") ? t("keys.use.both") : caps.has("stt") ? t("keys.use.stt") : caps.has("tts") ? t("keys.use.tts") : t("keys.purpose.other");
}

/** What went wrong connecting a key: the provider's refusal in words (and its own after them), else the failure. */
function keyError(t: HostTranslate, error: unknown, name: string) {
  const failure = error as { code?: string; detail?: string; message?: string } | null;
  const state = reasonState(failure?.code);
  const words = state !== "connected" && state !== "problem" ? t(("keys.why." + state) as HostMessageKey, { provider: name, last4: "" })
    : failure?.code ? t("keys.failed", { code: failure.code }) : failure?.message || t("keys.failedPlain");
  return failure?.detail ? `${words} ${failure.detail}` : words;
}

/** The key's form: the field (shown or hidden), where to get a key, and Test and save — the provider asked with it
 *  first, and the key kept only if it takes it. The first-run setup shows it on its own; a card opens it in place. */
export function ProviderKey({ provider, name, t, replacing = null, onDone, onCancel }: {
  provider: string; name: string; t: HostTranslate; replacing?: string | null; onDone?: () => void; onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.focus(); }, []);
  // A form of its own, so Enter tests the key and never submits Settings around it.
  async function connect(event?: FormEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true); setError("");
    try {
      const actions = window.sidevoiceActions;
      await (actions?.connectProviderKey ?? actions?.saveProviderKey)?.(provider, key);
      writeHint(provider, key);
      setValue("");
      onDone?.();
    } catch (failure) {
      setError(keyError(t, failure, name));
      field.current?.select();
    } finally { setBusy(false); }
  }
  const page = KEY_PAGES[provider];
  return (
    <div className="provider-key" data-provider={provider} onKeyDown={(event) => { if (event.key === "Enter" && event.target === field.current) void connect(event as unknown as FormEvent); }}>
      {replacing && <p className="provider-key-replacing">{t("keys.replacing", { last4: replacing })}</p>}
      <Field label={t("keys.label", { provider: name })} error={error || undefined}>
        <div className="provider-key-input">
          <Input ref={field} id={"provider-key-" + provider} type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} readOnly={busy}
            placeholder={t("keys.placeholder.new")} onChange={(event) => setValue(event.target.value)} />
          <Button variant="ghost" tone="neutral" size="sm" aria-pressed={shown} onClick={() => setShown(!shown)}>{shown ? t("keys.hide") : t("keys.show")}</Button>
        </div>
      </Field>
      <div className="provider-key-actions">
        {page && <a className="provider-key-link" href={page} target="_blank" rel="noreferrer">{t("keys.getKey", { provider: name })}<ExternalLinkIcon size={14} /><span className="sr-only">{t("keys.newTab")}</span></a>}
        {onCancel && <Button variant="ghost" tone="neutral" size="sm" onClick={onCancel} disabled={busy}>{t("hosts.cancel")}</Button>}
        <Button id={"provider-key-save-" + provider} variant="primary" size="sm" disabled={!value.trim()} loading={busy} onClick={() => void connect()}>{t("keys.testAndSave")}</Button>
      </div>
      <p className="sr-only" role="status">{busy ? t("keys.checking", { provider: name }) : ""}</p>
    </div>
  );
}

/** One provider's card: Connect, or its key's state and what can be done with it; the form or Remove's question in
 *  place when asked for. */
function ProviderCard({ provider, name, catalog, inUse }: { provider: string; name: string; catalog: CatalogView | undefined; inUse: string[] }) {
  const t = hostTranslator();
  const kept = useRoomStore((state) => state.facts.providerKeys[provider]);
  const [mode, setMode] = useState<"view" | "key" | "remove">("view");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [hint, setHint] = useState<Hint | null>(() => readHint(provider));
  const state = keyState(kept, catalog, busy);
  const connected = kept === true;
  const last4 = connected ? hint?.last4 ?? null : null;
  const problem = connected && state !== "connected" && state !== "checking" && state !== "unknown";
  async function test() {
    setBusy(true); setNote("");
    try { await window.sidevoiceActions?.testProviderKey?.(provider); setNote(t("keys.tested")); }
    catch (failure) { setNote(keyError(t, failure, name)); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await window.sidevoiceActions?.saveProviderKey(provider, null); writeHint(provider, null); setHint(null); setMode("view"); setNote(t("keys.removed")); }
    catch (failure) { setNote(keyError(t, failure, name)); }
    finally { setBusy(false); }
  }
  return (
    <div className="provider-card" role="group" aria-label={name} data-provider={provider} data-state={state}>
      <div className="provider-card-main">
        <span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={22} /></span>
        <div className="provider-card-copy">
          <span className="provider-card-title"><strong>{name}</strong>{inUse.length > 0 && connected && <Badge tone="accent">{t("keys.inUse")}</Badge>}</span>
          <span className="provider-card-purpose">{usedFor(provider, catalog, t)}</span>
        </div>
        {mode === "view" && !connected &&
          <Button size="sm" variant="primary" aria-label={t("keys.connectNamed", { provider: name })} onClick={() => setMode("key")}>{t("keys.connect")}</Button>}
      </div>
      {connected && mode !== "key" && <div className="provider-card-key">
        <span className="provider-card-status">
          {state === "connected" ? <Badge tone="positive"><CheckIcon size={12} />{t("keys.state.connected")}</Badge>
            : <Badge tone={TONE[state]} dot={state !== "checking"}>{t(("keys.state." + state) as HostMessageKey)}</Badge>}
          <code className="provider-card-masked" aria-label={last4 ? t("keys.endsIn", { last4 }) : t("keys.keptHere")}>{last4 ? "••••" + last4 : t("keys.keptHere")}</code>
        </span>
        {mode === "view" && <span className="provider-card-actions">
          {problem && <Button variant="ghost" tone="neutral" size="sm" loading={busy} aria-label={t("keys.testNamed", { provider: name })} onClick={() => void test()}>{t("keys.testAgain")}</Button>}
          <Button variant="secondary" size="sm" aria-label={t("keys.replaceNamed", { provider: name })} onClick={() => setMode("key")}>{t("keys.replaceShort")}</Button>
          <Button variant="ghost" tone="danger" size="sm" aria-label={t("keys.removeNamed", { provider: name })} onClick={() => setMode("remove")}>{t("keys.remove")}</Button>
        </span>}
      </div>}
      {problem && <p className="provider-card-problem"><WarningIcon size={14} />{t(("keys.why." + state) as HostMessageKey, { provider: name, last4: last4 ?? "" })}
        {catalog?.status.detail ? <span className="provider-card-detail"> {catalog.status.detail}</span> : null}</p>}
      {mode === "key" && <ProviderKey provider={provider} name={name} t={t} replacing={connected ? last4 ?? "····" : null}
        onDone={() => { setHint(readHint(provider)); setMode("view"); setNote(t("keys.connected", { provider: name })); }} onCancel={() => setMode("view")} />}
      {mode === "remove" && <div className="provider-remove" role="group" aria-label={t("keys.removeNamed", { provider: name })}>
        <p>{inUse.length ? t("keys.removeInUse", { provider: name, uses: inUse.join(", ") }) : t("keys.removeConfirm", { provider: name })}</p>
        <div className="provider-key-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => setMode("view")}>{t("hosts.cancel")}</Button>
          <Button id={"provider-key-remove-" + provider} variant="danger" size="sm" loading={busy} onClick={() => void remove()}>{t("keys.remove")}</Button>
        </div>
      </div>}
      <p className="provider-card-note" role="status">{note}</p>
    </div>
  );
}

export function ProviderKeys() {
  const t = hostTranslator();
  const inApp = useRoomStore((state) => state.facts.inApp);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const settings = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const providers = remoteProviders(catalogue.catalogs);
  const uses = (provider: string) => [settings?.stt.catalog === provider ? t("settings.section.transcription") : "", settings?.tts.catalog === provider ? t("settings.section.voice") : ""].filter(Boolean);
  return (
    <Section id="providers" title={t("keys.title")} description={t("keys.intro")}>
      {/* Where the keys are kept, in a line: the keychain in the app; this browser, unencrypted, on the web. */}
      <p id="provider-keys-where" className="provider-keys-where" role="note" data-where={inApp ? "app" : "browser"}>
        {!inApp && <WarningIcon size={14} />}{inApp ? t("keys.inApp") : t("keys.browserShort")}
      </p>
      {/* The providers are the engine's remote catalogues: while they load, or when they could not be read, it says so
          rather than listing none. */}
      {!catalogueShown(catalogue) && (catalogue.state === "loading" || catalogue.state === "idle") ? <p className="muted" role="status" id="provider-keys-loading">{t("keys.loading")}</p> : null}
      {catalogue.state === "failed" ? (
        <div id="provider-keys-failed" role="alert"><Alert tone="danger" title={catalogue.error}
          action={<Button id="provider-keys-retry" size="sm" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button>} /></div>
      ) : null}
      {catalogueShown(catalogue) ? (providers.length
        ? <div className="provider-cards">{providers.map((provider) => <ProviderCard key={provider.id} provider={provider.id} name={provider.name}
            catalog={catalogue.catalogs.find((catalog) => catalog.id === provider.id)} inUse={uses(provider.id)} />)}</div>
        : <p className="muted" id="provider-keys-none">{t("keys.none")}</p>) : null}
    </Section>
  );
}
