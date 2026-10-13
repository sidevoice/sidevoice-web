import { forwardRef, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { createPortal } from "react-dom";
import { useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input, type InputProps } from "../../components/ui/Input";
import { Row } from "../../components/ui/Card";
import { ExternalLinkIcon, EyeIcon, EyeOffIcon, ProviderLogo, WarningIcon } from "../../components/ui/Icons";
import { ErrorDetails } from "../../components/ui/ErrorText";
import { errorMessage, type ErrorMessage } from "./error-message";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";

/* How a provider's key is given, and taken back: one small dialog everywhere (Settings › Providers, and a voice slot
 * whose provider has no key yet, in Settings and the first-run setup). Paste the key, Connect: the provider is asked
 * with it first, and only a key it takes is kept — one it refuses, or that could not be checked because it could not be
 * reached, is said in the dialog, which stays open to fix it. Disconnecting forgets the key, after asking. The key goes
 * to the engine's host — the system keychain in the app, this browser's storage on the web — and is never read back:
 * its last four are the page's own note of it. */

/** Where each provider gives its keys. */
const KEY_PAGES: Record<string, string> = {
  openai: "https://platform.openai.com/api-keys",
  elevenlabs: "https://elevenlabs.io/app/settings/api-keys",
};

/** The page's own note of a kept key: its last four and when it was added. Only this file writes it. */
const HINT_PREFIX = "sidevoice.provider-key-hint.";
export type Hint = { last4: string; addedAt: number };
export function readHint(provider: string): Hint | null {
  try { return JSON.parse(localStorage.getItem(HINT_PREFIX + provider) || "null"); } catch { return null; }
}
function writeHint(provider: string, key: string | null) {
  try {
    if (key) localStorage.setItem(HINT_PREFIX + provider, JSON.stringify({ last4: key.slice(-4), addedAt: Date.now() }));
    else localStorage.removeItem(HINT_PREFIX + provider);
  } catch { /* Shown for this visit only. */ }
}

export type KeyState = "absent" | "connected" | "rejected" | "permission" | "quota" | "limited" | "unreachable" | "unreadable" | "unknown" | "problem";

/** A provider's reason code as the key's state. */
export function reasonState(code: string | undefined): KeyState {
  if (!code) return "connected";
  if (code === "credential-rejected") return "rejected";
  if (code === "listing-not-permitted") return "permission";
  if (code === "provider-quota") return "quota";
  if (code === "rate-limited") return "limited";
  if (code === "provider-unreachable" || code === "listing-failed") return "unreachable";
  if (code === "credentials-failed" || code === "storage-blocked" || code === "credential-missing") return "unreadable";
  return "problem";
}

/** The states that are the provider answering about the key: its own words may follow what is said of them. */
export const PROVIDER_SAYS = new Set<KeyState>(["rejected", "permission", "quota", "limited", "unreachable"]);

/** What went wrong with a key, in words (error-message.ts): a provider's reason by its code, the provider's own words
 *  after it (`said`, when it gave any); anything else a generic line, what was raw about it behind Details.
 *  `typed`: a key just typed — said as what to check in it, or that it could not be checked. */
export function keyError(t: HostTranslate, error: unknown, name: string, typed = false): ErrorMessage {
  return errorMessage(error, { t, what: "key", known: (code) => {
    const state = reasonState(code);
    return typed && state === "rejected" ? t("keys.entry.rejected", { provider: name })
      : typed && state === "unreachable" ? t("keys.entry.unreachable", { provider: name })
      : state !== "connected" && state !== "problem" ? t(("keys.why." + state) as HostMessageKey, { provider: name, last4: "" })
      : null;
  } });
}

/** Where the key is really kept, then where to get one: two muted lines. */
function KeyHelp({ provider, name, t }: { provider: string; name: string; t: HostTranslate }) {
  const inApp = useRoomStore((state) => state.facts.inApp);
  const page = KEY_PAGES[provider];
  return <span className="provider-key-help">
    <span className="provider-key-where">{t(inApp ? "keys.where.app" : "keys.where.browser")}</span>
    {page && <a className="provider-key-link" href={page} target="_blank" rel="noreferrer">{t("keys.getKey", { provider: name })}<ExternalLinkIcon size={14} />
      <span className="sr-only">{t("keys.newTab")}</span></a>}
  </span>;
}

/** The key's box with an eye at its end that shows or hides it, as password fields have. Field gives the box its id and
 *  what describes it; they go to the input. */
const KeyInput = forwardRef<HTMLInputElement, InputProps & { shown: boolean; onReveal: () => void; t: HostTranslate }>(function KeyInput({ shown, onReveal, t, ...input }, ref) {
  return <div className="provider-key-input">
    <Input ref={ref} {...input} type={shown ? "text" : "password"} autoComplete="off" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
    <Button variant="ghost" tone="neutral" size="icon-sm" className="provider-key-reveal" aria-label={t(shown ? "keys.hideKey" : "keys.showKey")}
      title={t(shown ? "keys.hideKey" : "keys.showKey")} aria-pressed={shown} onClick={onReveal}>{shown ? <EyeOffIcon /> : <EyeIcon />}</Button>
  </div>;
});

export type KeyDialogProps = {
  provider: string;
  name: string;
  /** The kept key's last four ("····" when they aren't known) when this replaces it; null when connecting. */
  replacing: string | null;
  /** Kept: the provider took it. */
  onDone: () => void;
  /** Cancelled (Cancel, ×, Escape); never while the provider is being asked. */
  onCancel: () => void;
};

/** The key's dialog, drawn on the page's top layer — above Settings (a dialog itself) and the setup; Escape closes
 *  only it. Its field takes the focus; pasting fills it and Enter connects. While the provider is asked nothing closes
 *  it — the question can't be called off — and it says what it is doing. A refusal leaves the key there, selected,
 *  with the field marked and focused, to paste another over it; editing clears what was said. */
export function KeyDialog({ provider, name, replacing, onDone, onCancel }: KeyDialogProps) {
  const t = hostTranslator();
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const [testing, setTesting] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  const titleId = useId();
  async function submit() {
    const key = value.trim();
    if (!key || testing) return;
    setTesting(true); setError(null);
    try {
      const actions = window.sidevoiceActions;
      await (actions?.connectProviderKey ?? actions?.saveProviderKey)?.(provider, key);
    } catch (failure) {
      setTesting(false);
      setError(keyError(t, failure, name, true));
      // After the render that gives the field back (it is read-only while testing).
      window.setTimeout(() => { field.current?.focus(); field.current?.select(); }, 0);
      return;
    }
    writeHint(provider, key);
    setTesting(false);
    onDone();
  }
  // Settings around it is a form: Enter connects, and never submits what is around it.
  const enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };
  return createPortal(
    <Dialog open size="sm" className="provider-key-dialog" titleId={titleId} initialFocus={field}
      title={replacing ? t("keys.replaceTitle", { provider: name }) : t("keys.connectNamed", { provider: name })}
      leading={<span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={18} /></span>}
      onClose={testing ? undefined : onCancel}
      footer={<>
        <p className="ui-dialog-reason" role="status">{testing ? t("keys.testingWith", { provider: name }) : ""}</p>
        <Button variant="ghost" tone="neutral" disabled={testing} onClick={onCancel}>{t("hosts.cancel")}</Button>
        <Button variant="primary" disabled={!value.trim()} loading={testing} onClick={() => void submit()}>{t(replacing ? "keys.replace" : "keys.connect")}</Button>
      </>}>
      {replacing && <p className="provider-key-replacing">{t("keys.replacing", { last4: replacing })}</p>}
      <Field label={t("keys.apiKey")} error={error ? <div>{error.text}{error.said && <span className="provider-key-detail" translate="no"> {error.said}</span>}<ErrorDetails details={error.details} /></div> : undefined}
        hint={<KeyHelp provider={provider} name={name} t={t} />}>
        <KeyInput ref={field} shown={shown} onReveal={() => setShown(!shown)} t={t} value={value} readOnly={testing} placeholder={t("keys.placeholder.new")}
          onChange={(event) => { setValue(event.target.value); setError(null); }} onKeyDown={enter} />
      </Field>
    </Dialog>, document.body);
}

/** Disconnecting, asked first in a small dialog with Cancel focused: what stops working (where the provider is in use),
 *  that the key is forgotten here, and that it still works at the provider. The host forgets it, and the page its last
 *  four. A failure says so and stays. */
export function DisconnectDialog({ provider, name, last4, inUse, onDone, onCancel }: {
  provider: string; name: string; last4: string | null; inUse: string[]; onDone: () => void; onCancel: () => void;
}) {
  const t = hostTranslator();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ErrorMessage | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  async function disconnect() {
    if (busy) return;
    setBusy(true); setError(null);
    try { await window.sidevoiceActions?.saveProviderKey(provider, null); }
    catch (failure) {
      setBusy(false);
      // Its own sentence, whatever failed: what the key's failure said goes behind Details.
      const why = keyError(t, failure, name);
      setError({ text: t("keys.disconnectFailed", { provider: name }), details: [why.text, why.said, why.details].filter(Boolean).join("\n") });
      return;
    }
    writeHint(provider, null);
    setBusy(false);
    onDone();
  }
  const uses = listed(inUse);
  return createPortal(
    <Dialog open size="sm" className="provider-disconnect-dialog" titleId={titleId} title={t("keys.disconnectTitle", { provider: name })} initialFocus={cancel}
      onClose={busy ? undefined : onCancel}
      footer={<>
        <p className="ui-dialog-reason" role="status">{busy ? t("keys.disconnecting") : ""}</p>
        <Button ref={cancel} variant="ghost" tone="neutral" disabled={busy} onClick={onCancel}>{t("hosts.cancel")}</Button>
        <Button variant="danger" loading={busy} onClick={() => void disconnect()}>{t("keys.disconnect")}</Button>
      </>}>
      {inUse.length > 0 && <p className="provider-disconnect-in-use"><WarningIcon size={16} />
        {t(inUse.length > 1 ? "keys.disconnectInUse.many" : "keys.disconnectInUse.one", { uses, provider: name })}</p>}
      <p>{last4 ? t("keys.disconnectForget", { last4, provider: name }) : t("keys.disconnectForgetPlain", { provider: name })}</p>
      <p className="muted">{t("keys.disconnectRevoke", { provider: name })}</p>
      {error && <div className="provider-key-error" role="alert"><WarningIcon size={16} /><div>{error.text}<ErrorDetails details={error.details} /></div></div>}
    </Dialog>, document.body);
}

/** Section names as one phrase ("Transcription and Voice"), in the page's language. */
export function listed(names: string[]) {
  const locale = document.documentElement.lang || undefined;
  try { return new Intl.ListFormat(locale, { type: "conjunction" }).format(names); } catch { return names.join(", "); }
}

/** A voice slot's provider while it has no key (`needed`): "OpenAI needs a key" and Connect, which opens the key's
 *  dialog (keeping the key where Providers keeps it). Its dialog stays open while the provider is asked, even if the
 *  slot stops needing it meanwhile. Once kept, the row goes: `onDone` is for the slot to say so and take the focus. */
export function ProviderKeyNeeded({ provider, name, needed, onDone }: { provider: string; name: string; needed: boolean; onDone: () => void }) {
  const t = hostTranslator();
  const [open, setOpen] = useState(false);
  const connect = useRef<HTMLButtonElement>(null);
  const focusBack = useFocusBack(() => connect.current);
  if (!needed && !open) return null;
  return <Row label={t("keys.needsKey", { provider: name })} className="provider-key-needed">
    <Button ref={connect} variant="primary" size="sm" aria-label={t("keys.connectNamed", { provider: name })} aria-haspopup="dialog"
      onClick={() => setOpen(true)}>{t("keys.connect")}</Button>
    {open && <KeyDialog provider={provider} name={name} replacing={null} onDone={() => { setOpen(false); onDone(); }} onCancel={() => { setOpen(false); focusBack(); }} />}
  </Row>;
}

/** Focus back on what opened something once it has closed — the opener as it is drawn then (`target`) — unless focus
 *  went somewhere else meanwhile: only when what had it is gone. Looked at on the next tick, after the render that
 *  closed it. */
export function useFocusBack(target: () => HTMLElement | null) {
  const [asked, setAsked] = useState(0);
  const to = useRef(target);
  to.current = target;
  useEffect(() => {
    if (!asked) return;
    const timer = window.setTimeout(() => {
      const active = document.activeElement;
      if (!active || active === document.body) to.current()?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [asked]);
  return () => setAsked((count) => count + 1);
}
