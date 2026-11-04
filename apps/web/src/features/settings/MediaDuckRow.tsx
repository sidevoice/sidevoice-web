import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import type { MediaDuckMode } from "../../host";
import type { MessageKey, Translate } from "../../i18n/translator";
import { missing, useMediaDuck } from "../permissions/media-permissions";

/* What the desktop app does to other apps' media while the microphone is open or the agent is speaking in a call: lower it (the default), pause it,
 * or nothing. A row of Call, only where the app offers it (`host().mediaDuck`): a browser cannot touch other apps' media.
 * It never asks for a permission: one the choice needs and that is missing is said, with a link to Permissions, where it
 * is asked (operator, 2026-11-04). */
export function MediaDuckRow({ t, openPermissions }: { t: Translate; openPermissions(): void }) {
  const { bridge, status, setStatus, run } = useMediaDuck();
  if (!bridge || !status) return null;
  const choose = (mode: MediaDuckMode) => {
    const before = status;
    setStatus({ ...status, mode });
    void run(() => bridge.set(mode), before);
  };
  const { mode, lower, pause, access, capture } = status;
  // Going through Music and Spotify needs the permission to control them (macOS Automation).
  const throughNamed = (mode === "lower" && lower === "some-apps") || (mode === "pause" && pause === "some-apps");
  // What to say first: a permission the choice needs (lowering any app, then controlling the named apps), then how far the
  // system goes.
  const hint: MessageKey =
    mode === "lower" && missing(capture) ? "settings.call.mediaHint.needsCapture"
    : throughNamed && missing(access) ? "settings.call.mediaHint.needsAccess"
    : mode === "lower" && lower === "some-apps" ? "settings.call.mediaHint.lowerSomeApps"
    : mode === "lower" && lower === "none" && pause !== "none" ? "settings.call.mediaHint.lowerNone"
    : mode === "pause" && pause === "some-apps" ? "settings.call.mediaHint.someApps"
    : "settings.call.mediaHint";
  const needsPermission = hint === "settings.call.mediaHint.needsCapture" || hint === "settings.call.mediaHint.needsAccess";
  return <Group><Row label={t("settings.call.media")} description={t(hint)}>
    <Segmented size="sm" label={t("settings.call.media")} value={mode} onChange={choose} items={[
      { value: "lower", label: t("settings.call.media.lower"), disabled: lower === "none" },
      { value: "pause", label: t("settings.call.media.pause"), disabled: pause === "none" },
      { value: "off", label: t("settings.call.media.off") },
    ]} />
    {needsPermission && <Button type="button" variant="secondary" size="sm" onClick={openPermissions}>{t("settings.call.openPermissions")}</Button>}
  </Row></Group>;
}
