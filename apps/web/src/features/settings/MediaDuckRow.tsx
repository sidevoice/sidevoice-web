import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { host, type MediaDuckMode, type MediaDuckStatus } from "../../host";
import type { MessageKey, Translate } from "../../i18n/translator";

/* What the desktop app does to other apps' media while the microphone is open or the agent is speaking in a call: lower it (the default), pause it,
 * or nothing. A row of Call, only where the app offers it (`host().mediaDuck`): a browser cannot touch other apps' media. */
export function MediaDuckRow({ t }: { t: Translate }) {
  const bridge = host().mediaDuck;
  const [status, setStatus] = useState<MediaDuckStatus | null>(null);
  // Requests in flight that may make the system ask (set can, for Lower): Allow waits for them.
  const [asking, setAsking] = useState(0);
  // Only the answer to the latest request is shown: one that comes late (the system's question took a while) is not.
  const latest = useRef(0);
  const answer = (id: number) => (value: MediaDuckStatus) => { if (id === latest.current) setStatus(value); };
  // Read when the row shows, and again whenever the person comes back to this window: they may have answered the system's
  // question, or opened Music, in between.
  useEffect(() => {
    let gone = false;
    const read = () => {
      const id = ++latest.current;
      void bridge?.get().then((value) => { if (!gone) answer(id)(value); }).catch(() => undefined);
    };
    const visible = () => { if (document.visibilityState === "visible") read(); };
    read();
    window.addEventListener("focus", read);
    document.addEventListener("visibilitychange", visible);
    return () => { gone = true; window.removeEventListener("focus", read); document.removeEventListener("visibilitychange", visible); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (!bridge || !status) return null;
  const track = (request: (id: number) => Promise<unknown>) => {
    const id = ++latest.current;
    setAsking((n) => n + 1);
    void request(id).finally(() => setAsking((n) => n - 1));
  };
  const choose = (mode: MediaDuckMode) => {
    const before = status;
    setStatus({ ...status, mode });
    track((id) => bridge.set(mode).then(answer(id)).catch(() => answer(id)(before)));
  };
  const ask = () => track((id) => bridge.allow!().then(answer(id)).catch(() => undefined));
  const { mode, lower, pause, access, capture } = status;
  // Lowering any app by itself needs its own permission where the system has one (macOS System Audio Recording)...
  const needsCapture = mode !== "off" && capture !== undefined && capture !== "granted" && capture !== "unknown";
  // ...and going through Music and Spotify needs the permission to control them (macOS Automation).
  const throughNamed = (mode === "lower" && lower === "some-apps") || (mode === "pause" && pause === "some-apps");
  const needsAccess = throughNamed && access !== "granted";
  // What to say first: the question not asked yet, then what the named apps need to work at all, then what was refused.
  const [hint, action]: [MessageKey, "allow" | "settings" | null] =
    needsCapture && capture === "undetermined" ? ["settings.call.mediaHint.needsCapture", "allow"]
    : needsAccess && access === "denied" ? ["settings.call.mediaHint.denied", null]
    : needsAccess ? ["settings.call.mediaHint.needsAccess", access === "undetermined" ? "allow" : null]
    : needsCapture && capture === "denied" ? ["settings.call.mediaHint.captureDenied", "settings"]
    : mode === "lower" && lower === "some-apps" ? ["settings.call.mediaHint.lowerSomeApps", null]
    : mode === "lower" && lower === "none" && pause !== "none" ? ["settings.call.mediaHint.lowerNone", null]
    : mode === "pause" && pause === "some-apps" ? [capture === "granted" ? "settings.call.mediaHint.pauseOthersLowered" : "settings.call.mediaHint.someApps", null]
    : ["settings.call.mediaHint", null];
  return <Group><Row label={t("settings.call.media")} description={t(hint)}>
    <Segmented size="sm" label={t("settings.call.media")} value={mode} onChange={choose} items={[
      { value: "lower", label: t("settings.call.media.lower"), disabled: lower === "none" },
      { value: "pause", label: t("settings.call.media.pause"), disabled: pause === "none" },
      { value: "off", label: t("settings.call.media.off") },
    ]} />
    {action === "allow" && bridge.allow &&
      <Button variant="secondary" size="sm" disabled={asking > 0} onClick={ask}>{t("settings.call.media.allow")}</Button>}
    {action === "settings" && bridge.openSettings &&
      <Button variant="secondary" size="sm" onClick={() => { void bridge.openSettings!().catch(() => undefined); }}>{t("settings.call.media.openSettings")}</Button>}
  </Row></Group>;
}
