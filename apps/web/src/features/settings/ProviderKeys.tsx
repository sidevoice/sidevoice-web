import { useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Section } from "../../components/ui/Card";
import { DropdownMenu, DropdownMenuItem } from "../../components/ui/DropdownMenu";
import { CheckIcon, MoreIcon, ProviderLogo, WarningIcon } from "../../components/ui/Icons";
import { remoteProviders } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { catalogueShown } from "./ModelSetup";
import type { HostMessageKey } from "./messages/en";
import { KeyEntry, KeyInline, KeyRow, keyError, openerState, readHint, reasonState, RemoveDialog, RemoveInline, useFocusBack, useProviderConnect, type KeyOutcome, type KeyState } from "./ProviderConnect";

/* The remote providers, a card each, as apps show an account to connect: its mark, its name, one line on what it is
 * for, and one control. Not connected, Connect opens the key's entry (ProviderConnect: a dialog, a row in place, a
 * popover, or in place at the same size — the design being compared). Connected, the card says so, shows the key's
 * last four, and keeps Replace key and Remove in its menu; when the provider has a problem with the key, a line says it
 * in words, with the one thing to do about it. A key kept without the provider being reached to check it says so
 * until it is checked. */

/** The card's state: where the key stands, or kept but never checked (the provider couldn't be reached on Test and
 *  save). */
type State = KeyState | "unverified";

/** Where a provider's key stands: what the host keeps, and what the provider said last about it. */
function keyState(kept: boolean | null | undefined, catalog: CatalogView | undefined): KeyState {
  if (kept === false) return "absent";
  if (kept === undefined || kept === null) return "unknown";
  return reasonState(catalog?.status.reason?.code);
}

const TONE: Record<State, BadgeTone> = {
  absent: "neutral", connected: "positive", rejected: "danger", permission: "warning", quota: "warning",
  limited: "warning", unreachable: "neutral", unreadable: "danger", unknown: "neutral", problem: "warning", unverified: "neutral",
};

/** The one thing to do about a key's problem: another key where this one is refused or can't do the job; else asking
 *  the provider again. */
const REPLACE_FOR: ReadonlySet<State> = new Set(["rejected", "permission", "unreadable"]);

/** What a provider is used for, in a few words: its own where we have them, else from the models it lists. */
function usedFor(provider: string, catalog: CatalogView | undefined, t: HostTranslate) {
  if (provider === "openai" || provider === "elevenlabs") return t(`keys.purpose.${provider}` as HostMessageKey);
  const caps = new Set((catalog?.models ?? []).flatMap((model) => model.capabilities));
  return caps.has("stt") && caps.has("tts") ? t("keys.use.both") : caps.has("stt") ? t("keys.use.stt") : caps.has("tts") ? t("keys.use.tts") : t("keys.purpose.other");
}

type Open = "connect" | "replace" | "remove" | null;

/** One provider's card. What is open (the entry, Remove's question) is the card's; focus comes back to its control as
 *  it closes — Connect, or the menu once connected. */
function ProviderCard({ provider, name, catalog, inUse }: { provider: string; name: string; catalog: CatalogView | undefined; inUse: string[] }) {
  const t = hostTranslator();
  const variant = useProviderConnect();
  const store = useContext(RoomStoreContext);
  const kept = useRoomStore((state) => state.facts.providerKeys[provider]);
  const [open, setOpen] = useState<Open>(null);
  const [testing, setTesting] = useState(false);
  const [unverified, setUnverified] = useState(false);
  const [note, setNote] = useState("");
  const [hint, setHint] = useState(() => readHint(provider));
  // A menu item's choice, opened once the menu has closed and given focus back to its trigger.
  const chosen = useRef<Open>(null);
  const connectButton = useRef<HTMLButtonElement>(null);
  const more = useRef<HTMLButtonElement>(null);
  // What opened it when it is neither (the problem line's Replace key): focus goes back there while it is still drawn.
  const opener = useRef<HTMLElement | null>(null);
  const focusBack = useFocusBack(() => (opener.current?.isConnected ? opener.current : null) ?? more.current ?? connectButton.current);
  const show = (next: Open, from: HTMLElement | null = null) => { opener.current = from; setOpen(next); };
  const base = keyState(kept, catalog);
  const connected = kept === true;
  const state: State = unverified && base === "unreachable" ? "unverified" : base;
  // Checked since (it answered, or said something else): no longer unchecked.
  useEffect(() => { if (base !== "unreachable" && !testing) setUnverified(false); }, [base, testing]);
  const last4 = connected ? hint?.last4 ?? null : null;
  const problem = connected && state !== "connected" && state !== "unknown";
  const close = () => { setOpen(null); focusBack(); };
  const connectedNow = (outcome: KeyOutcome) => {
    setHint(readHint(provider));
    setUnverified(outcome === "unverified");
    setNote(outcome === "unverified" ? t("keys.why.unverified", { provider: name }) : t("keys.connected", { provider: name }));
    close();
  };
  const removed = () => { setHint(null); setUnverified(false); setNote(t("keys.removed")); close(); };
  async function test() {
    setTesting(true); setNote("");
    try { await window.sidevoiceActions?.testProviderKey?.(provider); }
    catch (failure) { setTesting(false); setNote(keyError(t, failure, name)); return; }
    setTesting(false);
    const after = reasonState(store?.getState().facts.voiceCatalogue.catalogs.find((entry) => entry.id === provider)?.status.reason?.code);
    if (after === "connected") { setNote(t("keys.tested")); focusBack(); }
    else setNote(t(("keys.why." + (after === "unreachable" && unverified ? "unverified" : after)) as HostMessageKey, { provider: name, last4: last4 ?? "" }));
  }
  const entering = open === "connect" || open === "replace";
  const inline = variant === "row" && open !== null;
  // In place (D): the entry where the control was, what it says where the use was; the card keeps its size.
  const inPlace = variant === "inline" && entering;
  const entry = { provider, name, t, replacing: open === "replace" ? last4 ?? "····" : null, onDone: connectedNow, onCancel: close };
  const remove = { provider, name, t, inUse, onDone: removed, onCancel: close };
  const control = connected
    ? <span className="provider-card-control">
        {testing ? <Badge tone="neutral">{t("keys.state.checking")}</Badge>
          : state === "connected" ? <Badge tone="positive"><CheckIcon size={12} />{t("keys.state.connected")}</Badge>
          : <Badge tone={TONE[state]} dot>{t(("keys.state." + state) as HostMessageKey)}</Badge>}
        {last4 && <span className="provider-card-masked"><span aria-hidden="true">••••{last4}</span><span className="sr-only">{t("keys.endsIn", { last4 })}</span></span>}
        <DropdownMenu label={t("keys.more", { provider: name })}
          trigger={<Button ref={more} variant="ghost" tone="neutral" size="icon-sm" aria-label={t("keys.more", { provider: name })}><MoreIcon /></Button>}
          onCloseAutoFocus={() => { const next = chosen.current; chosen.current = null; if (next) show(next); }}>
          <DropdownMenuItem onSelect={() => { chosen.current = "replace"; }}>{t("keys.replace")}</DropdownMenuItem>
          <DropdownMenuItem danger onSelect={() => { chosen.current = "remove"; }}>{t("keys.remove")}</DropdownMenuItem>
        </DropdownMenu>
      </span>
    : <Button ref={connectButton} size="sm" variant="primary" aria-label={t("keys.connectNamed", { provider: name })} {...openerState(variant, entering)}
        onClick={() => show("connect")}>{t("keys.connect")}</Button>;
  const main = (line: ReactNode, end: ReactNode) => <div className="provider-card-main">
    <span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={22} /></span>
    <div className="provider-card-copy">
      <span className="provider-card-title"><strong>{name}</strong>{inUse.length > 0 && connected && <Badge tone="accent">{t("keys.inUse")}</Badge>}</span>
      {line}
    </div>
    {end}
  </div>;
  return (
    <div className="provider-card" role="group" aria-label={name} data-provider={provider} data-state={state} data-open={inline ? open : undefined} data-in-place={inPlace || undefined}>
      {inPlace
        ? <KeyInline {...entry}>{({ controls, line }) => main(<span className="provider-card-purpose">{line}</span>, controls)}</KeyInline>
        : main(inline ? (open === "remove" ? <RemoveInline {...remove} /> : <KeyRow {...entry} />) : <span className="provider-card-purpose">{usedFor(provider, catalog, t)}</span>,
          !inline && <KeyEntry variant={variant} opener={control} open={entering} {...entry} />)}
      {problem && !inline && <div className="provider-card-problem">
        <WarningIcon size={14} />
        <p>{t(("keys.why." + state) as HostMessageKey, { provider: name, last4: last4 ?? "" })}
          {state !== "unverified" && catalog?.status.detail ? <span className="provider-card-detail"> {catalog.status.detail}</span> : null}</p>
        {inPlace ? null : REPLACE_FOR.has(state)
          ? <Button variant="secondary" size="sm" onClick={(event) => show("replace", event.currentTarget)} {...openerState(variant, open === "replace")}>{t("keys.replace")}</Button>
          : <Button variant="secondary" size="sm" loading={testing} aria-label={t("keys.testNamed", { provider: name })} onClick={() => void test()}>{t("keys.testAgain")}</Button>}
      </div>}
      {open === "remove" && variant !== "row" && <RemoveDialog {...remove} />}
      <p className="sr-only" role="status">{note}</p>
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
