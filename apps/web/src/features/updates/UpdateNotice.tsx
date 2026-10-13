import { useContext, useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { CloseIcon, UpdateIcon } from "../../components/ui/Icons";
import { Popover } from "../../components/ui/Popover";
import { NARROW_QUERY, useMedia } from "../../state/call-layout";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { openSettings } from "../settings/open-settings";
import { continueAfterRestart, thisComputerPlace, UPDATE_PLACE, useUpdateNotice, useUpdates, useUpdatesRows, type UpdaterStatus, type UpdatesRows } from "./useUpdates";
import "./updates.css";

/* Where the room says an update waits, on a desktop (a phone has none: its page picks up a new version when next
 * opened), as VARIANTS `update-notice` has it: an update icon by the brand, its popover listing each update with its
 * action (C, the default); a mark on the Settings gear, which then opens Settings › Updates on the most pressing one's
 * button (A); a slim banner over the room with the most pressing one, dismissible until it changes (B); or the
 * conversations' foot, today's (D, UpdatesEntry). The most pressing first: the desktop app's (automatic: nothing until it
 * is ready to restart into; manual: available, its download's percentage, ready), the page's, this computer's service,
 * the machines elsewhere. What can be done where it is said is done there — the app's Update and Restart, the page's
 * Reload — and anything else lands on its row's button in Settings › Updates (See updates). Every button says what it
 * updates, in the words of Updates' rows (VARIANTS `updates-rows`). Never the voice's colour, which is the agents'
 * waiting. The mark on the gear is the update's icon, never a dot, which beside the conversations' avatars would read
 * as a state. */

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

type Action = { label: string; run: () => Promise<unknown> | void; land?: string; aria?: string };

/** One update, said, with its action: done in place where it can be (the app's Update and Restart, the page's
 *  Reload), else See updates, landing on its row's button. A failure is said under it. Where its button goes as it acts
 *  (the app's download starts), focus stays on the update's words. */
function NoticeLine({ notice, data }: { notice: Notice; data: ReturnType<typeof useNotices> }) {
  const { appUpdate, rows, placeOf, t } = data;
  const store = useContext(RoomStoreContext);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);
  const text = useRef<HTMLParagraphElement>(null);
  const acted = useRef(false);
  const all = rows === "one";
  const see: Action = { label: t("settings.updates.see"), run: () => openSettings({ section: "updates", focus: placeOf(notice) }, store), land: placeOf(notice) };
  let action: Action | null = see;
  if (notice.kind === "app") {
    const { state } = notice.status;
    const downloadFailed = notice.status.error?.code === "update-download-failed";
    if (state === "downloading") action = null;
    else if (state === "ready" && appUpdate.can.restart) action = { label: t(all ? "updates.action.restartAll" : "updates.action.restartApp"),
      run: async () => { if (all) continueAfterRestart(); await appUpdate.restart(); } };
    else if (state === "available" && appUpdate.can.download && (appUpdate.mode === "manual" || downloadFailed)) action = {
      label: t(downloadFailed ? all ? "updates.action.retryAll" : "updates.action.retryApp" : all ? "updates.action.updateAll" : "updates.action.updateApp"),
      run: () => appUpdate.download() };
  } else if (notice.kind === "web") action = { label: t("updates.reload"), aria: t("updates.reloadNamed"), run: () => window.sidevoiceActions?.reloadToUpdate?.() };
  // What the app says next replaces what this said of its last call.
  const state = notice.kind === "app" ? notice.status.state : null;
  useEffect(() => { setFailure(null); }, [state]);
  useEffect(() => {
    if (!acted.current || action) return;
    acted.current = false;
    if (!document.activeElement || document.activeElement === document.body) text.current?.focus();
  }, [action?.label]); // eslint-disable-line react-hooks/exhaustive-deps
  async function act() {
    if (!action || busy) return;
    acted.current = true;
    setFailure(null);
    if (action.land) { action.run(); return; }
    setBusy(true);
    try { await action.run(); } catch (reason) { setFailure(reason); } finally { setBusy(false); }
  }
  const error = failure ?? (notice.kind === "app" ? appFailure(notice.status) : null);
  return <div className="update-notice-line" data-kind={notice.kind}>
    <p ref={text} className="update-notice-text" tabIndex={-1}>{noticeText(notice, rows, t)}</p>
    {action && <Button size="sm" variant={action.land ? "secondary" : "primary"} loading={busy} aria-label={action.aria} onClick={() => void act()}>{action.label}</Button>}
    {!!error && <ErrorText className="update-notice-error" role="alert" message={updaterFailure(error, { t })} />}
  </div>;
}

/** C: an update icon by the brand, a dot on it while anything waits; its popover lists each one with its action. */
export function UpdateBrandNotice() {
  const data = useNotices();
  const { notices, t } = data;
  if (!notices.length) return null;
  const label = t("updates.entry", { n: notices.length });
  const trigger = <Button variant="ghost" tone="neutral" size="icon-sm" className="update-brand" aria-label={label} title={label} aria-haspopup="dialog">
    <UpdateIcon size={18} /><span className="update-brand-dot" aria-hidden="true" /></Button>;
  return <Popover trigger={trigger} label={t("updates.title")} side="bottom" align="start">
    <div className="updates-panel">
      <h3>{t("updates.title")}</h3>
      {/* Keyed by what it is, not its state: a line that moves on (downloaded, ready) keeps its place and its focus. */}
      <ul className="update-notice-list">{notices.map((notice) => <li key={notice.kind}><NoticeLine notice={notice} data={data} /></li>)}</ul>
    </div>
  </Popover>;
}

/** A: the gear's mark and where pressing it lands, while an update waits that Settings holds (the page's new version
 *  loads by itself after the call: Updates does not list it). Null while none does. */
export function useGearUpdate() {
  const { notices, placeOf, t } = useNotices();
  const lead = notices.find((notice) => notice.kind !== "web");
  return lead ? { place: placeOf(lead), label: t("updates.notice.gear") } : null;
}

/** The gear's mark (A): the update's icon on the gear's corner, where the "new" count would be. */
export function GearUpdateMark() {
  return <span className="settings-notice" data-mark="update" aria-hidden="true"><UpdateIcon size={10} /></span>;
}

/** B's notices hidden by the person, this window's: each comes back as its update moves on (downloaded, ready). */
const HIDDEN_KEY = "sidevoice.update-notice-hidden";
const readHidden = () => { try { return sessionStorage.getItem(HIDDEN_KEY); } catch { return null; } };

/** B: a slim banner over the room with the most pressing update and its action; × hides it until that update moves
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

/** C's place: the update icon by the brand, on a desktop's sidebar, while the variant says so. */
export function UpdateNoticeByBrand() {
  const notice = useUpdateNotice();
  return notice === "brand" ? <UpdateBrandNotice /> : null;
}
