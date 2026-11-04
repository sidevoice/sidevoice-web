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

/** `host().mediaDuck`'s status, read as the screen shows and again whenever the person comes back to this window: they may
 *  have answered the system's question, or opened Music, in between. Only the answer to the latest request is kept (one
 *  that comes late, after the system's question took a while, is not). `run` sends a request; `pending` counts the ones in
 *  flight. Null status where the app does not offer it (a browser), and until the first answer. */
export function useMediaDuck() {
  const bridge = host().mediaDuck;
  const [status, setStatus] = useState<MediaDuckStatus | null>(null);
  const [pending, setPending] = useState(0);
  const latest = useRef(0);
  useEffect(() => {
    if (!bridge) return;
    let gone = false;
    const read = () => {
      const id = ++latest.current;
      void bridge.get().then((value) => { if (!gone && id === latest.current) setStatus(value); }).catch(() => undefined);
    };
    const visible = () => { if (document.visibilityState === "visible") read(); };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", visible);
    return () => { gone = true; window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", visible); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  /** Sends `request`; its answer is shown if no later request was made, `failed` (if given) when it fails. */
  const run = (request: () => Promise<MediaDuckStatus>, failed?: MediaDuckStatus) => {
    const id = ++latest.current;
    setPending((n) => n + 1);
    void request()
      .then((value) => { if (id === latest.current) setStatus(value); }, () => { if (failed && id === latest.current) setStatus(failed); })
      .finally(() => setPending((n) => n - 1));
  };
  return { bridge, status, setStatus, pending, run };
}

/** Whether a permission is missing in a way the person can change: not asked yet, or refused. */
export function missing(access: MediaDuckAccess | undefined) {
  return access === "undetermined" || access === "denied";
}

const ICON: Record<MediaDuckPermission, typeof SpeakerIcon> = { capture: SpeakerIcon, automation: PauseIcon };

function MediaPermissionRow({ permission, access, asking, onAllow, onSettings, t }: {
  permission: MediaDuckPermission; access: MediaDuckAccess; asking: boolean; onAllow: (() => void) | null; onSettings: (() => void) | null; t: Translate;
}) {
  const Icon = ICON[permission];
  const badge = useRef<HTMLSpanElement>(null);
  // Allow pressed: once allowed, focus moves to the badge that replaces the button, never to the page.
  const pressed = useRef(false);
  useEffect(() => {
    if (access === "granted" && pressed.current) badge.current?.focus();
    if (access !== "undetermined") pressed.current = false;
  }, [access]);
  const why: MessageKey = access === "denied" ? `perm.${permission}.denied`
    : permission === "automation" && access === "unknown" ? "perm.automation.openApp" : `perm.${permission}.why`;
  return <Row className="perm-settings-row perm-step-row" label={<span className="perm-label"><span className="perm-plain-icon" aria-hidden><Icon size={18} /></span>{t(`perm.${permission}.label`)}</span>}
    description={t(why)}>
    <span className="perm-settings-control">
      {access === "granted"
        ? <span ref={badge} tabIndex={-1} className="perm-badge-focus"><Badge tone="positive" className="perm-badge"><CheckIcon size={12} />{t("wizard.mic.state.granted")}</Badge></span>
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
 *  is the person's own request, so the system may ask then; nothing here asks by itself. */
export function MediaPermissionRows({ t }: { t: Translate }) {
  const { bridge, status, pending, run } = useMediaDuck();
  if (!bridge || !status) return null;
  const rows = ([["capture", status.capture], ["automation", status.access]] as const)
    .filter((row): row is readonly [MediaDuckPermission, MediaDuckAccess] => row[1] !== undefined);
  return <>{rows.map(([permission, access]) =>
    <MediaPermissionRow key={permission} permission={permission} access={access} asking={pending > 0} t={t}
      onAllow={bridge.allow ? () => run(() => bridge.allow!(permission)) : null}
      onSettings={bridge.openSettings ? () => { void bridge.openSettings!(permission).catch(() => undefined); } : null} />)}</>;
}
