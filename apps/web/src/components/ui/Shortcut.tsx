import { useEffect, useRef, useState } from "react";
import { useT } from "../../i18n";
import { Button } from "./Button";

/* A keyboard shortcut shown as what it is — one key cap per key, in the platform's own words (operator, 2026-10-02):
 * ⌘ ⇧ ⌥ ⌃ on a Mac; Ctrl, Shift, Alt, Win (Super on Linux) elsewhere. The value is an Electron/Tauri-style accelerator
 * («CmdOrCtrl+Shift+M»), which is what the app stores; nobody has to type that format: the field records the keys. */

export type KeyPlatform = "mac" | "windows" | "linux";

export function keyPlatform(platform?: string | null): KeyPlatform {
  const p = (platform ?? (typeof navigator !== "undefined" ? navigator.platform : "")).toLowerCase();
  return p.startsWith("mac") ? "mac" : p.startsWith("win") ? "windows" : "linux";
}

const MAC: Record<string, string> = { cmdorctrl: "⌘", cmd: "⌘", command: "⌘", super: "⌘", meta: "⌘", ctrl: "⌃", control: "⌃", alt: "⌥", option: "⌥", shift: "⇧" };
const PC: Record<string, string> = { cmdorctrl: "Ctrl", ctrl: "Ctrl", control: "Ctrl", alt: "Alt", option: "Alt", shift: "Shift" };

/** The key caps an accelerator is pressed with, in order. */
export function keyCaps(accelerator: string, platform: KeyPlatform, space: string): string[] {
  return accelerator.split("+").filter(Boolean).map((part) => {
    const key = part.toLowerCase();
    if (key === "space") return space;
    if (platform === "mac") return MAC[key] ?? part.toUpperCase();
    if (key === "super" || key === "cmd" || key === "command" || key === "meta") return platform === "windows" ? "Win" : "Super";
    return PC[key] ?? part.toUpperCase();
  });
}

export function Keys({ accelerator, platform }: { accelerator: string; platform: KeyPlatform }) {
  const t = useT();
  const caps = keyCaps(accelerator, platform, t("keys.space"));
  return <span className="keys" aria-label={caps.join(" + ")}>{caps.map((cap, i) => <kbd key={i} data-mod={cap.length === 1 && /[⌘⇧⌥⌃]/.test(cap) || undefined}>{cap}</kbd>)}</span>;
}

/** The accelerator a key press names, or null while only modifiers are down (or nothing usable is). */
function fromEvent(event: KeyboardEvent, platform: KeyPlatform): string | null {
  const code = event.code;
  const key = /^Key[A-Z]$/.test(code) ? code.slice(3) : /^Digit\d$/.test(code) ? code.slice(5) : /^F\d{1,2}$/.test(code) ? code : code === "Space" ? "Space" : null;
  if (!key) return null;
  const mods: string[] = [];
  if (platform === "mac" ? event.metaKey : event.ctrlKey) mods.push("CmdOrCtrl");
  if (platform === "mac" && event.ctrlKey) mods.push("Ctrl");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (platform !== "mac" && event.metaKey) mods.push("Super");
  // A global shortcut needs a modifier, except a function key.
  if (!mods.length && !/^F\d/.test(key)) return null;
  return [...mods, key].join("+");
}

/** The shortcut and how to change it: «Cambiar» listens for the next combination (Esc leaves it as it was),
 *  «Quitar» turns it off. `onChange` is called with the new accelerator ("" for none). */
export function ShortcutField({ value, platform, onChange, label }: { value: string; platform: KeyPlatform; onChange: (accelerator: string) => void; label: string }) {
  const t = useT();
  const [recording, setRecording] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!recording) return;
    box.current?.focus();
    const down = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") { setRecording(false); return; }
      const accelerator = fromEvent(event, platform);
      if (accelerator) { setRecording(false); onChange(accelerator); }
    };
    window.addEventListener("keydown", down, true);
    return () => window.removeEventListener("keydown", down, true);
  }, [recording, platform, onChange]);
  return (
    <div className="shortcut-field" data-recording={recording || undefined}>
      <div ref={box} className="shortcut-value" tabIndex={-1} role="group" aria-label={label} aria-live="polite">
        {recording ? <span className="muted">{t("keys.recording")}</span> : value ? <Keys accelerator={value} platform={platform} /> : <span className="muted">{t("keys.none")}</span>}
      </div>
      {recording
        ? <Button variant="ghost" size="compact" onClick={() => setRecording(false)}>{t("common.cancel")}</Button>
        : <>
          <Button size="compact" onClick={() => setRecording(true)}>{t("keys.change")}</Button>
          {value && <Button variant="ghost" size="compact" onClick={() => onChange("")}>{t("keys.remove")}</Button>}
        </>}
    </div>
  );
}
