import { useContext, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Row } from "../../components/ui/Card";
import { CheckIcon, PauseIcon, SpeakerIcon } from "../../components/ui/Icons";
import { host, type MediaDuckAccess, type MediaDuckPermission, type MediaDuckStatus } from "../../host";
import type { MessageKey, Translate } from "../../i18n/translator";
import { RoomStoreContext } from "../../state/room-store";

/* What the app does to other apps' media in a call (sidevoice-desktop `host.mediaDuck`) as the screens that show it read it:
 * Settings › Call's row, and the permissions it needs in the list of permissions (operator, 2026-11-04: asked in the
 * setup and listed in Settings › Permissions; the Call row only links there). */

/** What every screen showing the status is told, so they all show the same one. */
const shown = new Set<(value: MediaDuckStatus) => void>();
/** The latest request per lane, across every screen: an answer is shown everywhere, so a late one from any screen must not
 *  undo a newer request made on another (a read on focus answering after the Call row's choice). */
const latest: Record<string, number> = {};
const next = (lane: string) => (latest[lane] = (latest[lane] ?? 0) + 1);

/** `host().mediaDuck`'s status, read as the screen shows and again whenever the person comes back to this window: they may
 *  have answered the system's question, or opened Music, in between. Only the answer to the latest request is kept (one
 *  that comes late, after the system's question took a while, is not), per lane: the status (reads and the choice) and each
 *  permission's Allow, so two questions answered in any order are both kept. `run` sends a request, and settles once
 *  answered. Null status where the app does not offer it (a browser), and until the first answer; `known` once there is an
 *  answer, a read that failed, or nothing to read. Every screen showing it at once shares each answer and choice (the
 *  Settings nav's warning dot follows the mode the Call row just chose). */
export function useMediaDuck() {
  const bridge = host().mediaDuck;
  const [status, own] = useState<MediaDuckStatus | null>(null);
  useEffect(() => { shown.add(own); return () => { shown.delete(own); }; }, []);
  const setStatus = (value: MediaDuckStatus) => { for (const show of shown) show(value); };
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let gone = false;
    const read = () => {
      const id = next("status");
      void bridge.get().then((value) => { if (!gone && id === latest.status) setStatus(value); }, () => { if (!gone) setUnread(true); });
    };
    const visible = () => { if (document.visibilityState === "visible") read(); };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", visible);
    return () => { gone = true; window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", visible); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Sends `request` in `lane`; its answer is shown if no later request was made in that lane, `failed` (if given) when it
   *  fails. */
  const run = (request: () => Promise<MediaDuckStatus>, failed?: MediaDuckStatus, lane = "status") => {
    const id = next(lane);
    return request().then((value) => { if (id === latest[lane]) setStatus(value); }, () => { if (failed && id === latest[lane]) setStatus(failed); });
  };
  return { bridge, status, setStatus, run, known: !bridge || status !== null || unread };
}

/** Whether a permission is missing in a way the person can change: not asked yet, or refused. */
export function missing(access: MediaDuckAccess | undefined) {
  return access === "undetermined" || access === "denied";
}

/** The permission the current choice needs and lacks, if any (`unknown` is not taken for missing): lowering any app
 *  (System Audio Recording) for Lower, else controlling Music and Spotify where the choice goes through them (Pause on a
 *  Mac, or Lower without System Audio Recording). System Audio Recording allowed but waiting for a restart (`restart`) is
 *  not one the person can Allow, yet it is not done either: it still counts, so the Call row and Settings' warning keep
 *  pointing to the list of permissions until the app has restarted. */
export function neededPermission(status: MediaDuckStatus | null): MediaDuckPermission | null {
  if (!status) return null;
  const { mode, lower, pause, access, capture } = status;
  const throughNamed = (mode === "lower" && lower === "some-apps") || (mode === "pause" && pause === "some-apps");
  return mode === "lower" && (missing(capture) || capture === "restart") ? "capture" : throughNamed && missing(access) ? "automation" : null;
}

/** Whether the app reports any permission its media handling needs here: then the list of permissions is shown for them,
 *  microphone or not (Settings › Permissions, the setup's permissions step). */
export function listsMediaPermissions(status: MediaDuckStatus | null) {
  return !!status && (status.capture !== undefined || status.access !== undefined);
}

/** Whether a call is joined, where the room's store is there to say (the setup's step has none: false). */
function useInCall() {
  const store = useContext(RoomStoreContext);
  return useSyncExternalStore(
    (listener) => store?.subscribe(listener) ?? (() => undefined),
    () => !!store?.getState().call.joined,
    () => false,
  );
}

type MediaBridge = NonNullable<ReturnType<typeof host>["mediaDuck"]>;

/** What pressing Allow and Restart now does, shared by the list of permissions and Call's note, so both ask the app the same
 *  way: Allow is the person's own request (the system may ask then), shown while it is in flight; Restart now asks the app
 *  to restart, and what it came to is kept (`refused`: the app refuses during a call, or it failed). `onSay`: the
 *  refusal, for a live region. `restart` is null where the app cannot (an older one). */
export function useMediaActions(bridge: MediaBridge | null, run: ReturnType<typeof useMediaDuck>["run"], t: Translate, onSay: (text: string) => void = () => undefined) {
  const inCall = useInCall();
  // Each permission's own question in flight: one being asked does not hold the other.
  const [asking, setAsking] = useState<Partial<Record<MediaDuckPermission, boolean>>>({});
  const [refused, setRefused] = useState<MessageKey | null>(null);
  const [restarting, setRestarting] = useState(false);
  const allow = bridge?.allow ? (permission: MediaDuckPermission) => {
    setAsking((now) => ({ ...now, [permission]: true }));
    void run(() => bridge.allow!(permission), undefined, permission).finally(() => setAsking((now) => ({ ...now, [permission]: false })));
  } : null;
  const restart = bridge?.restart ? () => {
    setRefused(null);
    setRestarting(true);
    bridge.restart!().catch((error: unknown) => {
      const key: MessageKey = (error as { key?: unknown } | null)?.key === "media_duck.restart-in-call" ? "perm.capture.restartInCall" : "perm.capture.restartFailed";
      setRefused(key);
      onSay(t(key));
    }).finally(() => setRestarting(false));
  } : null;
  return { inCall, asking, allow, restart, restarting, refused };
}

/** The Allow of a permission, the same wherever it is. */
export function AllowButton({ asking, onClick, t }: { asking: boolean; onClick(): void; t: Translate }) {
  return <Button size="sm" variant="primary" loading={asking} onClick={onClick}>{t("perm.allow")}</Button>;
}

/** Restart now, the same wherever it is: waits (disabled) while a call is joined. */
export function RestartButton({ restarting, inCall, onClick, t }: { restarting: boolean; inCall: boolean; onClick(): void; t: Translate }) {
  return <Button size="sm" variant="primary" loading={restarting} disabled={inCall} onClick={onClick}>{t("perm.capture.restartNow")}</Button>;
}

const ICON: Record<MediaDuckPermission, typeof SpeakerIcon> = { capture: SpeakerIcon, automation: PauseIcon };

function MediaPermissionRow({ permission, access, asking, inCall, restarting, refused, onAllow, onSettings, onRestart, onSay, t }: {
  permission: MediaDuckPermission; access: MediaDuckAccess; asking: boolean; inCall: boolean; restarting: boolean; refused: MessageKey | null;
  onAllow: (() => void) | null; onSettings: (() => void) | null; onRestart: (() => void) | null; onSay(text: string): void; t: Translate;
}) {
  const Icon = ICON[permission];
  const control = useRef<HTMLSpanElement>(null);
  const why: MessageKey = access === "denied" ? `perm.${permission}.denied`
    : access === "restart" ? (inCall || refused === "perm.capture.restartInCall" ? "perm.capture.restartInCall" : "perm.capture.restart")
    : permission === "automation" && access === "unknown" ? "perm.automation.openApp" : `perm.${permission}.why`;
  // Allow pressed: once answered, focus moves to what replaced the button (the Allowed badge, Open System Settings, or the
  // row's control itself), never to the page; and the live region says the answer.
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current || access === "undetermined") return;
    pressed.current = false;
    const target = control.current?.querySelector<HTMLElement>("button, [tabindex]") ?? control.current;
    target?.focus();
    onSay(t(access === "granted" ? `perm.${permission}.allowedNow` : access === "restart" ? "perm.capture.restart" : why));
  }, [access]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownWhy = refused === "perm.capture.restartFailed" ? refused : why;
  return <Row className="perm-settings-row perm-step-row" label={<span className="perm-label"><span className="perm-plain-icon" aria-hidden><Icon size={18} /></span>{t(`perm.${permission}.label`)}</span>}
    description={t(shownWhy)}>
    <span ref={control} tabIndex={-1} className="perm-settings-control">
      {access === "granted"
        ? <span tabIndex={-1} className="perm-badge-focus"><Badge tone="positive" className="perm-badge"><CheckIcon size={12} />{t("wizard.mic.state.granted")}</Badge></span>
        : access === "restart"
          // Allowed, and only a new process sees it: Restart now (a call is never dropped for it: the button waits, and says
          // so). An app that cannot restart itself: its own page, where the person can see the permission, and the line.
          ? onRestart
            ? <RestartButton restarting={restarting} inCall={inCall} onClick={onRestart} t={t} />
            : onSettings ? <Button size="sm" variant="secondary" onClick={onSettings}>{t("perm.openSettings")}</Button> : null
        : access === "undetermined" && onAllow
          ? <AllowButton asking={asking} onClick={() => { pressed.current = true; onAllow(); }} t={t} />
          // Refused, or (System Audio Recording) not readable: the system's own page. Music and Spotify, neither open: the
          // line says to open one, as the system can only ask about an app that is open.
          : (access === "denied" || permission === "capture") && onSettings
            ? <Button size="sm" variant="secondary" onClick={onSettings}>{t("perm.openSettings")}</Button>
            : null}
    </span>
  </Row>;
}

/** The permissions the app's media handling needs on this system, one row each in the list of permissions (macOS: System
 *  Audio Recording, and controlling Music and Spotify): nothing where the app reports none, or does not offer it. Allow
 *  is the person's own request, so the system may ask then; nothing here asks by itself. `onSay`: what an Allow came to,
 *  for the list's live region. */
export function MediaPermissionRows({ t, onSay }: { t: Translate; onSay(text: string): void }) {
  const { bridge, status, run } = useMediaDuck();
  const { inCall, asking, allow, restart, restarting, refused } = useMediaActions(bridge, run, t, onSay);
  if (!bridge || !status) return null;
  const rows = ([["capture", status.capture], ["automation", status.access]] as const)
    .filter((row): row is readonly [MediaDuckPermission, MediaDuckAccess] => row[1] !== undefined);
  return <>{rows.map(([permission, access]) =>
    <MediaPermissionRow key={permission} permission={permission} access={access} asking={!!asking[permission]} inCall={inCall} t={t} onSay={onSay}
      restarting={restarting} refused={permission === "capture" ? refused : null}
      onRestart={permission === "capture" ? restart : null}
      onAllow={allow ? () => allow(permission) : null}
      onSettings={bridge.openSettings ? () => { void bridge.openSettings!(permission).catch(() => undefined); } : null} />)}</>;
}
