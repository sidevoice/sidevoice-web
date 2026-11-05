import { useEffect, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Row } from "../../components/ui/Card";
import { CheckIcon, PauseIcon, SpeakerIcon } from "../../components/ui/Icons";
import { host, type MediaDuckAccess, type MediaDuckPermission, type MediaDuckStatus } from "../../host";
import type { MessageKey, Translate } from "../../i18n/translator";

/* What the app does to other apps' media in a call (sidevoice-desktop `host.mediaDuck`) as the screens that show it read it:
 * Settings › Call's row, and the permissions it needs in the list of permissions (operator, 2026-11-04: asked in the
 * setup and listed in Settings › Permissions; the Call row only links there). */

/** What every screen showing the status is told, so they all show the same one. */
const shown = new Set<(value: MediaDuckStatus) => void>();

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
  const latest = useRef<Record<string, number>>({});
  const next = (lane: string) => (latest.current[lane] = (latest.current[lane] ?? 0) + 1);
  const [unread, setUnread] = useState(false);
  useEffect(() => {
    if (!bridge) return;
    let gone = false;
    const read = () => {
      const id = next("status");
      void bridge.get().then((value) => { if (!gone && id === latest.current.status) setStatus(value); }, () => { if (!gone) setUnread(true); });
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
    return request().then((value) => { if (id === latest.current[lane]) setStatus(value); }, () => { if (failed && id === latest.current[lane]) setStatus(failed); });
  };
  return { bridge, status, setStatus, run, known: !bridge || status !== null || unread };
}

/** Whether a permission is missing in a way the person can change: not asked yet, or refused. */
export function missing(access: MediaDuckAccess | undefined) {
  return access === "undetermined" || access === "denied";
}

/** The permission the current choice needs and lacks, if any (`unknown` is not taken for missing): lowering any app
 *  (System Audio Recording) for Lower, else controlling Music and Spotify where the choice goes through them (Pause on a
 *  Mac, or Lower without System Audio Recording). */
export function neededPermission(status: MediaDuckStatus | null): MediaDuckPermission | null {
  if (!status) return null;
  const { mode, lower, pause, access, capture } = status;
  const throughNamed = (mode === "lower" && lower === "some-apps") || (mode === "pause" && pause === "some-apps");
  return mode === "lower" && missing(capture) ? "capture" : throughNamed && missing(access) ? "automation" : null;
}

/** Whether the app reports any permission its media handling needs here: then the list of permissions is shown for them,
 *  microphone or not (Settings › Permissions, the setup's permissions step). */
export function listsMediaPermissions(status: MediaDuckStatus | null) {
  return !!status && (status.capture !== undefined || status.access !== undefined);
}

const ICON: Record<MediaDuckPermission, typeof SpeakerIcon> = { capture: SpeakerIcon, automation: PauseIcon };

function MediaPermissionRow({ permission, access, asking, onAllow, onSettings, onSay, t }: {
  permission: MediaDuckPermission; access: MediaDuckAccess; asking: boolean; onAllow: (() => void) | null; onSettings: (() => void) | null;
  onSay(text: string): void; t: Translate;
}) {
  const Icon = ICON[permission];
  const control = useRef<HTMLSpanElement>(null);
  const why: MessageKey = access === "denied" ? `perm.${permission}.denied`
    : permission === "automation" && access === "unknown" ? "perm.automation.openApp" : `perm.${permission}.why`;
  // Allow pressed: once answered, focus moves to what replaced the button (the Allowed badge, Open System Settings, or the
  // row's control itself), never to the page; and the live region says the answer.
  const pressed = useRef(false);
  useEffect(() => {
    if (!pressed.current || access === "undetermined") return;
    pressed.current = false;
    const target = control.current?.querySelector<HTMLElement>("button, [tabindex]") ?? control.current;
    target?.focus();
    onSay(t(access === "granted" ? `perm.${permission}.allowedNow` : why));
  }, [access]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Row className="perm-settings-row perm-step-row" label={<span className="perm-label"><span className="perm-plain-icon" aria-hidden><Icon size={18} /></span>{t(`perm.${permission}.label`)}</span>}
    description={t(why)}>
    <span ref={control} tabIndex={-1} className="perm-settings-control">
      {access === "granted"
        ? <span tabIndex={-1} className="perm-badge-focus"><Badge tone="positive" className="perm-badge"><CheckIcon size={12} />{t("wizard.mic.state.granted")}</Badge></span>
        : access === "undetermined" && onAllow
          ? <Button size="sm" variant="primary" loading={asking} onClick={() => { pressed.current = true; onAllow(); }}>{t("perm.allow")}</Button>
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
  // Each row's own question in flight: one being asked does not hold the other.
  const [asking, setAsking] = useState<Partial<Record<MediaDuckPermission, boolean>>>({});
  if (!bridge || !status) return null;
  const rows = ([["capture", status.capture], ["automation", status.access]] as const)
    .filter((row): row is readonly [MediaDuckPermission, MediaDuckAccess] => row[1] !== undefined);
  const allow = (permission: MediaDuckPermission) => {
    setAsking((now) => ({ ...now, [permission]: true }));
    void run(() => bridge.allow!(permission), undefined, permission).finally(() => setAsking((now) => ({ ...now, [permission]: false })));
  };
  return <>{rows.map(([permission, access]) =>
    <MediaPermissionRow key={permission} permission={permission} access={access} asking={!!asking[permission]} t={t} onSay={onSay}
      onAllow={bridge.allow ? () => allow(permission) : null}
      onSettings={bridge.openSettings ? () => { void bridge.openSettings!(permission).catch(() => undefined); } : null} />)}</>;
}
