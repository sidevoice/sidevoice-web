import { useEffect, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { Switch } from "../../components/ui/Switch";
import { callControlsBridge, muteShortcutBridge, type MuteShortcut } from "../../services/desktop-host";
import { hostTranslator, type HostTranslate } from "./host-i18n";

/* The desktop app's own call settings, in Settings › Call, inside the app only and each where the app offers it: the
 * global shortcut that mutes the microphone (recorded by pressing it), and whether the call controls — the floating
 * card — show always, or only while the app is minimised. */
export function DesktopCallSettings({ t }: { t: HostTranslate }) {
  const shortcut = muteShortcutBridge();
  const controls = callControlsBridge();
  if (!shortcut && !controls) return null;
  return <Group title={t("settings.desktop.title")}>
    {shortcut && <MuteShortcutRow t={t} />}
    {controls && <AlwaysShownRow t={t} />}
  </Group>;
}

/** A key pressed, as an accelerator ("Cmd+Shift+M"): at least one modifier and one key that is not a modifier. */
export function acceleratorOf(event: Pick<KeyboardEvent, "key" | "metaKey" | "ctrlKey" | "altKey" | "shiftKey">): string | null {
  const key = event.key;
  if (["Meta", "Control", "Alt", "Shift", "Escape", "Tab"].includes(key)) return null;
  const modifiers = [event.metaKey && "Cmd", event.ctrlKey && "Ctrl", event.altKey && "Alt", event.shiftKey && "Shift"].filter(Boolean) as string[];
  if (!modifiers.length) return null;
  const name = key === " " ? "Space" : key.length === 1 ? key.toUpperCase() : key;
  return [...modifiers, name].join("+");
}

function MuteShortcutRow({ t }: { t: HostTranslate }) {
  const bridge = muteShortcutBridge()!;
  const [now, setNow] = useState<MuteShortcut | null>(null);
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let gone = false;
    void bridge.get().then((value) => { if (!gone) setNow(value); }).catch(() => {});
    const stop = bridge.subscribe?.((value) => setNow(value));
    return () => { gone = true; stop?.(); };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  async function set(accelerator: string | null) {
    setError("");
    try { setNow(await bridge.set(accelerator)); }
    catch (failure) { setError((failure as { key?: string } | null)?.key === "shortcut_invalid" ? t("settings.desktop.shortcutInvalid") : t("settings.desktop.shortcutFailed")); }
  }
  // Recording: the next combination pressed is the shortcut; Escape stops without changing it.
  const record = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === "Escape") { setRecording(false); return; }
    const accelerator = acceleratorOf(event);
    if (!accelerator) return;
    setRecording(false);
    void set(accelerator);
  };
  const shown = now?.label || now?.accelerator;
  return <Row label={t("settings.desktop.muteShortcut")} block>
    <div className="desktop-shortcut">
      <div className="desktop-shortcut-line">
        <kbd className="desktop-shortcut-keys" data-state={now?.state}>{recording ? t("settings.desktop.pressKeys") : shown || t("settings.desktop.shortcutNone")}</kbd>
        <Button size="sm" variant={recording ? "primary" : "secondary"} aria-pressed={recording} onKeyDown={record} onBlur={() => setRecording(false)}
          onClick={() => setRecording(!recording)}>{recording ? t("settings.desktop.recording") : t("settings.desktop.change")}</Button>
        {now?.accelerator && !recording && <Button size="sm" variant="ghost" tone="neutral" onClick={() => void set(null)}>{t("settings.desktop.clear")}</Button>}
      </div>
      <p className="muted">{t("settings.desktop.muteShortcutHint")}</p>
      {now?.state === "refused" && <div className="desktop-shortcut-refused" role="alert">
        <p>{t("settings.desktop.shortcutRefused")}</p>
        {now.alternatives.length > 0 && <div className="desktop-shortcut-alternatives" role="group" aria-label={t("settings.desktop.alternatives")}>
          {now.alternatives.map((accelerator) => <Button key={accelerator} size="sm" variant="secondary" onClick={() => void set(accelerator)}>{accelerator}</Button>)}
        </div>}
      </div>}
      {now?.voiceOver && <p className="desktop-shortcut-note">{t("settings.desktop.voiceOverClash")}</p>}
      {error && <p className="desktop-shortcut-error" role="alert">{error}</p>}
    </div>
  </Row>;
}

function AlwaysShownRow({ t }: { t: HostTranslate }) {
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
    void bridge.setAlwaysShown(next).then((value) => setOn(value.alwaysShown)).catch(() => { setOn(!next); setFailed(true); });
  };
  return <Row label={t("settings.desktop.alwaysShown")} description={failed ? undefined : t("settings.desktop.alwaysShownHint")}>
    <Switch checked={on} aria-label={t("settings.desktop.alwaysShown")} onChange={change} />
    {failed && <span className="desktop-shortcut-error" role="alert">{t("settings.desktop.changeFailed")}</span>}
  </Row>;
}
