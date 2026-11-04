import { useEffect, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { host, type MediaDuckMode, type MediaDuckStatus } from "../../host";
import type { Translate } from "../../i18n/translator";

/* What the desktop app does to other apps' media while the microphone is open in a call: lower it (the default), pause it,
 * or nothing. A row of Call, only where the app offers it (`host().mediaDuck`): a browser cannot touch other apps' media. */
export function MediaDuckRow({ t }: { t: Translate }) {
  const bridge = host().mediaDuck;
  const [status, setStatus] = useState<MediaDuckStatus | null>(null);
  useEffect(() => {
    let gone = false;
    void bridge?.get().then((value) => { if (!gone) setStatus(value); }).catch(() => undefined);
    return () => { gone = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bridge || !status) return null;
  const choose = (mode: MediaDuckMode) => {
    const before = status;
    setStatus({ ...status, mode });
    void bridge.set(mode).then(setStatus).catch(() => setStatus(before));
  };
  // Seeing that Music or Spotify play, and pausing them, needs the system's permission to control them (macOS).
  const needsAccess = status.mode !== "off" && status.access !== "granted" && (status.lower === "system" || status.pause === "some-apps");
  const hint = needsAccess ? t(status.access === "denied" ? "settings.call.mediaHint.denied" : "settings.call.mediaHint.needsAccess")
    : status.mode === "lower" && status.lower === "system" ? t("settings.call.mediaHint.system")
    : status.mode === "pause" && status.pause === "some-apps" ? t("settings.call.mediaHint.someApps")
    : t("settings.call.mediaHint");
  return <Group><Row label={t("settings.call.media")} description={hint}>
    <Segmented size="sm" label={t("settings.call.media")} value={status.mode} onChange={choose} items={[
      { value: "lower", label: t("settings.call.media.lower"), disabled: status.lower === "none" },
      { value: "pause", label: t("settings.call.media.pause"), disabled: status.pause === "none" },
      { value: "off", label: t("settings.call.media.off") },
    ]} />
    {needsAccess && status.access === "undetermined" && bridge.allow &&
      <Button variant="secondary" size="sm" onClick={() => { void bridge.allow!().then(setStatus).catch(() => undefined); }}>{t("settings.call.media.allow")}</Button>}
  </Row></Group>;
}
