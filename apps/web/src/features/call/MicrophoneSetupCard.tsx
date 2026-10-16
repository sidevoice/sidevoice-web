import { Button } from "../../components/ui/Button";
import { MicrophoneIcon } from "../../components/ui/Icons";
import { PermissionsList } from "../permissions/PermissionsList";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { translator } from "../../i18n/translator";

/* The call's own space while a machine answers but the microphone is not allowed (onboardingFlow b and d): the same
 * permissions list as the setup's step and Settings, so Allow, Check again and how to allow it are the same everywhere.
 * Reactive: once allowed, the call area shows the stage with no reload. `onContinueSetup`: the way back into the setup. */
export function MicrophoneSetupCard({ microphone, openSettings, onRequest, onContinueSetup }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; onRequest(): void; onContinueSetup?: () => void;
}) {
  const t = translator();
  return <section className="voice-setup-card" aria-labelledby="mic-setup-title">
    <span className="voice-setup-mark"><MicrophoneIcon size={28} /></span>
    <h1 id="mic-setup-title">{t("micSetup.title")}</h1>
    <p>{t("micSetup.body")}</p>
    <PermissionsList microphone={microphone} openSettings={openSettings} onRequest={onRequest} t={t} actionId="call-mic-action" helpId="call-mic-help" />
    {onContinueSetup && <Button variant="ghost" tone="neutral" size="sm" className="waiting-continue-setup" onClick={onContinueSetup}>{t("noMachine.continue")}</Button>}
  </section>;
}
