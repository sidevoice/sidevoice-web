import { Button } from "../../components/ui/Button";
import { RefreshIcon, WarningIcon } from "../../components/ui/Icons";
import { Group, Row } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import type { MediaDuckLevel, MediaDuckMode, MediaDuckStatus } from "../../host";
import type { MessageKey, Translate } from "../../i18n/translator";
import { AllowButton, neededPermission, RestartButton, useMediaActions, useMediaDuck } from "../permissions/media-permissions";

/** How far Lower goes, in the order the row lists them (operator, 2026-11-05: 50 %, 25 % the default, silent). */
const LEVELS: MediaDuckLevel[] = ["half", "quarter", "mute"];

/* What the desktop app does to other apps' media while the microphone is open or the agent is speaking in a call: lower it (the default), pause it,
 * or nothing; and, for Lower, how far. A row of Call, only where the app offers it (`host().mediaDuck`): a browser cannot touch other apps' media.
 * Under the row, a note says a permission the choice needs and that is missing, with what the person can do about it right
 * there for System Audio Recording (Allow, or Restart now once it is allowed and only a restart applies it), and a link to
 * Permissions otherwise (operator, 2026-11-05). Nothing asks by itself: Allow is the person's own press. */
export function MediaDuckRow({ t, openPermissions }: { t: Translate; openPermissions(): void }) {
  const { bridge, status, setStatus, run } = useMediaDuck();
  const { inCall, asking, allow, restart, restarting } = useMediaActions(bridge, run, t);
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
  // What to say about how the system goes, as the row would say it if nothing were missing (what is missing is the note's).
  const hint: MessageKey =
    needed !== null ? "settings.call.mediaHint"
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
  </Row>
  {needed && <MediaNeed t={t} needed={needed} capture={status.capture} inCall={inCall} asking={!!asking.capture} restarting={restarting}
    onAllow={allow ? () => allow("capture") : null} onRestart={restart} openPermissions={openPermissions} />}
  {levelShown && <Row label={t("settings.call.media.level")} description={t("settings.call.media.levelHint")}>
    <Segmented size="sm" label={t("settings.call.media.level")} value={level} onChange={chooseLevel}
      items={LEVELS.map((value) => ({ value, label: t(`settings.call.media.level.${value}`) }))} />
  </Row>}
  </Group>;
}

/** The note under the row: what the choice lacks, and what to do (amber), or, once System Audio Recording is allowed and only a
 *  restart applies it, Restart now (accent). */
function MediaNeed({ t, needed, capture, inCall, asking, restarting, onAllow, onRestart, openPermissions }: {
  t: Translate; needed: "capture" | "automation"; capture: MediaDuckStatus["capture"]; inCall: boolean; asking: boolean; restarting: boolean;
  onAllow: (() => void) | null; onRestart: (() => void) | null; openPermissions(): void;
}) {
  const waiting = needed === "capture" && capture === "restart";
  const text: MessageKey = waiting ? (inCall ? "settings.call.mediaNeed.restartInCall" : "settings.call.mediaNeed.restart")
    : needed === "capture" ? "settings.call.mediaNeed.capture" : "settings.call.mediaNeed.automation";
  const link = <Button type="button" variant="ghost" size="sm" onClick={openPermissions}>{t("settings.call.openPermissionsLink")}</Button>;
  return <div className="media-need" data-kind={waiting ? "restart" : "missing"}>
    <span className="media-need-icon" aria-hidden>{waiting ? <RefreshIcon size={18} /> : <WarningIcon size={18} />}</span>
    <p className="media-need-text">{t(text)}</p>
    <span className="media-need-action">
      {waiting ? (onRestart ? <RestartButton restarting={restarting} inCall={inCall} onClick={onRestart} t={t} /> : link)
        : needed === "capture" && capture === "undetermined" && onAllow ? <AllowButton asking={asking} onClick={onAllow} t={t} />
        : link}
    </span>
  </div>;
}
