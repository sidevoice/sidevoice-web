import { useEffect, useState, type KeyboardEvent } from "react";
import { Button } from "../../components/ui/Button";
import { Group, Row, Section } from "../../components/ui/Card";
import { muteShortcutBridge, type MuteShortcut } from "../../services/desktop-host";
import { useMedia } from "../../state/call-layout";
import type { Translate } from "../../i18n/translator";
import { Keys, ShortcutKeys } from "../../components/ui/Keycaps";
import { SHORTCUTS } from "../../state/shortcuts";
import type { MessageKey } from "../../i18n/translator";

/* Shortcuts, a Settings section of their own (web#137, 2026-10-15): the keys for the microphone, by where they work.
 * In the desktop app, its global shortcut that mutes the microphone from anywhere on the computer, recorded by pressing
 * it; then, wherever there is a keyboard, the keys the room itself answers while Sidevoice is in front
 * (room-session-controller.js), listed so they can be found: they are fixed, there is nothing to set. A phone has
 * neither, and no section. */

/** A mouse or a trackpad, where a keyboard is all but certain; a phone, or a tablet on its own, has neither, and no key
 *  here would reach the room there. */
export const KEYBOARD_QUERY = "(any-pointer: fine)";

/** Whether Shortcuts shows: in the desktop app where it offers the mute shortcut, or wherever a keyboard is likely. */
export function useShortcutsSection() {
  const keyboard = useMedia(KEYBOARD_QUERY);
  return keyboard || muteShortcutBridge() !== null;
}

export function ShortcutsSettings({ t }: { t: Translate }) {
  const global = muteShortcutBridge() !== null;
  return <Section id="shortcuts" title={t("settings.section.shortcuts")} description={t("settings.shortcuts.description")}>
    {global && <Group title={t("settings.shortcuts.global")}><MuteShortcutRow t={t} /></Group>}
    <PageShortcuts t={t} />
  </Section>;
}

/** The keys the room answers while it is in front and nothing is being typed, one row each, from the shortcuts table
 *  (state/shortcuts.ts) that the key handler and the buttons' tooltips read too: each system's own keys are shown. Read
 *  only: the runtime owns them. */
function PageShortcuts({ t }: { t: Translate }) {
  return <Group title={t("settings.shortcuts.inApp")}>
    {SHORTCUTS.map((entry) => <Row key={entry.id} label={t(entry.label as MessageKey)} description={entry.id === "holdToTalk" ? t("settings.shortcuts.holdToTalkHint") : undefined}>
      <ShortcutKeys id={entry.id} t={t} />
    </Row>)}
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

/** The desktop app's global mute shortcut: the keys as they read, Change (recording the next combination) and Clear; a
 *  shortcut another app has, with others to pick; a clash with VoiceOver said under it. */
function MuteShortcutRow({ t }: { t: Translate }) {
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
        <Keys combo={recording ? t("settings.desktop.pressKeys") : shown || t("settings.desktop.shortcutNone")} state={now?.state} />
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
