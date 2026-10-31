import { useEffect, useState } from "react";
import { Row } from "../../components/ui/Card";
import { Switch } from "../../components/ui/Switch";
import { host } from "../../host";
import type { Translate } from "../../i18n/translator";

/* The desktop app's own call setting, a row among Call's others, inside the app only and where the app offers it:
 * whether the call controls — the floating card — show always, or only while the app is minimised. Its global mute
 * shortcut is in Shortcuts (ShortcutsSettings.tsx). */
export function DesktopCallSettings({ t, disabled = false, onChange }: { t: Translate; disabled?: boolean; onChange?(on: boolean): void }) {
  if (!host().callControls) return null;
  return <AlwaysShownRow t={t} disabled={disabled} onChange={onChange} />;
}

function AlwaysShownRow({ t, disabled, onChange }: { t: Translate; disabled: boolean; onChange?(on: boolean): void }) {
  const bridge = host().callControls!;
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let gone = false;
    void bridge.settings().then((value) => { if (!gone) setOn(value.alwaysShown); }).catch(() => { if (!gone) setOn(false); });
    return () => { gone = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  if (on === null) return null;
  const change = (next: boolean) => {
    setOn(next); setFailed(false); onChange?.(next);
    // Turning it off first lets the card stay up as a preview: the change itself would take it off the screen (the room is in
    // front) until the preview came back a moment later. The preview after the change shows the card in its new state.
    if (!next) bridge.preview?.();
    void bridge.setAlwaysShown(next).then((value) => { setOn(value.alwaysShown); onChange?.(value.alwaysShown); bridge.preview?.(); }).catch(() => { setOn(!next); onChange?.(!next); setFailed(true); });
  };
  return <Row label={t("settings.desktop.alwaysShown")} description={failed ? undefined : t("settings.desktop.alwaysShownHint")}>
    <Switch checked={on} disabled={disabled} aria-label={t("settings.desktop.alwaysShown")} onChange={change} />
    {failed && <span className="desktop-shortcut-error" role="alert">{t("settings.desktop.changeFailed")}</span>}
  </Row>;
}
