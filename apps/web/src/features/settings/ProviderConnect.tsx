import { forwardRef, useContext, useEffect, useId, useRef, useState, type KeyboardEvent, type MutableRefObject, type ReactElement } from "react";
import { createPortal } from "react-dom";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useMedia } from "../../state/call-layout";
import { useVariant } from "../../lib/variants";
import { Button } from "../../components/ui/Button";
import { Dialog } from "../../components/ui/Dialog";
import { Field } from "../../components/ui/Field";
import { Input, type InputProps } from "../../components/ui/Input";
import { Popover } from "../../components/ui/Popover";
import { Row } from "../../components/ui/Card";
import { CloseIcon, ExternalLinkIcon, ProviderLogo, WarningIcon } from "../../components/ui/Icons";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";

/* How a provider's key is given, and taken back. The entry: paste the key, Test and save — the provider is asked with
 * it first, and the host keeps it only if the provider takes it (or could not be reached to say: then it is kept,
 * unchecked) — with where to get a key and where it is kept. Remove asks first. Providers' cards open them, and so does
 * a voice slot whose provider has no key yet (Settings' Transcription and Voice, the first-run setup), the same way;
 * which way is a design being compared (lib/variants): a small dialog, a row in place, or a popover by the button. The
 * key goes to the engine's host — the system keychain in the app, this browser's storage on the web — and is never read
 * back: its last four are the page's own note of it. */

export const PROVIDER_CONNECT = ["dialog", "row", "popover"] as const;
export type ProviderConnect = (typeof PROVIDER_CONNECT)[number];

/** The way being compared. A phone has no room for a popover: it gets the dialog, which is the whole screen there. */
export function useProviderConnect(): ProviderConnect {
  const variant = useVariant("provider-connect", PROVIDER_CONNECT);
  const phone = useMedia("(max-width: 599px)");
  return variant === "popover" && phone ? "dialog" : variant;
}

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

/** What went wrong with a key: the provider's refusal in words (and its own after them), else the failure. `typed`: a
 *  key just typed, which the provider would not take — said as what to check in it. */
export function keyError(t: HostTranslate, error: unknown, name: string, typed = false) {
  const failure = error as { code?: string; detail?: string; message?: string } | null;
  const state = reasonState(failure?.code);
  const words = typed && state === "rejected" ? t("keys.entry.rejected", { provider: name })
    : state !== "connected" && state !== "problem" ? t(("keys.why." + state) as HostMessageKey, { provider: name, last4: "" })
    : failure?.code ? t("keys.failed", { code: failure.code }) : failure?.message || t("keys.failedPlain");
  return failure?.detail ? `${words} ${failure.detail}` : words;
}

/** How Test and save ended: the provider took the key, or could not be reached to check it (the key is kept). */
export type KeyOutcome = "connected" | "unverified";

/** The entry while it is open: the key typed, shown or not, and what testing it said. A refusal leaves the key there,
 *  selected, with the field marked and focused, to paste it again over it. */
function useKeyEntry(provider: string, name: string, t: HostTranslate, onDone: (outcome: KeyOutcome) => void) {
  const store = useContext(RoomStoreContext);
  const [value, setValue] = useState("");
  const [shown, setShown] = useState(false);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState(false);
  const field = useRef<HTMLInputElement>(null);
  async function submit() {
    const key = value.trim();
    if (!key || testing) return;
    setTesting(true); setError("");
    try {
      const actions = window.sidevoiceActions;
      await (actions?.connectProviderKey ?? actions?.saveProviderKey)?.(provider, key);
    } catch (failure) {
      setTesting(false);
      setError(keyError(t, failure, name, true));
      field.current?.focus();
      field.current?.select();
      return;
    }
    writeHint(provider, key);
    setTesting(false);
    // Kept: the catalogues were read again with it, and say whether the provider could be asked.
    const code = store?.getState().facts.voiceCatalogue.catalogs.find((catalog) => catalog.id === provider)?.status.reason?.code;
    onDone(reasonState(code) === "unreachable" ? "unverified" : "connected");
  }
  // No form of its own (it can sit in Settings' form): Enter tests the key, and never submits what is around it.
  const enter = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void submit();
  };
  return { value, setValue, shown, setShown, error, testing, field, submit, enter };
}
type Entry = ReturnType<typeof useKeyEntry>;

export type EntryProps = {
  provider: string;
  name: string;
  t: HostTranslate;
  /** The kept key's last four ("····" when they aren't known) when this replaces it; null when connecting. */
  replacing: string | null;
  onDone: (outcome: KeyOutcome) => void;
  /** Cancelled (Cancel, ×, Escape, a click outside); never while the provider is being asked. */
  onCancel: () => void;
};

const entryTitle = (t: HostTranslate, name: string, replacing: string | null) =>
  replacing ? t("keys.replaceTitle", { provider: name }) : t("keys.connectNamed", { provider: name });

/** Where to get a key, and where it is kept: one muted line. */
function KeyHelp({ provider, name, t }: { provider: string; name: string; t: HostTranslate }) {
  const inApp = useRoomStore((state) => state.facts.inApp);
  const page = KEY_PAGES[provider];
  return <span className="provider-key-help">
    {page && <><a className="provider-key-link" href={page} target="_blank" rel="noreferrer">{t("keys.getKey", { provider: name })}<ExternalLinkIcon size={14} />
      <span className="sr-only">{t("keys.newTab")}</span></a><span aria-hidden="true"> · </span></>}
    <span>{t(inApp ? "keys.where.app" : "keys.where.browser")}</span>
  </span>;
}

/** The key's box and Show beside it. Field gives the box its id and what describes it; they go to the input. */
const KeyInput = forwardRef<HTMLInputElement, InputProps & { shown: boolean; onReveal: () => void; t: HostTranslate }>(function KeyInput({ shown, onReveal, t, ...input }, ref) {
  return <div className="provider-key-input">
    <Input ref={ref} {...input} type={shown ? "text" : "password"} autoComplete="off" spellCheck={false} />
    <Button variant="ghost" tone="neutral" size="sm" onClick={onReveal}>{shown ? t("keys.hide") : t("keys.show")}</Button>
  </div>;
});

/** The entry's field, as the dialog and the popover show it: labelled, its error under it, then the help line. */
function KeyField({ entry, provider, name, t }: { entry: Entry; provider: string; name: string; t: HostTranslate }) {
  return <Field label={t("keys.apiKey")} error={entry.error || undefined} hint={<KeyHelp provider={provider} name={name} t={t} />}>
    <KeyInput ref={entry.field} shown={entry.shown} onReveal={() => entry.setShown(!entry.shown)} t={t} value={entry.value} readOnly={entry.testing}
      placeholder={t("keys.placeholder.new")} onChange={(event) => entry.setValue(event.target.value)} onKeyDown={entry.enter} />
  </Field>;
}

/** A: a small dialog. It is drawn on the page's top layer, so it opens above Settings (a dialog itself) and above the
 *  setup, and Escape closes only it. Its field takes the focus; while the provider is asked it can't be closed — the
 *  question can't be called off. */
function KeyDialog({ provider, name, t, replacing, onDone, onCancel }: EntryProps) {
  const entry = useKeyEntry(provider, name, t, onDone);
  const titleId = useId();
  return createPortal(
    <Dialog open size="sm" className="provider-key-dialog" titleId={titleId} title={entryTitle(t, name, replacing)} initialFocus={entry.field}
      leading={<span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={18} /></span>}
      onClose={entry.testing ? undefined : onCancel}
      footer={<>
        <p className="ui-dialog-reason" role="status">{entry.testing ? t("keys.testing") : ""}</p>
        <Button variant="ghost" tone="neutral" disabled={entry.testing} onClick={onCancel}>{t("hosts.cancel")}</Button>
        <Button variant="primary" disabled={!entry.value.trim()} loading={entry.testing} onClick={() => void entry.submit()}>{t("keys.testAndSave")}</Button>
      </>}>
      {replacing && <p className="provider-key-replacing">{t("keys.replacing", { last4: replacing })}</p>}
      <KeyField entry={entry} provider={provider} name={name} t={t} />
    </Dialog>, document.body);
}

/** C: a popover by what opened it (`anchor`). While the provider is asked, nothing closes it — not Escape, not a click
 *  outside. */
function KeyPopover({ anchor, open, ...props }: EntryProps & { anchor: ReactElement; open: boolean }) {
  const testing = useRef(false);
  return <Popover anchor={anchor} open={open} label={entryTitle(props.t, props.name, props.replacing)} side="bottom" align="end" className="provider-key-popover"
    onOpenChange={(next) => { if (!next && !testing.current) props.onCancel(); }}>
    <KeyPopoverBody {...props} testing={testing} />
  </Popover>;
}

function KeyPopoverBody({ provider, name, t, replacing, onDone, testing }: EntryProps & { testing: MutableRefObject<boolean> }) {
  const entry = useKeyEntry(provider, name, t, onDone);
  useEffect(() => { testing.current = entry.testing; }, [entry.testing, testing]);
  return <>
    <p className="ui-popover-title">{entryTitle(t, name, replacing)}</p>
    {replacing && <p className="provider-key-replacing">{t("keys.replacing", { last4: replacing })}</p>}
    <KeyField entry={entry} provider={provider} name={name} t={t} />
    <div className="provider-key-actions">
      <p className="provider-key-status" role="status">{entry.testing ? t("keys.testing") : ""}</p>
      <Button variant="primary" size="sm" disabled={!entry.value.trim()} loading={entry.testing} onClick={() => void entry.submit()}>{t("keys.testAndSave")}</Button>
    </div>
  </>;
}

/** B: a row in place of what opened it — the key's box, Test and save, and × — with where to get a key and where it is
 *  kept under it. Escape cancels (and stays here: Settings around it stays open), except while the provider is asked. */
export function KeyRow({ provider, name, t, replacing, onDone, onCancel }: EntryProps) {
  const entry = useKeyEntry(provider, name, t, onDone);
  const help = useId();
  const error = useId();
  useEffect(() => { entry.field.current?.focus(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="provider-key-row" role="group" aria-label={entryTitle(t, name, replacing)}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!entry.testing) onCancel();
    }}>
    <div className="provider-key-row-controls">
      <Input ref={entry.field} type="password" autoComplete="off" spellCheck={false} aria-label={t("keys.label", { provider: name })} invalid={!!entry.error}
        aria-describedby={entry.error ? `${error} ${help}` : help} value={entry.value} readOnly={entry.testing} placeholder={t("keys.placeholder.new")}
        onChange={(event) => entry.setValue(event.target.value)} onKeyDown={entry.enter} />
      <Button variant="primary" disabled={!entry.value.trim()} loading={entry.testing} onClick={() => void entry.submit()}>{t("keys.testAndSave")}</Button>
      <Button variant="ghost" tone="neutral" size="icon" aria-label={t("hosts.cancel")} title={t("hosts.cancel")} disabled={entry.testing} onClick={onCancel}><CloseIcon /></Button>
    </div>
    {entry.error && <p className="provider-key-error" id={error}><WarningIcon size={16} />{entry.error}</p>}
    <p className="provider-key-line" id={help}>
      <span className="provider-key-status" role="status">{entry.testing ? t("keys.testing") : ""}</span>
      {!entry.testing && <>{replacing && <span>{t("keys.replacing", { last4: replacing })} </span>}<KeyHelp provider={provider} name={name} t={t} /></>}
    </p>
  </div>;
}

/** The entry for what `opener` opens: the dialog over the page, or the popover beside `opener`. The row is drawn by
 *  whoever holds the opener, in its place (KeyRow). */
export function KeyEntry({ variant, opener, open, ...props }: EntryProps & { variant: ProviderConnect; opener: ReactElement; open: boolean }) {
  if (variant === "popover") return <KeyPopover anchor={opener} open={open} {...props} />;
  return <>{opener}{open && variant === "dialog" && <KeyDialog {...props} />}</>;
}

type RemoveProps = { provider: string; name: string; t: HostTranslate; inUse: string[]; onDone: () => void; onCancel: () => void };

/** Removing the key: the host forgets it, and the page its last four. */
function useRemoveKey(provider: string, name: string, t: HostTranslate, onDone: () => void) {
  const [removing, setRemoving] = useState(false);
  const [error, setError] = useState("");
  async function remove() {
    if (removing) return;
    setRemoving(true); setError("");
    try { await window.sidevoiceActions?.saveProviderKey(provider, null); }
    catch (failure) { setRemoving(false); setError(keyError(t, failure, name)); return; }
    writeHint(provider, null);
    setRemoving(false);
    onDone();
  }
  return { removing, error, remove };
}

const removeNote = (t: HostTranslate, name: string, inUse: string[]) => inUse.length ? t("keys.removeInUse", { provider: name, uses: inUse.join(", ") }) : null;

/** Remove's question in a small dialog (the dialog and popover ways), Cancel focused. */
export function RemoveDialog({ provider, name, t, inUse, onDone, onCancel }: RemoveProps) {
  const { removing, error, remove } = useRemoveKey(provider, name, t, onDone);
  const cancel = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const note = removeNote(t, name, inUse);
  return createPortal(
    <Dialog open size="sm" className="provider-remove-dialog" titleId={titleId} title={t("keys.removeConfirm", { provider: name })} initialFocus={cancel}
      onClose={removing ? undefined : onCancel}
      footer={<>
        <p className="ui-dialog-reason" role="status">{removing ? t("keys.removing") : ""}</p>
        <Button ref={cancel} variant="ghost" tone="neutral" disabled={removing} onClick={onCancel}>{t("hosts.cancel")}</Button>
        <Button variant="danger" loading={removing} onClick={() => void remove()}>{t("keys.remove")}</Button>
      </>}>
      {note && <p>{note}</p>}
      {error && <p className="provider-key-error" role="alert"><WarningIcon size={16} />{error}</p>}
    </Dialog>, document.body);
}

/** Remove's question in place of the card's line (the row way), Cancel focused; Escape cancels. */
export function RemoveInline({ provider, name, t, inUse, onDone, onCancel }: RemoveProps) {
  const { removing, error, remove } = useRemoveKey(provider, name, t, onDone);
  const note = removeNote(t, name, inUse);
  return <div className="provider-remove-inline" role="group" aria-label={t("keys.removeConfirm", { provider: name })}
    onKeyDown={(event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      if (!removing) onCancel();
    }}>
    <p className="provider-remove-question">{t("keys.removeConfirm", { provider: name })}</p>
    {note && <p className="provider-key-line">{note}</p>}
    {error && <p className="provider-key-error" role="alert"><WarningIcon size={16} />{error}</p>}
    <div className="provider-key-actions">
      <p className="provider-key-status" role="status">{removing ? t("keys.removing") : ""}</p>
      <Button variant="ghost" tone="neutral" size="sm" autoFocus disabled={removing} onClick={onCancel}>{t("hosts.cancel")}</Button>
      <Button variant="danger" size="sm" loading={removing} onClick={() => void remove()}>{t("keys.remove")}</Button>
    </div>
  </div>;
}

/** A voice slot's provider while it has no key (`needed`): "OpenAI needs a key" and Connect, which opens the entry as
 *  Providers does (and keeps the key where Providers keeps it). Its entry stays open while the provider is asked, even
 *  if the key is kept for a moment meanwhile (a host that keeps it to test it). Once kept, the row goes: `onDone` says
 *  how it went, for the slot to say so and take the focus. */
export function ProviderKeyNeeded({ provider, name, needed, onDone }: { provider: string; name: string; needed: boolean; onDone: (outcome: KeyOutcome) => void }) {
  const t = hostTranslator();
  const variant = useProviderConnect();
  const [open, setOpen] = useState(false);
  const connect = useRef<HTMLButtonElement>(null);
  const focusBack = useFocusBack(() => connect.current);
  const label = t("keys.needsKey", { provider: name });
  const cancel = () => { setOpen(false); focusBack(); };
  const done = (outcome: KeyOutcome) => { setOpen(false); onDone(outcome); };
  const entry = { provider, name, t, replacing: null, onDone: done, onCancel: cancel };
  if (!needed && !open) return null;
  if (variant === "row" && open) return <Row label={label} block className="provider-key-needed"><KeyRow {...entry} /></Row>;
  return <Row label={label} className="provider-key-needed">
    <KeyEntry variant={variant} open={open} {...entry} opener={<Button ref={connect} variant="primary" size="sm" aria-label={t("keys.connectNamed", { provider: name })}
      {...openerState(variant, open)} onClick={() => setOpen(true)}>{t("keys.connect")}</Button>} />
  </Row>;
}

/** What an opener tells assistive tech about what it opens: a dialog (the popover is one too), and whether it is open. */
export function openerState(variant: ProviderConnect, open: boolean) {
  return variant === "row" ? {} : { "aria-haspopup": "dialog" as const, "aria-expanded": variant === "popover" ? open : undefined };
}

/** Focus back on what opened something once it has closed — the opener as it is drawn then (`target`) — unless focus
 *  went somewhere else meanwhile (a click outside a popover): only when what had it is gone. Looked at on the next
 *  tick: a popover leaves the page a render after it closes. */
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
