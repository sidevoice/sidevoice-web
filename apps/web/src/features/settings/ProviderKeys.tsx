import { useContext, useEffect, useRef, useState, type KeyboardEvent } from "react";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { Button } from "../../components/ui/Button";
import { Badge, type BadgeTone } from "../../components/ui/Badge";
import { Alert } from "../../components/ui/Alert";
import { Section } from "../../components/ui/Card";
import { Input } from "../../components/ui/Input";
import { CloseIcon, LinkIcon, ProviderLogo, SearchIcon, UnlinkIcon, WarningIcon } from "../../components/ui/Icons";
import { remoteProviders } from "../../services/voice-settings.js";
import type { CatalogView } from "../../services/model-catalogs.js";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import { catalogueShown } from "./ModelSetup";
import type { HostMessageKey } from "./messages/en";
import { DisconnectDialog, KeyDialog, keyError, listed, readHint, reasonState, useFocusBack, type KeyState } from "./ProviderConnect";

/* The remote providers, as a catalogue of connections: "Your providers" lists those with a key — the mark, the name with
 * how its key stands right after it, what it is for, and Disconnect — and "Add a provider" offers the rest as cards in a
 * grid, each with Connect, searched by name. Connect opens the key's dialog; a provider connected moves up to its
 * row, which takes the focus, and one disconnected moves back down, its Connect focused. When the provider has a
 * problem with a kept key, its row says it in words, with the one thing to do about it. */

/** Where a provider's key stands: what the host keeps, and what the provider said last about it. */
function keyState(kept: boolean | null | undefined, catalog: CatalogView | undefined): KeyState {
  if (kept === false) return "absent";
  if (kept === undefined || kept === null) return "unknown";
  return reasonState(catalog?.status.reason?.code);
}

const TONE: Record<KeyState, BadgeTone> = {
  absent: "neutral", connected: "positive", rejected: "danger", permission: "warning", quota: "warning",
  limited: "warning", unreachable: "neutral", unreadable: "danger", unknown: "neutral", problem: "warning",
};

/** The one thing to do about a key's problem: another key where this one is refused or can't do the job; else asking
 *  the provider again. */
const REPLACE_FOR: ReadonlySet<KeyState> = new Set(["rejected", "permission", "unreadable"]);

/** What each known provider offers, in its own order (it lists nothing until it has a key). */
const OFFERS: Record<string, ("stt" | "tts")[]> = { openai: ["stt", "tts"], elevenlabs: ["tts", "stt"] };

/** What a provider offers, in one short line ("Transcription · Voice"): known, else from the models it lists. */
function usedFor(provider: string, catalog: CatalogView | undefined, t: HostTranslate) {
  const caps = new Set((catalog?.models ?? []).flatMap((model) => model.capabilities));
  const offers = OFFERS[provider] ?? (["stt", "tts"] as const).filter((task) => caps.has(task));
  return offers.length ? offers.map((task) => t(`keys.use.${task}` as HostMessageKey)).join(" · ") : t("keys.purpose.other");
}

/** From how many providers to add a search is offered: below it, they are all in sight. */
const SEARCH_FROM = 8;

/** Text as search compares it: trimmed, any case, any accents. */
const folded = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();

type Provider = { id: string; name: string; catalog: CatalogView | undefined };
type ProviderProps = { provider: string; name: string; catalog: CatalogView | undefined };
/** What the pane says, and where the focus goes, once a provider has moved between the two lists. */
type Moved = { provider: string; to: "row" | "connect"; said: string };

/** A provider with a key: its row in "Your providers". What it opens (Replace key's dialog, Disconnect's question) is
 *  its own; focus comes back to what opened it, or to the row. */
function ConnectedRow({ provider, name, catalog, inUse, onDisconnected }: ProviderProps & { inUse: string[]; onDisconnected: () => void }) {
  const t = hostTranslator();
  const store = useContext(RoomStoreContext);
  const kept = useRoomStore((state) => state.facts.providerKeys[provider]);
  const [open, setOpen] = useState<"replace" | "disconnect" | null>(null);
  const [testing, setTesting] = useState(false);
  const [note, setNote] = useState("");
  const row = useRef<HTMLDivElement>(null);
  const opener = useRef<HTMLElement | null>(null);
  const focusBack = useFocusBack(() => (opener.current?.isConnected ? opener.current : null) ?? row.current);
  const show = (next: "replace" | "disconnect", from: HTMLElement) => { opener.current = from; setOpen(next); };
  const close = () => { setOpen(null); focusBack(); };
  const state = keyState(kept, catalog);
  // The page's note of the key, read as drawn: the dialog writes it once the key is kept, after this row appears.
  const last4 = readHint(provider)?.last4 ?? null;
  const problem = state !== "connected" && state !== "unknown";
  async function test() {
    setTesting(true); setNote("");
    try { await window.sidevoiceActions?.testProviderKey?.(provider); }
    catch (failure) { setTesting(false); setNote(keyError(t, failure, name).words); return; }
    setTesting(false);
    const after = reasonState(store?.getState().facts.voiceCatalogue.catalogs.find((entry) => entry.id === provider)?.status.reason?.code);
    if (after === "connected") { setNote(t("keys.tested")); row.current?.focus(); }
    else setNote(t(("keys.why." + after) as HostMessageKey, { provider: name, last4: last4 ?? "" }));
  }
  const pill = testing ? <Badge tone="neutral">{t("keys.state.checking")}</Badge>
    : state === "connected" ? <Badge tone="positive">{t("keys.state.connected")}</Badge>
    : <Badge tone={TONE[state]} dot>{t(("keys.state." + state) as HostMessageKey)}</Badge>;
  return (
    <div ref={row} className="provider-row" role="group" aria-label={name} data-provider={provider} data-state={state} tabIndex={-1}>
      <span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={22} /></span>
      <div className="provider-row-copy">
        <span className="provider-row-title"><strong>{name}</strong>{pill}
          {inUse.length > 0 && <Badge tone="accent">{t("keys.inUseFor", { uses: listed(inUse) })}</Badge>}</span>
        <span className="provider-row-line">{usedFor(provider, catalog, t)}</span>
        {problem && <div className="provider-row-problem">
          <WarningIcon size={14} />
          <p>{t(("keys.why." + state) as HostMessageKey, { provider: name, last4: last4 ?? "" })}
            {catalog?.status.detail ? <span className="provider-key-detail"> {catalog.status.detail}</span> : null}</p>
          {REPLACE_FOR.has(state)
            ? <Button variant="secondary" size="sm" aria-haspopup="dialog" onClick={(event) => show("replace", event.currentTarget)}>{t("keys.replace")}</Button>
            : <Button variant="secondary" size="sm" loading={testing} aria-label={t("keys.testNamed", { provider: name })} onClick={() => void test()}>{t("keys.testAgain")}</Button>}
        </div>}
      </div>
      <Button className="provider-row-action" variant="secondary" size="sm" aria-label={t("keys.disconnectNamed", { provider: name })} aria-haspopup="dialog"
        onClick={(event) => show("disconnect", event.currentTarget)}><UnlinkIcon />{t("keys.disconnect")}</Button>
      {open === "replace" && <KeyDialog provider={provider} name={name} replacing={last4 ?? "····"}
        onDone={() => { setNote(t("keys.replaced", { provider: name })); setOpen(null); row.current?.focus(); }} onCancel={close} />}
      {open === "disconnect" && <DisconnectDialog provider={provider} name={name} last4={last4} inUse={inUse} onDone={() => { setOpen(null); onDisconnected(); }} onCancel={close} />}
      <p className="sr-only" role="status">{note}</p>
    </div>
  );
}

/** A provider without a key: its card in "Add a provider", Connect opening the key's dialog. */
function AvailableCard({ provider, name, catalog, onConnected }: ProviderProps & { onConnected: () => void }) {
  const t = hostTranslator();
  const [open, setOpen] = useState(false);
  const connect = useRef<HTMLButtonElement>(null);
  const focusBack = useFocusBack(() => connect.current);
  return (
    <div className="provider-card" role="group" aria-label={name} data-provider={provider}>
      <span className="provider-mark" aria-hidden="true"><ProviderLogo provider={provider} size={22} /></span>
      <div className="provider-card-copy">
        <strong>{name}</strong>
        <span className="provider-card-purpose">{usedFor(provider, catalog, t)}</span>
      </div>
      <Button ref={connect} id={`provider-connect-${provider}`} className="provider-card-action" variant="secondary" size="sm"
        aria-label={t("keys.connectNamed", { provider: name })} aria-haspopup="dialog" onClick={() => setOpen(true)}><LinkIcon />{t("keys.connect")}</Button>
      {open && <KeyDialog provider={provider} name={name} replacing={null} onDone={() => { setOpen(false); onConnected(); }} onCancel={() => { setOpen(false); focusBack(); }} />}
    </div>
  );
}

/** "Add a provider"'s search: filters the cards as it is typed; × or Escape clears it (Escape then stays here). How
 *  many match is said once typing pauses. */
function ProviderSearch({ query, onQuery, matches, t }: { query: string; onQuery: (query: string) => void; matches: number; t: HostTranslate }) {
  const field = useRef<HTMLInputElement>(null);
  const [said, setSaid] = useState("");
  useEffect(() => {
    if (!query.trim()) { setSaid(""); return; }
    const timer = window.setTimeout(() => setSaid(matches === 0 ? t("keys.search.none", { query: query.trim() })
      : matches === 1 ? t("keys.search.one") : t("keys.search.many", { count: matches })), 500);
    return () => window.clearTimeout(timer);
  }, [query, matches, t]);
  const keys = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") event.preventDefault();
    if (event.key === "Escape" && query) { event.preventDefault(); event.stopPropagation(); onQuery(""); }
  };
  return <div className="provider-search">
    <SearchIcon className="provider-search-icon" />
    <Input ref={field} type="search" size="sm" value={query} aria-label={t("keys.search.label")} placeholder={t("keys.search.label")}
      autoComplete="off" spellCheck={false} onChange={(event) => onQuery(event.target.value)} onKeyDown={keys} />
    {query && <Button className="provider-search-clear" variant="ghost" tone="neutral" size="icon-sm" aria-label={t("keys.search.clear")} title={t("keys.search.clear")}
      onClick={() => { onQuery(""); field.current?.focus(); }}><CloseIcon /></Button>}
    <p className="sr-only" role="status">{said}</p>
  </div>;
}

export function ProviderKeys() {
  const t = hostTranslator();
  const inApp = useRoomStore((state) => state.facts.inApp);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const keys = useRoomStore((state) => state.facts.providerKeys);
  const settings = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const [query, setQuery] = useState("");
  const [moved, setMoved] = useState<Moved | null>(null);
  const pane = useRef<HTMLDivElement>(null);
  const providers: Provider[] = remoteProviders(catalogue.catalogs).map((provider) =>
    ({ id: provider.id, name: provider.name, catalog: catalogue.catalogs.find((catalog) => catalog.id === provider.id) }));
  const uses = (provider: string) => [settings?.stt.catalog === provider ? t("settings.section.transcription") : "", settings?.tts.catalog === provider ? t("settings.section.voice") : ""].filter(Boolean);
  const yours = providers.filter((provider) => keys[provider.id] === true);
  const rest = providers.filter((provider) => keys[provider.id] !== true);
  const searchable = rest.length >= SEARCH_FROM;
  // A search taken away (fewer to add than SEARCH_FROM) takes its filter with it.
  const wanted = searchable ? folded(query) : "";
  const matches = (provider: Provider) => folded(`${provider.name} ${usedFor(provider.id, provider.catalog, t)}`).includes(wanted);
  const shown = wanted ? rest.filter(matches) : rest;
  // Nothing to add matches, but one already connected does: said, rather than "no match" under its row.
  const connectedMatch = wanted && !shown.length ? yours.find(matches) : undefined;
  // Moved between the lists: once drawn where it now is, its row (connected) or its Connect (disconnected) takes the focus.
  useEffect(() => {
    if (!moved) return;
    const target = moved.to === "row" ? pane.current?.querySelector<HTMLElement>(`.provider-row[data-provider='${moved.provider}']`)
      : document.getElementById(`provider-connect-${moved.provider}`);
    target?.focus();
  }, [moved]);
  const disconnected = (provider: Provider) => {
    // Its card must be there to take the focus: a search that would hide it is cleared.
    if (wanted && !matches(provider)) setQuery("");
    setMoved({ provider: provider.id, to: "connect", said: t("keys.disconnected", { provider: provider.name }) });
  };
  return (
    <Section id="providers" title={t("keys.title")}>
      <div ref={pane} className="providers">
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
        {catalogueShown(catalogue) && !providers.length ? <p className="muted" id="provider-keys-none">{t("keys.none")}</p> : null}
        {catalogueShown(catalogue) && providers.length > 0 && <section className="ui-card providers-card" aria-labelledby="providers-yours">
          <header className="providers-card-head"><h3 id="providers-yours">{t("keys.section.yours")}</h3></header>
          {yours.length ? <div className="provider-rows">
            {yours.map((provider) => <ConnectedRow key={provider.id} provider={provider.id} name={provider.name} catalog={provider.catalog} inUse={uses(provider.id)} onDisconnected={() => disconnected(provider)} />)}
          </div> : <p className="muted" id="providers-yours-none">{t("keys.section.yoursNone")}</p>}
        </section>}
        {catalogueShown(catalogue) && providers.length > 0 && <section className="ui-card providers-card" aria-labelledby="providers-add">
          <header className="providers-card-head">
            <h3 id="providers-add">{t("keys.section.add")}</h3>
            {searchable && <ProviderSearch query={query} onQuery={setQuery} matches={shown.length} t={t} />}
          </header>
          {!rest.length ? <p className="muted">{t("keys.section.allConnected")}</p>
            : !shown.length ? <p className="muted">{connectedMatch ? t("keys.search.connected", { provider: connectedMatch.name }) : t("keys.search.none", { query: query.trim() })}</p>
            : <div className="provider-grid">
                {shown.map((provider) => <AvailableCard key={provider.id} provider={provider.id} name={provider.name} catalog={provider.catalog}
                  onConnected={() => setMoved({ provider: provider.id, to: "row", said: t("keys.connected", { provider: provider.name }) })} />)}
              </div>}
        </section>}
        <p className="sr-only" role="status">{moved?.said ?? ""}</p>
      </div>
    </Section>
  );
}
