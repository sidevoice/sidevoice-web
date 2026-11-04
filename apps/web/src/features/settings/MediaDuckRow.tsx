import { useEffect, useState } from "react";
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
  const hint = status.mode === "lower" && status.lower === "system" ? t("settings.call.mediaHint.system")
    : status.mode === "pause" && status.access === "denied" ? t("settings.call.mediaHint.denied")
    : status.mode === "pause" && status.pause === "some-apps" ? t("settings.call.mediaHint.someApps")
    : t("settings.call.mediaHint");
  return <Group><Row label={t("settings.call.media")} description={hint}>
    <Segmented size="sm" label={t("settings.call.media")} value={status.mode} onChange={choose} items={[
      { value: "lower", label: t("settings.call.media.lower"), disabled: status.lower === "none" },
      { value: "pause", label: t("settings.call.media.pause"), disabled: status.pause === "none" },
      { value: "off", label: t("settings.call.media.off") },
    ]} />
  </Row></Group>;
}
