import { useContext, useEffect, useId, useLayoutEffect, useReducer, useRef, useState, type RefObject } from "react";
import { Button } from "../../components/ui/Button";
import { ErrorText } from "../../components/ui/ErrorText";
import { CloseIcon, UpdateIcon } from "../../components/ui/Icons";
import { returnFocus } from "../../lib/focus-return";
import { NARROW_QUERY, useMedia } from "../../state/call-layout";
import { RoomStoreContext } from "../../state/room-store";
import { updaterFailure } from "../settings/error-message";
import { hostTranslator, type HostTranslate } from "../settings/host-i18n";
import { openSettings } from "../settings/open-settings";
import { continueAfterRestart, UPDATE_PLACE, useUpdates, type UpdaterStatus } from "./useUpdates";
import "./updates.css";

/* Where the room says an update waits, on a desktop (a phone has none: its page picks up a new version when next
 * opened): a pill floating at the top centre of the stage, over it (decided: the update-notice variant is gone, and a
 * value still stored for it changes nothing). It takes no room of its own: the room never moves for it. It says this
 * computer's most pressing update and its action, then × — the desktop app's (manual: Version 0.4.0 available · Download once a check found one;
 * automatic: nothing while it downloads by itself; either mode, once downloaded: Sidevoice 0.4.0 is ready · Restart to
 * update; nothing while the person's own check runs: appUpdateShown), the page's (Reload). Only this computer's: a
 * machine elsewhere that is behind is its row's in Settings › Updates, never the room's. This computer's service is
 * folded into the app's update (Updates' one Sidevoice row): it has no notice of its own. Restarting is only ever the
 * person's press. × hides it until a newer version, until the app says none waits, or until the app restarts. Never the
 * voice's colour, which is the agents' waiting. */

type Notice =
  | { key: string; kind: "app"; status: UpdaterStatus }
  | { key: string; kind: "web" };

/** This computer's updates waiting, most pressing first, with what acting on each takes: the app's, then the page's.
 *  A remote machine's is not one of them: Settings › Updates says it, in its row. */
function useNotices() {
  const t = hostTranslator();
  const { items, app, appUpdate } = useUpdates();
  const notices: Notice[] = [];
  if (app) notices.push({ key: `app:${app.state}:${app.version ?? ""}`, kind: "app", status: app });
  if (items.some((item) => item.kind === "web")) notices.push({ key: "web", kind: "web" });
  return { notices, appUpdate, t };
}
type Notices = ReturnType<typeof useNotices>;

/** What a notice says: the app's update with its version (available, ready), the page's new version. */
function noticeText(notice: Notice, t: HostTranslate) {
  if (notice.kind === "app") {
    const { state, version } = notice.status;
    if (state === "ready") return version ? t("updates.notice.ready", { version }) : t("updates.notice.readyOne");
    return version ? t("updates.available", { version }) : t("updates.availableOne");
  }
  return t("updates.web");
}

/** A download or an install that failed, as the app says it; a failed check is Updates' to say. */
const appFailure = (status: UpdaterStatus) => status.error && status.error.code !== "update-check-failed" ? status.error : null;

/** An update's action: its words, what it does, and where it lands instead when it is done in Settings › Updates
 *  (`land`). */
type Action = { label: string; run: () => Promise<unknown> | void; land?: string; aria?: string };

/** What acting on `notice` takes where it is said: the app's Restart to update (ready) or Download (manual, or a
 *  download that failed, as Retry download), the page's Reload; else See updates, landing on the app's row. */
function noticeAction(notice: Notice, data: Notices, store: Parameters<typeof openSettings>[1]): Action {
  const { appUpdate, t } = data;
  if (notice.kind === "app") {
    const { state, error } = notice.status;
    const downloadFailed = error?.code === "update-download-failed";
    if (state === "ready" && appUpdate.can.restart) return { label: t("updates.notice.restart"),
      // Sidevoice as one: its service follows the app's restart (continueAfterRestart).
      run: async () => { continueAfterRestart(); await appUpdate.restart(); } };
    if (state === "available" && appUpdate.can.download && (appUpdate.mode === "manual" || downloadFailed)) return {
      label: t(downloadFailed ? "updates.action.retryDownload" : "updates.action.download"), run: () => appUpdate.download() };
  } else if (notice.kind === "web") return { label: t("updates.reload"), aria: t("updates.reloadNamed"), run: () => window.sidevoiceActions?.reloadToUpdate?.() };
  const place = UPDATE_PLACE.app;
  return { label: t("settings.updates.see"), run: () => openSettings({ section: "updates", focus: place }, store), land: place };
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
    if (busy) return;
    setFailure(null);
    if (action.land) { action.run(); return; }
    setBusy(true);
    try { await action.run(); } catch (reason) { setFailure(reason); } finally { setBusy(false); }
  }
  return { action, busy, error: failure ?? (notice.kind === "app" ? appFailure(notice.status) : null), act };
}

/** One update, said on one line, its words cut short before its action, which reads them as its description; what
 *  failed under it, over the room too. */
function NoticeLine({ notice, data }: { notice: Notice; data: Notices }) {
  const { t } = data;
  const { action, busy, error, act } = useNoticeAct(notice, data);
  const textId = useId();
  const text = noticeText(notice, t);
  return <div className="update-notice-line" data-kind={notice.kind}>
    <p id={textId} className="update-notice-text" title={text}>{text}</p>
    <Button size="sm" variant={action.land ? "secondary" : "primary"} loading={busy} aria-label={action.aria} aria-describedby={action.aria ? undefined : textId}
      onClick={() => void act()}>{action.label}</Button>
    {!!error && <ErrorText className="update-notice-error" role="alert" message={updaterFailure(error, { t })} />}
  </div>;
}

/** The notice, the pill over the stage's top (CallStage's `notice`); a desktop's only. */
export function UpdateNotice() {
  const narrow = useMedia(NARROW_QUERY);
  if (narrow) return null;
  return <NoticeShown />;
}

/** The most pressing update that × did not hide (hidden, the next one waiting shows): its icon, its line, then ×. It comes and goes softly (none under reduced
 *  motion); going while focus is in it — hidden, or acted on — focus goes to the room's main region. Not a live region: a
 *  standing notice. */
function NoticeShown() {
  const data = useNotices();
  const { t } = data;
  const [hidden, hideNotice, forget] = useHidden();
  // The app saying none waits (idle: installed, or gone) spends what × hid of its update: what it finds next shows.
  const appIdle = data.appUpdate.status?.state === "idle";
  useEffect(() => { if (appIdle) forget("app"); }, [appIdle]); // eslint-disable-line react-hooks/exhaustive-deps
  const box = useRef<HTMLElement>(null);
  const lead = data.notices.find((each) => !hidden.includes(hideKey(each))) ?? null;
  const { notice, leaving } = useLeaving(lead, box);
  if (!notice) return null;
  return <aside ref={box} className="update-notice" data-kind={notice.kind} data-leaving={leaving || undefined} inert={leaving} aria-label={t("updates.title")}>
    <UpdateIcon size={16} className="update-notice-icon" />
    <NoticeLine key={notice.kind} notice={notice} data={data} />
    <Button variant="ghost" tone="neutral" size="icon-sm" className="update-notice-hide" aria-label={t("updates.notice.hide")} title={t("updates.notice.hide")}
      onClick={() => hideNotice(notice)}><CloseIcon size={16} /></Button>
  </aside>;
}

/** How long a notice takes to go. */
const LEAVE_MS = 200;
const reducedMotion = () => !!window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

/** `shown`, or the one just gone while it leaves (`leaving`, LEAVE_MS; at once under reduced motion). */
function useLeaving(shown: Notice | null, box: RefObject<HTMLElement | null>) {
  const last = useRef<Notice | null>(null);
  const [, gone] = useReducer((n: number) => n + 1, 0);
  if (shown) last.current = shown;
  const leaving = !shown && last.current !== null;
  useLayoutEffect(() => {
    if (!leaving) return;
    if (box.current?.contains(document.activeElement)) returnFocus();
    const timer = setTimeout(() => { last.current = null; gone(); }, reducedMotion() ? 0 : LEAVE_MS);
    return () => clearTimeout(timer);
  }, [leaving, box]);
  return { notice: shown ?? last.current, leaving };
}

/** The updates hidden by the notice's ×, this window's — an app restarted starts over — each until a newer version of
 *  it is found, or (`forget`) until none of its kind waits; every place that shows the notice hears it at once. The
 *  update stays in Settings › Updates. */
const HIDDEN_KEY = "sidevoice.update-notice-hidden";
function readHidden(): string[] {
  try { const kept: unknown = JSON.parse(sessionStorage.getItem(HIDDEN_KEY) || "[]"); return Array.isArray(kept) ? kept.filter((key) => typeof key === "string") : []; }
  catch { return []; }
}
/** What a hidden notice waits for: a version newer than this one (its state moving on — downloaded, ready — is not). */
const hideKey = (notice: Notice) => notice.kind === "app" ? `app:${notice.status.version ?? ""}` : notice.key;
const hiddenListeners = new Set<() => void>();
function useHidden(): [string[], (notice: Notice) => void, (kind: Notice["kind"]) => void] {
  const [hidden, setHidden] = useState(readHidden);
  useEffect(() => { const heard = () => setHidden(readHidden()); hiddenListeners.add(heard); return () => { hiddenListeners.delete(heard); }; }, []);
  const keep = (next: string[]) => {
    try { sessionStorage.setItem(HIDDEN_KEY, JSON.stringify(next)); } catch { /* This view only. */ }
    setHidden(next); hiddenListeners.forEach((heard) => heard());
  };
  const others = (kind: string) => readHidden().filter((key) => key.split(":")[0] !== kind);
  // An older version of the same update hidden before is no longer kept: only what waits now.
  const hide = (notice: Notice) => keep([...others(hideKey(notice).split(":")[0]), hideKey(notice)]);
  const forget = (kind: Notice["kind"]) => { if (others(kind).length !== readHidden().length) keep(others(kind)); };
  return [hidden, hide, forget];
}
