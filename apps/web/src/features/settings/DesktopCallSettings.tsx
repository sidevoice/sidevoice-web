import { useEffect, useState } from "react";
import { Row } from "../../components/ui/Card";
import { Switch } from "../../components/ui/Switch";
import { callControlsBridge } from "../../services/desktop-host";
import type { Translate } from "../../i18n/translator";

/* The desktop app's own call setting, a row among Call's others, inside the app only and where the app offers it:
 * whether the call controls — the floating card — show always, or only while the app is minimised. Its global mute
 * shortcut is in Shortcuts (ShortcutsSettings.tsx). */
export function DesktopCallSettings({ t }: { t: Translate }) {
  if (!callControlsBridge()) return null;
  return <AlwaysShownRow t={t} />;
}

function AlwaysShownRow({ t }: { t: Translate }) {
  const bridge = callControlsBridge()!;
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    void bridge.settings().then((value) => { if (!gone) setOn(value.alwaysShown); }).catch(() => { if (!gone) setOn(false); });
    return () => { gone = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (on === null) return null;
  const change = (next: boolean) => {
    setOn(next); setFailed(false);
    void bridge.setAlwaysShown(next).then((value) => { setOn(value.alwaysShown); bridge.preview?.(); }).catch(() => { setOn(!next); setFailed(true); });
  };
  return <Row label={t("settings.desktop.alwaysShown")} description={failed ? undefined : t("settings.desktop.alwaysShownHint")}>
    <Switch checked={on} aria-label={t("settings.desktop.alwaysShown")} onChange={change} />
    {failed && <span className="desktop-shortcut-error" role="alert">{t("settings.desktop.changeFailed")}</span>}
  </Row>;
}
