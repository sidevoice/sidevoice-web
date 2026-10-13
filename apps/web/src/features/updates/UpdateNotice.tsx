import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { CloseIcon, UpdateIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { NARROW_QUERY, useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { openSettings } from "../settings/open-settings";
import { continueAfterRestart, thisComputerPlace, UPDATE_PLACE, useUpdates, useUpdatesRows, useUpdateNotice, type UpdaterStatus, type UpdatesRows } from "./useUpdates";
import "./updates.css";

/* Where the room says an update waits, on a desktop (a phone has none: its page picks up a new version when next
 * opened), as VARIANTS `update-notice` has it: a slim banner over the room with the most pressing one, dismissible until
 * it changes (B1, the default); that banner's look as a chip in Settings' row at the conversations' foot, Settings
 * then its gear — in the rail, an icon above the gear whose popover lists each one (B2); or the foot's quiet row, kept
 * as the reference (D, UpdatesEntry). The most pressing first: the desktop app's (automatic: nothing until it is ready
 * to restart into, as it downloads by itself; manual: available with Download, then its download's percentage, then
 * ready), the page's, this computer's service, the machines elsewhere. Restarting is only ever the person's press. What
 * can be done where it is said is done there — the app's Download and Restart, the page's Reload — and anything else
 * lands on its row's button in Settings › Updates (See updates). Every button says what it does, in the words of
 * Updates' rows (VARIANTS `updates-rows`). Never the voice's colour, which is the agents' waiting. */

type Notice =
  | { key: string; kind: "app"; status: UpdaterStatus }
  | { key: string; kind: "web" }
  | { key: string; kind: "service"; version: string }
  | { key: string; kind: "machines"; first: string; names: string[] };

const percent = (progress: number | undefined) => progress == null ? ""
  : new Intl.NumberFormat(document.documentElement.lang || undefined, { style: "percent" }).format(Math.max(0, Math.min(1, progress)));

/** The updates waiting, most pressing first, with what acting on each takes. */
function useNotices() {
  const t = hostTranslator();
  const rows = useUpdatesRows();
  const { items, app, appUpdate } = useUpdates();
  const machines = useRoomStore((state) => state.machines);
  const notices: Notice[] = [];
  if (app) notices.push({ key: `app:${app.state}:${app.version ?? ""}`, kind: "app", status: app });
  if (items.some((item) => item.kind === "web")) notices.push({ key: "web", kind: "web" });
  const service = items.find((item) => item.id === "machine:local");
  if (service) notices.push({ key: `service:${service.version}`, kind: "service", version: service.version });
  const remote = items.filter((item) => item.kind === "machine" && item.machine);
  if (remote.length) {
    // A remote machine with no name here is an unnamed one, never This computer.
    const names = remote.map((item) => machines.find((machine) => machine.pairingId === item.machine)?.host || t("hosts.unnamed"));
    notices.push({ key: "machines:" + remote.map((item) => item.machine).join(" "), kind: "machines", first: remote[0].machine!, names });
  }
  const appFound = !!appUpdate.status && appUpdate.status.state !== "idle";
  /** Where a notice's update is acted on in Settings › Updates. */
  const placeOf = (notice: Notice) => notice.kind === "app" ? UPDATE_PLACE.app : notice.kind === "machines" ? UPDATE_PLACE.machine(notice.first)
    : thisComputerPlace(appFound, rows);
  return { notices, appUpdate, rows, placeOf, t };
}
type Notices = ReturnType<typeof useNotices>;

/** What a notice says: the app's state with its version, the page's new version, the service's, the machines'. */
function noticeText(notice: Notice, rows: UpdatesRows, t: HostTranslate) {
  if (notice.kind === "app") {
    const { state, version } = notice.status;
    if (state === "ready") return version ? t("updates.notice.ready", { version }) : t("updates.notice.readyOne");
    if (state === "downloading") return version ? t("updates.notice.downloading", { version, percent: percent(notice.status.progress) })
      : t("updates.notice.downloadingOne", { percent: percent(notice.status.progress) });
    return version ? t("updates.notice.available", { version }) : t("updates.notice.availableOne");
  }
  if (notice.kind === "web") return t("updates.web");
  // One row has one Sidevoice, numbered as the app: the service's own number is not said.
  if (notice.kind === "service") return rows === "one" ? t("updates.notice.availableOne")
    : notice.version ? t("updates.notice.service", { version: notice.version }) : t("updates.notice.serviceOne");
  return notice.names.length === 1 ? t("updates.machine", { machine: notice.names[0] }) : t("updates.notice.machines", { n: notice.names.length });
}

/** A download or an install that failed, as the app says it; a failed check is Updates' to say. */
const appFailure = (status: UpdaterStatus) => status.error && status.error.code !== "update-check-failed" ? status.error : null;

/** An update's action: its words (`label`), the chip's one word for it (`short`), what it does, and where it lands
 *  instead when it is done in Settings › Updates (`land`). */
type Action = { label: string; short: string; run: () => Promise<unknown> | void; land?: string; aria?: string };

/** What acting on `notice` takes where it is said: the app's Restart (ready, either mode) or Download (manual, or a
 *  download that failed, as Retry download), the page's Reload; else See updates, landing on its row's button. Null
 *  while there is nothing to do but wait: the app's download. */
function noticeAction(notice: Notice, data: Notices, store: Parameters<typeof openSettings>[1]): Action | null {
  const { appUpdate, rows, placeOf, t } = data;
  if (notice.kind === "app") {
    const { state, error } = notice.status;
    const downloadFailed = error?.code === "update-download-failed";
    if (state === "downloading") return null;
    if (state === "ready" && appUpdate.can.restart) {
      const all = rows === "one";
      return { label: t(all ? "updates.action.restartAll" : "updates.action.restartApp"), short: t("updates.action.restart"),
        run: async () => { if (all) continueAfterRestart(); await appUpdate.restart(); } };
    }
    if (state === "available" && appUpdate.can.download && (appUpdate.mode === "manual" || downloadFailed)) return {
      label: t(downloadFailed ? "updates.action.retryDownload" : "updates.action.download"), short: t(downloadFailed ? "updates.retry" : "updates.action.download"),
      run: () => appUpdate.download() };
  } else if (notice.kind === "web") return { label: t("updates.reload"), short: t("updates.reload"), aria: t("updates.reloadNamed"), run: () => window.sidevoiceActions?.reloadToUpdate?.() };
  const place = placeOf(notice);
  return { label: t("settings.updates.see"), short: t("settings.updates.see"), run: () => openSettings({ section: "updates", focus: place }, store), land: place };
}

/** A notice's action, run where it is said: busy while it runs, what failed (its own call's, or the app's download or
 *  install), cleared as the app moves on. */
function useNoticeAct(notice: Notice, data: Notices) {
  const store = useContext(RoomStoreContext);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const action = noticeAction(notice, data, store);
  // What the app says next replaces what this said of its last call.
  const state = notice.kind === "app" ? notice.status.state : null;
  useEffect(() => { setFailure(null); }, [state]);
  async function act() {
    if (!action || busy) return;
    setFailure(null);
    if (action.land) { action.run(); return; }
    setBusy(true);
    try { await action.run(); } catch (reason) { setFailure(reason); } finally { setBusy(false); }
  }
  return { action, busy, error: failure ?? (notice.kind === "app" ? appFailure(notice.status) : null), act };
}

/** One update, said, with its action beside it, which reads the update's words as its description. A failure is said
 *  under both. Where its button goes as it acts (the app's download starts), focus stays on the update's words. */
function NoticeLine({ notice, data }: { notice: Notice; data: Notices }) {
  const { rows, t } = data;
  const { action, busy, error, act } = useNoticeAct(notice, data);
  const text = useRef<HTMLParagraphElement>(null);
  const textId = useId();
  const acted = useRef(false);
  useEffect(() => {
    if (!acted.current || action) return;
    acted.current = false;
    if (!document.activeElement || document.activeElement === document.body) text.current?.focus();
  }, [action?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="update-notice-line" data-kind={notice.kind}>
    <p ref={text} id={textId} className="update-notice-text" tabIndex={-1}>{noticeText(notice, rows, t)}</p>
    {action && <Button size="sm" variant={action.land ? "secondary" : "primary"} loading={busy} aria-label={action.aria} aria-describedby={action.aria ? undefined : textId}
      onClick={() => { acted.current = true; void act(); }}>{action.label}</Button>}
    {!!error && <ErrorText className="update-notice-error" role="alert" message={updaterFailure(error, { t })} />}
  </div>;
}

/** B1's notices hidden by the person, this window's: each comes back as its update moves on (downloaded, ready). */
const HIDDEN_KEY = "sidevoice.update-notice-hidden";
const readHidden = () => { try { return sessionStorage.getItem(HIDDEN_KEY); } catch { return null; } };

/** B1: a slim banner over the room with the most pressing update and its action; × hides it until that update moves
 *  on, focus going to what follows it. Not a live region: it is a standing notice, and its percentage moves. */
export function UpdateBanner() {
  const notice = useUpdateNotice();
  const narrow = useMedia(NARROW_QUERY);
  if (notice !== "banner" || narrow) return null;
  return <UpdateBannerShown />;
}

function UpdateBannerShown() {
  const data = useNotices();
  const { notices, t } = data;
  const [hidden, setHidden] = useState(readHidden);
  const banner = useRef<HTMLElement>(null);
  const lead = notices[0];
  if (!lead || hidden === lead.key) return null;
  function hide() {
    const focusable = "button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex='-1'])";
    const next = [...document.querySelectorAll<HTMLElement>(focusable)].find((element) => !banner.current?.contains(element)
      && !!(banner.current!.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING));
    try { sessionStorage.setItem(HIDDEN_KEY, lead.key); } catch { /* Hidden for this view only. */ }
    setHidden(lead.key);
    requestAnimationFrame(() => next?.focus());
  }
  return <aside ref={banner} className="room-banner update-banner" aria-label={t("updates.title")}>
    <UpdateIcon size={16} className="update-banner-icon" />
    <NoticeLine key={lead.kind} notice={lead} data={data} />
    <Button variant="ghost" tone="neutral" size="icon-sm" className="update-banner-hide" aria-label={t("updates.notice.dismiss")} title={t("updates.notice.dismiss")} onClick={hide}>
      <CloseIcon size={16} /></Button>
  </aside>;
}

/** The chip's words for an update: the app's name and version (or how far its download is), the page's Reload to
 *  update, Update available for the rest. */
function chipWords(notice: Notice, t: HostTranslate) {
  if (notice.kind === "app") {
    const { state, version } = notice.status;
    if (state === "downloading") return t("updates.downloadingPercent", { percent: percent(notice.status.progress) });
    return version ? t("updates.chip.app", { version }) : t("updates.chip.appOne");
  }
  if (notice.kind === "web") return t("updates.reloadToUpdate");
  return t(notice.kind === "machines" && notice.names.length > 1 ? "updates.availableAny" : "settings.updates.updateAvailable");
}

/** B2, beside the conversations' list: Settings and the most pressing update in one row, the update as a chip in the
 *  banner's look — its words cut short, never its action: "Sidevoice 0.4.0 · Restart", "· Download"; "Downloading…
 *  42 %", to read; "Reload to update"; "Update available", landing on its row in Updates — with what failed under the
 *  row. Settings is its gear then (named so, as in the rail), the chip taking the rest of the row. In the rail, the chip
 *  is an icon above the gear, its popover listing each update with its action. `settings(beside)`: the Settings button,
 *  its gear only while `beside`. Nothing waiting, Settings alone, as ever. */
export function UpdateBesideSettings({ rail, settings }: { rail: boolean; settings: (beside: boolean) => ReactNode }) {
  const data = useNotices();
  const lead = data.notices[0];
  if (!lead) return <>{settings(false)}</>;
  if (rail) return <div className="update-beside" data-rail=""><UpdateRailChip data={data} />{settings(true)}</div>;
  return <BesideRow key={lead.kind} notice={lead} data={data} settings={settings(true)} />;
}

function BesideRow({ notice, data, settings }: { notice: Notice; data: Notices; settings: ReactNode }) {
  const { rows, t } = data;
  const { action, busy, error, act } = useNoticeAct(notice, data);
  const words = chipWords(notice, t);
  // The app's own action has its word in the chip; anything else is the chip's words alone.
  const short = notice.kind === "app" && action ? action.short : null;
  const title = [noticeText(notice, rows, t), action?.label].filter(Boolean).join(" · ");
  // Its name begins with what it shows, then says the action in full ("… · Restart to update the app").
  const name = action && notice.kind !== "web" ? `${words} · ${action.label}` : undefined;
  return <div className="update-beside">
    <div className="update-beside-row">
      {settings}
      {action ? <Button variant="ghost" tone="neutral" className="update-chip" data-kind={notice.kind} loading={busy} aria-label={name} title={title} onClick={() => void act()}>
          <UpdateIcon size={16} /><span className="update-chip-words">{words}</span>
          {short && <><span className="update-chip-sep" aria-hidden="true">·</span><span className="update-chip-action">{short}</span></>}</Button>
        : <span className="update-chip" data-kind={notice.kind} title={title}><UpdateIcon size={16} /><span className="update-chip-words">{words}</span></span>}
    </div>
    {!!error && <ErrorText className="update-line-error" role="alert" message={updaterFailure(error, { t })} />}
  </div>;
}

/** B2 in the rail: the update's icon on the banner's ground, above the gear; its popover lists each update with its
 *  action, as the banner's line says it. */
function UpdateRailChip({ data }: { data: Notices }) {
  const { notices, t } = data;
  const label = t("updates.entry", { n: notices.length });
  const trigger = <Button variant="ghost" tone="neutral" size="icon" className="update-chip update-chip--icon" aria-label={label} title={label} aria-haspopup="dialog">
    <UpdateIcon size={20} /></Button>;
  return <Popover trigger={trigger} label={t("updates.title")} side="top" align="start">
    <div className="updates-panel">
      <h3>{t("updates.title")}</h3>
      {/* Keyed by what it is, not its state: a line that moves on (downloaded, ready) keeps its place and its focus. */}
      <ul className="update-notice-list">{notices.map((notice) => <li key={notice.kind}><NoticeLine notice={notice} data={data} /></li>)}</ul>
    </div>
  </Popover>;
}
