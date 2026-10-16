import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert } from "../../components/ui/Alert";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { CheckIcon, MicrophoneIcon, MicrophoneOffIcon } from "../../components/ui/Icons";
import { desktopHost } from "../../services/desktop-host";
import { createMicrophoneAccess, devicePlatform, type MicrophoneAccess, type MicrophoneSnapshot } from "../../services/microphone-access";
import type { MessageKey, Translate } from "../../i18n/translator";
import "./permissions.css";

/* What Sidevoice needs to be allowed on this device, as the setup's permissions step and Settings › Permissions both say
 * it (briefs/plans/permissions-screen.md). Today that is the microphone alone: the global mute shortcut is a Carbon hot
 * key and the headset's buttons the Now Playing commands, neither of which needs macOS's Accessibility; nothing pastes,
 * notifies or listens to keys system-wide. Each permission is one row — its name, why in one line, where it stands, and
 * what can be done — so another can join the list without a new screen. */

export type Platform = ReturnType<typeof devicePlatform>;

/** The microphone's row, read from where it stands. */
export interface MicrophoneView {
  /** As shown: checking again from blocked or none found keeps what it was (only the button says it is busy). */
  state: MicrophoneSnapshot["state"];
  busy: boolean;
  blocked: boolean;
  /** Its state in a word or two. */
  label: MessageKey;
  /** A line under it: who will ask, what to answer, what happened. */
  line: MessageKey | null;
  /** Blocked: how to allow it where this page runs, one or two lines. */
  howTo: MessageKey[];
}

/** How to allow a blocked microphone, where this page runs: the lines to show. */
function howToAllow(asker: MicrophoneSnapshot["asker"], inDesktopApp: boolean, platform: Platform): MessageKey[] {
  if (asker === "app") return ["wizard.mic.denied.app"];
  if (inDesktopApp) return [platform === "windows" ? "wizard.mic.denied.windows" : platform === "mac" ? "wizard.mic.denied.app" : "wizard.mic.denied.linux"];
  const system: MessageKey | null = platform === "mac" ? "wizard.mic.denied.siteMac" : platform === "windows" ? "wizard.mic.denied.siteWindows" : null;
  return system ? ["wizard.mic.denied.site", system] : ["wizard.mic.denied.site"];
}

export function microphoneView(microphone: MicrophoneSnapshot, platform: Platform = devicePlatform(), inDesktopApp = !!desktopHost()): MicrophoneView {
  const { asker, dismissed } = microphone;
  const state = microphone.state === "requesting" && (microphone.from === "denied" || microphone.from === "missing") ? microphone.from : microphone.state;
  const fromSystem = asker === "app";
  const label: MessageKey = state === "checking" ? "wizard.mic.checking" : state === "requesting" ? "wizard.mic.state.requesting"
    : state === "granted" ? "wizard.mic.state.granted" : state === "none" ? "perm.state.none" : state === "denied" ? "wizard.mic.state.denied"
      : state === "missing" ? "wizard.mic.state.missing" : "wizard.mic.state.prompt";
  const line: MessageKey | null = state === "prompt" ? (dismissed ? "wizard.mic.dismissed" : fromSystem ? "wizard.mic.askSystem" : "wizard.mic.askBrowser")
    : state === "requesting" ? (fromSystem ? "wizard.mic.requestingSystem" : "wizard.mic.requestingBrowser")
      : state === "granted" ? "wizard.mic.granted" : state === "missing" ? "wizard.mic.missing" : null;
  return { state, busy: microphone.state === "checking" || microphone.state === "requesting", blocked: state === "denied" || state === "missing",
    label, line, howTo: howToAllow(asker, inDesktopApp, platform) };
}

/** What a live region says of a state: its change, not the whole screen again. */
export function announcement(microphone: MicrophoneSnapshot, t: Translate) {
  const { state, asker, dismissed, unchanged } = microphone;
  if (state === "requesting") return t(asker === "app" ? "wizard.mic.requestingSystem" : "wizard.mic.requestingBrowser");
  if (state === "granted") return t("wizard.mic.allowedNow");
  if (state === "denied") return t(unchanged ? "wizard.mic.stillDenied" : "wizard.mic.denied.title");
  if (state === "missing") return t(unchanged ? "wizard.mic.stillMissing" : "wizard.mic.state.missing");
  if (state === "prompt" && dismissed) return t("wizard.mic.dismissed");
  return "";
}

/** The microphone's mark: crossed out once blocked or none found, a check on it once allowed. */
export function MicrophoneMark({ view, className = "perm-mark" }: { view: MicrophoneView; className?: string }) {
  return <span className={className} data-state={view.state} aria-hidden>
    {view.blocked ? <MicrophoneOffIcon size={20} /> : <MicrophoneIcon size={20} />}
    {view.state === "granted" && <span className="perm-mark-check"><CheckIcon size={10} /></span>}
  </span>;
}

/** Where it stands, as a badge whose word says it (its colour only repeats it); a spinner while it is being read or
 *  asked. */
export function MicrophoneBadge({ view, t }: { view: MicrophoneView; t: Translate }) {
  const tone = view.state === "granted" ? "positive" : view.state === "denied" ? "danger" : view.state === "missing" ? "warning" : "neutral";
  return <Badge tone={tone} className="perm-badge">
    {view.busy ? <span className="ui-spinner ui-spinner--inline" aria-hidden /> : view.state === "granted" ? <CheckIcon size={12} /> : null}{t(view.label)}
  </Badge>;
}

/** Blocked: how to allow it where this page runs — and, where the app can open them, the system's settings. */
export function MicrophoneHowTo({ view, openSettings, t }: { view: MicrophoneView; openSettings: (() => Promise<void>) | null; t: Translate }) {
  if (view.state !== "denied") return null;
  return <>
    <Alert tone="warning" className="wizard-mic-help perm-help" title={t("wizard.mic.denied.title")}
      action={openSettings ? <Button type="button" variant="secondary" size="sm" id="wizard-mic-settings" onClick={() => void openSettings()}>{t("wizard.mic.openSettings")}</Button> : undefined}>
      {t(view.howTo[0])}
    </Alert>
    {view.howTo[1] && <p className="wizard-mic-also perm-also">{t(view.howTo[1])}</p>}
  </>;
}

/** This device's microphone access for a screen that is not the setup (Settings › Permissions): its own reader, made
 *  as the screen shows and let go as it goes. */
export function useMicrophoneAccess(): { access: MicrophoneAccess | null; microphone: MicrophoneSnapshot | null } {
  const [access, setAccess] = useState<MicrophoneAccess | null>(null);
  useEffect(() => {
    const made = createMicrophoneAccess();
    setAccess(made);
    return () => made.dispose();
  }, []);
  const microphone = useSyncExternalStore(
    (listener) => access?.subscribe(listener) ?? (() => {}),
    () => access?.getSnapshot() ?? null,
    () => null);
  return { access, microphone };
}
