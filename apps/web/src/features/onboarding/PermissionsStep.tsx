import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { PermissionsList } from "../permissions/PermissionsList";
import { microphoneAction, type Platform } from "../permissions/permission-view";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import type { Translate } from "../../i18n/translator";

/* The setup's permissions step (W4m; web#129, moved early on 2026-10-16): right after the basics, before this computer
 * is prepared or a machine paired, everything Sidevoice needs allowed on this device — today the microphone alone
 * (briefs/plans/permissions-screen.md: Accessibility is not needed). The person's own bicho, with the microphone on its
 * badge (decided 2026-10-16), says where it stands — not allowed yet (who will ask: the browser, or the computer),
 * waiting for the answer, allowed, blocked, none connected — and, blocked, how to allow it where this page runs (the
 * app's system settings with a button where the app opens them, the computer's elsewhere in the app, the site's
 * permission and the computer's in a browser). The footer's one action asks (Allow microphone; Check again once
 * blocked or none found) and, allowed, is Continue: the step always waits for it. A live region says each change.
 * One block per permission (PermissionBlock), each with its own action and, blocked, all its recovery inside it. The
 * action is in the block: one control that changes its label — Allow microphone, Check again once blocked or none
 * found, Allowed (a check, not pressable) — so focus stays on it; the footer's forward action is Continue, waiting until
 * the microphone is allowed (required in this release, operator 2026-10-16). The bicho moves a little by state
 * (a hop once allowed, a droop while blocked, a lean while asked) on a wrapper: the engine has no expressions.
 *
 * Calm always: the permission check lets the microphone go at once, so nothing is heard here and the bicho never acts
 * out listening (the transcription try after it tests the microphone for real). */

export function PermissionsStep({ microphone, openSettings, onRequest = () => {}, t, platform }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; onRequest?(): void; t: Translate; platform?: Platform;
}) {
  return <section className="wizard-mic"><PermissionsList microphone={microphone} openSettings={openSettings} onRequest={onRequest} t={t} platform={platform} /></section>;
}

/** The footer's forward action: Continue, waiting until the microphone is allowed. The microphone is required to call in
 *  this release (operator, 2026-10-16); one element, so focus stays on it. `onSkip` (operator
 *  2026-10-16): while it is not allowed, the quiet "Continue without microphone" left of it, alone — the row above already
 *  says what the microphone is for; the call area asks for it afterwards. */
export function MicrophoneContinue({ microphone, onContinue, onSkip, t }: { microphone: MicrophoneSnapshot; onContinue(): void; onSkip?: () => void; t: Translate }) {
  const { done } = microphoneAction(microphone);
  return <>
    {!done && onSkip && <Button type="button" variant="secondary" id="wizard-step-skip" onClick={onSkip}>{t("wizard.skip.microphone")}</Button>}
    {/* Waiting, it says why on hover and focus: aria-disabled (blockedBy), so it stays focusable and its tooltip shows. */}
    <Tooltip content={done ? null : t("wizard.mic.continueWaiting")}>
      <Button type="button" variant="primary" id="wizard-mic-continue" className={done ? undefined : "wizard-continue-waiting"}
        disabled={!done} blockedBy={done ? undefined : "wizard-mic-continue-why"} onClick={onContinue}>{t("wizard.continue")}</Button>
    </Tooltip>
    {!done && <span id="wizard-mic-continue-why" className="sr-only">{t("wizard.mic.continueWaiting")}</span>}
  </>;
}
