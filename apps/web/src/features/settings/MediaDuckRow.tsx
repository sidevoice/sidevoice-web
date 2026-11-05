import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import type { MediaDuckLevel, MediaDuckMode } from "../../host";
import type { MessageKey, Translate } from "../../i18n/translator";
import { neededPermission, useMediaDuck } from "../permissions/media-permissions";

/** How far Lower goes, in the order the row lists them (operator, 2026-11-05: 50 %, 25 % the default, silent). */
const LEVELS: MediaDuckLevel[] = ["half", "quarter", "mute"];

/* What the desktop app does to other apps' media while the microphone is open or the agent is speaking in a call: lower it (the default), pause it,
 * or nothing; and, for Lower, how far. A row of Call, only where the app offers it (`host().mediaDuck`): a browser cannot touch other apps' media.
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
  const setLevel = bridge.setLevel?.bind(bridge);
  const chooseLevel = (level: MediaDuckLevel) => {
    if (!setLevel) return;
    const before = status;
    setStatus({ ...status, level });
    void run(() => setLevel(level), before);
  };
  const { mode, level, lower, pause } = status;
  const needed = neededPermission(status);
  // What to say first: a permission the choice needs (lowering any app, then controlling the named apps), then how far the
  // system goes.
  const hint: MessageKey =
    needed === "capture" && status.capture === "restart" ? "settings.call.mediaHint.restartCapture"
    : needed === "capture" ? "settings.call.mediaHint.needsCapture"
    : needed === "automation" ? "settings.call.mediaHint.needsAccess"
    : mode === "lower" && lower === "some-apps" ? "settings.call.mediaHint.lowerSomeApps"
    : mode === "lower" && lower === "none" && pause !== "none" ? "settings.call.mediaHint.lowerNone"
    : mode === "pause" && pause === "some-apps" ? "settings.call.mediaHint.someApps"
    : mode === "pause" && pause === "media-controls" ? "settings.call.mediaHint.pauseMediaControls"
    : "settings.call.mediaHint";
  // How far to lower: for Lower only, where the app takes a level and can lower at all.
  const levelShown = mode === "lower" && lower !== "none" && level !== undefined && !!setLevel;
  return <Group><Row label={t("settings.call.media")} description={t(hint)}>
    <Segmented size="sm" label={t("settings.call.media")} value={mode} onChange={choose} items={[
      { value: "lower", label: t("settings.call.media.lower"), disabled: lower === "none" },
      { value: "pause", label: t("settings.call.media.pause"), disabled: pause === "none" },
      { value: "off", label: t("settings.call.media.off") },
    ]} />
    {needed && <Button type="button" variant="secondary" size="sm" onClick={openPermissions}>{t("settings.call.openPermissions")}</Button>}
  </Row>
  {levelShown && <Row label={t("settings.call.media.level")} description={t("settings.call.media.levelHint")}>
    <Segmented size="sm" label={t("settings.call.media.level")} value={level} onChange={chooseLevel}
      items={LEVELS.map((value) => ({ value, label: t(`settings.call.media.level.${value}`) }))} />
  </Row>}
  </Group>;
}
