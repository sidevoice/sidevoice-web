import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Field } from "../../components/ui/Field";
import { Input } from "../../components/ui/Input";
import { Group, Section } from "../../components/ui/Card";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { CheckIcon, ExternalLinkIcon, MoreIcon, ProviderLogo, WarningIcon } from "../../components/ui/Icons";
import { remoteProviders } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { catalogueShown } from "./ModelSetup";
import type { HostMessageKey } from "./messages/en";

/* The remote providers, one row each, as good apps show a connected account: its mark and name, whether it is
 * connected — and whether its key works, as the provider last said — what it is used for, the key's last four, and what
 * can be done: add a key (inline, with where to get one and what it costs), test it, replace it, remove it (asking
 * first, and saying what stops). The key itself goes to the engine's host — the system keychain in the app, this
 * browser's storage on the web — and is never read back: the last four and the date are the page's own note of it. */

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

/** Where a provider's key stands: what the host keeps, and what the provider said last about it. */
function keyState(kept: boolean | null | undefined, catalog: CatalogView | undefined, busy: boolean): State {
  if (busy) return "checking";
  if (kept === false) return "absent";
  if (kept === undefined || kept === null) return "unknown";
  const code = catalog?.status.reason?.code;
  if (!code) return "connected";
  if (code === "credential-rejected") return "rejected";
  if (code === "listing-not-permitted") return "permission";
  if (code === "provider-quota") return "quota";
  if (code === "rate-limited") return "limited";
  if (code === "provider-unreachable" || code === "listing-failed") return "unreachable";
  if (code === "credentials-failed" || code === "storage-blocked" || code === "credential-missing") return "unreadable";
  return "problem";
}

const TONE: Record<State, BadgeTone> = {
  absent: "neutral", checking: "neutral", connected: "positive", rejected: "danger", permission: "warning", quota: "warning",
  limited: "warning", unreachable: "neutral", unreadable: "danger", unknown: "neutral", problem: "warning",
};

/** What a provider is used for, from its models; none while it lists none (no key yet). */
function usedFor(catalog: CatalogView | undefined, t: HostTranslate) {
  const caps = new Set((catalog?.models ?? []).flatMap((model) => model.capabilities));
  return caps.has("stt") && caps.has("tts") ? t("keys.use.both") : caps.has("stt") ? t("keys.use.stt") : caps.has("tts") ? t("keys.use.tts") : "";
}

function keyError(t: HostTranslate, error: unknown) {
  const code = (error as { code?: string } | null)?.code;
  return code ? t("keys.failed", { code }) : (error as Error | null)?.message || t("keys.failedPlain");
}

/** The form that takes a key: where to get one, the field (shown or hidden), what it costs, and Connect. The first-run
 *  setup shows it on its own; a provider's row opens it in place. */
export function ProviderKey({ provider, name, t, replacing = null, onDone, onCancel }: {
  provider: string; name: string; t: HostTranslate; replacing?: string | null; onDone?: () => void; onCancel?: () => void;
}) {
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { field.current?.focus(); }, []);
  // A form of its own, so Enter connects the key and never submits Settings around it.
  async function connect(event?: FormEvent) {
    event?.preventDefault();
    event?.stopPropagation();
    const key = value.trim();
    if (!key || busy) return;
    setBusy(true); setError("");
    try {
      await window.sidevoiceActions?.saveProviderKey(provider, key);
      writeHint(provider, key);
      setValue("");
      onDone?.();
    } catch (failure) {
      setError(keyError(t, failure));
      field.current?.select();
    } finally { setBusy(false); }
  }
  const page = KEY_PAGES[provider];
  return (
    <div className="provider-key" data-provider={provider} onKeyDown={(event) => { if (event.key === "Enter" && event.target === field.current) void connect(event as unknown as FormEvent); }}>
      {replacing && <p className="provider-key-replacing">{t("keys.replacing", { last4: replacing })}</p>}
      {page && <a className="provider-key-link" href={page} target="_blank" rel="noreferrer">{t("keys.getKey", { provider: name })}<ExternalLinkIcon size={14} /><span className="sr-only">{t("keys.newTab")}</span></a>}
      <Field label={t("keys.label", { provider: name })} error={error || undefined}>
        <div className="provider-key-input">
          <Input ref={field} id={"provider-key-" + provider} type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} value={value} readOnly={busy}
            placeholder={t("keys.placeholder.new")} onChange={(event) => setValue(event.target.value)} />
          <Button variant="ghost" tone="neutral" size="sm" aria-pressed={shown} onClick={() => setShown(!shown)}>{shown ? t("keys.hide") : t("keys.show")}</Button>
        </div>
      </Field>
      <p className="provider-key-cost">{t(provider === "elevenlabs" ? "keys.cost.elevenlabs" : "keys.cost", { provider: name })}</p>
      <div className="provider-key-actions">
        {onCancel && <Button variant="ghost" tone="neutral" size="sm" onClick={onCancel} disabled={busy}>{t("hosts.cancel")}</Button>}
        <Button id={"provider-key-save-" + provider} variant="primary" size="sm" disabled={!value.trim()} loading={busy} onClick={() => void connect()}>{t("keys.connect")}</Button>
      </div>
      <p className="sr-only" role="status">{busy ? t("keys.checking", { provider: name }) : ""}</p>
    </div>
  );
}

/** One provider: its state at a glance, and the key's form or the removal's question in place when asked for. */
function ProviderRow({ provider, name, catalog, inUse }: { provider: string; name: string; catalog: CatalogView | undefined; inUse: string[] }) {
  const t = hostTranslator();
  const kept = useRoomStore((state) => state.facts.providerKeys[provider]);
  const [mode, setMode] = useState<"view" | "key" | "remove">("view");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [hint, setHint] = useState<Hint | null>(() => readHint(provider));
  const titleId = useId();
  const state = keyState(kept, catalog, busy);
  const connected = kept === true;
  const last4 = connected ? hint?.last4 ?? null : null;
  const page = KEY_PAGES[provider];
  const purpose = usedFor(catalog, t);
  async function test() {
    setBusy(true); setNote("");
    try { await window.sidevoiceActions?.testProviderKey?.(provider); setNote(t("keys.tested")); }
    catch (failure) { setNote(keyError(t, failure)); }
    finally { setBusy(false); }
  }
  async function remove() {
    setBusy(true);
    try { await window.sidevoiceActions?.saveProviderKey(provider, null); writeHint(provider, null); setHint(null); setMode("view"); setNote(t("keys.removed")); }
    catch (failure) { setNote(keyError(t, failure)); }
    finally { setBusy(false); }
  }
  const detail = [purpose, last4 ? t("keys.endsIn", { last4 }) : connected ? t("keys.keptHere") : "", connected && hint ? t("keys.added", { date: new Date(hint.addedAt).toLocaleDateString(document.documentElement.lang || undefined, { day: "numeric", month: "short" }) }) : ""].filter(Boolean).join(" · ");
  const problem = state === "rejected" || state === "permission" || state === "quota" || state === "limited" || state === "unreachable" || state === "unreadable" || state === "problem";
  const primary = state === "absent" ? <Button size="sm" onClick={() => setMode("key")}>{t("keys.add")}</Button>
    : state === "rejected" || state === "permission" || state === "unreadable" ? <Button size="sm" onClick={() => setMode("key")}>{t("keys.replace")}</Button>
    : <Button size="sm" variant={problem ? "secondary" : "ghost"} tone="neutral" loading={busy} aria-label={t("keys.testNamed", { provider: name })} onClick={() => void test()}>{problem ? t("keys.testAgain") : t("keys.test")}</Button>;
  return (
    <div className="provider-row" role="group" aria-labelledby={titleId} data-provider={provider} data-state={state}>
      <div className="provider-row-main">
        <span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={20} /></span>
        <div className="provider-row-copy">
          <span className="provider-row-title">
            <strong id={titleId}>{name}</strong>
            <Badge tone={TONE[state]} dot={state !== "checking" && state !== "connected"}>{state === "connected" && <CheckIcon size={12} />}{t(("keys.state." + state) as HostMessageKey)}</Badge>
            {inUse.length > 0 && connected && <Badge tone="accent">{t("keys.inUse")}</Badge>}
          </span>
          {detail && <span className="provider-row-detail">{detail}</span>}
          {problem && <span className="provider-row-problem"><WarningIcon size={14} />{t(("keys.why." + state) as HostMessageKey, { provider: name, last4: last4 ?? "" })}</span>}
        </div>
        {mode === "view" && <div className="provider-row-actions">
          {primary}
          {connected && <DropdownMenu label={t("keys.more", { provider: name })} trigger={<Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("keys.more", { provider: name })}><MoreIcon /></Button>}>
            {state !== "rejected" && state !== "permission" && state !== "unreadable" && <DropdownMenuItem onSelect={() => setMode("key")}>{t("keys.replace")}</DropdownMenuItem>}
            {page && <DropdownMenuItem onSelect={() => window.open(page, "_blank", "noreferrer")}>{t("keys.manage", { provider: name })}</DropdownMenuItem>}
            <DropdownMenuItem danger onSelect={() => setMode("remove")}>{t("keys.removeNamed", { provider: name })}</DropdownMenuItem>
          </DropdownMenu>}
        </div>}
      </div>
      {mode === "key" && <ProviderKey provider={provider} name={name} t={t} replacing={connected ? last4 ?? "····" : null}
        onDone={() => { setHint(readHint(provider)); setMode("view"); setNote(t("keys.connected", { provider: name })); }} onCancel={() => setMode("view")} />}
      {mode === "remove" && <div className="provider-remove" role="group" aria-label={t("keys.removeNamed", { provider: name })}>
        <p>{inUse.length ? t("keys.removeInUse", { provider: name, uses: inUse.join(", ") }) : t("keys.removeConfirm", { provider: name })}</p>
        <div className="provider-key-actions">
          <Button variant="ghost" tone="neutral" size="sm" autoFocus onClick={() => setMode("view")}>{t("hosts.cancel")}</Button>
          <Button id={"provider-key-remove-" + provider} variant="danger" size="sm" loading={busy} onClick={() => void remove()}>{t("keys.remove")}</Button>
        </div>
      </div>}
      <p className="provider-row-note" role="status">{note}</p>
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
      {inApp
        ? <p className="muted" id="provider-keys-where">{t("keys.inApp")}</p>
        : <div id="provider-keys-where" role="note"><Alert tone="warning" title={t("keys.browserTitle")}>{t("keys.browser")}</Alert></div>}
      {/* The providers are the engine's remote catalogues: while they load, or when they could not be read, it says so
          rather than listing none. */}
      {!catalogueShown(catalogue) && (catalogue.state === "loading" || catalogue.state === "idle") ? <p className="muted" role="status" id="provider-keys-loading">{t("keys.loading")}</p> : null}
      {catalogue.state === "failed" ? (
        <div id="provider-keys-failed" role="alert"><Alert tone="danger" title={catalogue.error}
          action={<Button id="provider-keys-retry" size="sm" onClick={() => void window.sidevoiceActions?.loadVoiceCatalogue()}>{t("voice.retry")}</Button>} /></div>
      ) : null}
      {catalogueShown(catalogue) ? (providers.length
        ? <Group>{providers.map((provider) => <ProviderRow key={provider.id} provider={provider.id} name={provider.name}
            catalog={catalogue.catalogs.find((catalog) => catalog.id === provider.id)} inUse={uses(provider.id)} />)}</Group>
        : <p className="muted" id="provider-keys-none">{t("keys.none")}</p>) : null}
    </Section>
  );
}

