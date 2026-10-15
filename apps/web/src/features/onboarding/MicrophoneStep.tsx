import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { CheckIcon, MicrophoneIcon, MicrophoneOffIcon } from "../../components/ui/Icons";
import { desktopHost } from "../../services/desktop-host";
import { devicePlatform, type MicrophoneSnapshot } from "../../services/microphone-access";
import type { MessageKey, Translate } from "../../i18n/translator";

/* The setup's microphone step (web#129), before the first thing that listens: why, then the microphone as a tile that
 * says where it stands — not allowed yet (who will ask: the browser, or the computer), waiting for the answer, allowed,
 * blocked, or none connected. Blocked, how to allow it where this page runs: the app's system settings (with a button
 * there, where the app opens them), the computer's settings in the desktop app elsewhere, the site's permission in a
 * browser (and the computer's, which may block the browser itself). The footer's one action asks (Allow microphone;
 * Check again once blocked or none found); allowed, the setup moves on by itself. A live region says each change. */

type Platform = ReturnType<typeof devicePlatform>;

/** How to allow a blocked microphone, where this page runs: the lines to show. */
function howToAllow(asker: MicrophoneSnapshot["asker"], inDesktopApp: boolean, platform: Platform): MessageKey[] {
  if (asker === "app") return ["wizard.mic.denied.app"];
  if (inDesktopApp) return [platform === "windows" ? "wizard.mic.denied.windows" : platform === "mac" ? "wizard.mic.denied.app" : "wizard.mic.denied.linux"];
  const system: MessageKey | null = platform === "mac" ? "wizard.mic.denied.siteMac" : platform === "windows" ? "wizard.mic.denied.siteWindows" : null;
  return system ? ["wizard.mic.denied.site", system] : ["wizard.mic.denied.site"];
}

/** What the live region says of a state: its change, not the whole step again. */
function announcement(microphone: MicrophoneSnapshot, t: Translate) {
  const { state, asker, dismissed, unchanged } = microphone;
  if (state === "requesting") return t(asker === "app" ? "wizard.mic.requestingSystem" : "wizard.mic.requestingBrowser");
  if (state === "granted") return t("wizard.mic.allowedNow");
  if (state === "denied") return t(unchanged ? "wizard.mic.stillDenied" : "wizard.mic.denied.title");
  if (state === "missing") return t(unchanged ? "wizard.mic.stillMissing" : "wizard.mic.state.missing");
  if (state === "prompt" && dismissed) return t("wizard.mic.dismissed");
  return "";
}

export function MicrophoneStep({ microphone, openSettings, t, platform = devicePlatform() }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; t: Translate; platform?: Platform;
}) {
  const { asker, dismissed } = microphone;
  // Checking again from blocked or none found, the step stays as it was: only the button says it is busy.
  const state = microphone.state === "requesting" && (microphone.from === "denied" || microphone.from === "missing") ? microphone.from : microphone.state;
  const blocked = state === "denied" || state === "missing";
  const fromSystem = asker === "app";
  const label: MessageKey = state === "checking" ? "wizard.mic.checking" : state === "requesting" ? "wizard.mic.state.requesting"
    : state === "granted" || state === "none" ? "wizard.mic.state.granted" : state === "denied" ? "wizard.mic.state.denied"
      : state === "missing" ? "wizard.mic.state.missing" : "wizard.mic.state.prompt";
  const line: MessageKey | null = state === "prompt" ? (dismissed ? "wizard.mic.dismissed" : fromSystem ? "wizard.mic.askSystem" : "wizard.mic.askBrowser")
    : state === "requesting" ? (fromSystem ? "wizard.mic.requestingSystem" : "wizard.mic.requestingBrowser")
      : state === "granted" ? "wizard.mic.granted" : state === "missing" ? "wizard.mic.missing" : null;
  const lines = howToAllow(asker, !!desktopHost(), platform);
  return <section className="wizard-mic" data-state={state}>
    <p>{t("wizard.mic.intro")}</p>
    <div className="wizard-mic-tile">
      <span className="wizard-mic-mark" aria-hidden>
        {blocked ? <MicrophoneOffIcon size={24} /> : <MicrophoneIcon size={24} />}
        {state === "granted" && <span className="wizard-mic-check"><CheckIcon size={12} /></span>}
      </span>
      <div className="wizard-mic-text">
        <span className="wizard-mic-name">{t("wizard.mic.label")}</span>
        <strong className="wizard-mic-state">
          {(state === "checking" || state === "requesting") && <span className="ui-spinner ui-spinner--inline" aria-hidden />}{t(label)}
        </strong>
        {line && <span className="wizard-mic-line">{t(line)}</span>}
      </div>
    </div>
    {state === "denied" && <Alert tone="warning" className="wizard-mic-help" title={t("wizard.mic.denied.title")}
      action={openSettings ? <Button type="button" variant="secondary" size="sm" id="wizard-mic-settings" onClick={() => void openSettings()}>{t("wizard.mic.openSettings")}</Button> : undefined}>
      {t(lines[0])}
    </Alert>}
    {state === "denied" && lines[1] && <p className="wizard-mic-also">{t(lines[1])}</p>}
    {/* Each change said once, as it happens; the title, focused on arrival, says the step. */}
    <p className="sr-only" role="status" aria-live="polite">{announcement(microphone, t)}</p>
  </section>;
}

/** The step's footer action, one button whose words change with the state, so the focus stays on it: Allow microphone
 *  (busy while the prompt is open), Check again once blocked or none found, Continue once allowed. */
export function MicrophoneAction({ microphone, onRequest, onContinue, t }: {
  microphone: MicrophoneSnapshot; onRequest(): void; onContinue(): void; t: Translate;
}) {
  const { state, from } = microphone;
  const done = state === "granted" || state === "none";
  const again = state === "denied" || state === "missing" || (state === "requesting" && (from === "denied" || from === "missing"));
  return <Button type="button" variant="primary" id="wizard-mic-action" loading={state === "requesting" || state === "checking"}
    onClick={done ? onContinue : onRequest}>
    {t(done ? "wizard.continue" : again ? "wizard.mic.checkAgain" : "wizard.mic.allow")}
  </Button>;
}
