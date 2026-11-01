import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { Tooltip } from "../../components/ui/Tooltip";
import { PermissionsList } from "../permissions/PermissionsList";
import { microphoneAction } from "../permissions/permission-view";
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
 * the microphone is allowed (needed to speak, not to call: operator 2026-10-28). The bicho moves a little by state
 * (a hop once allowed, a droop while blocked, a lean while asked) on a wrapper: the engine has no expressions.
 *
 * Calm always: the permission check lets the microphone go at once, so nothing is heard here and the bicho never acts
 * out listening (the transcription try after it tests the microphone for real). */

export function PermissionsStep({ microphone, openSettings, onRequest = () => {}, t }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; onRequest?(): void; t: Translate;
}) {
  return <section className="wizard-mic"><PermissionsList microphone={microphone} openSettings={openSettings} onRequest={onRequest} t={t} /></section>;
}

/** The footer's forward action: Continue, waiting until the microphone is allowed. The microphone is needed
 *  to speak, not to call (operator, 2026-10-28); one element, so focus stays on it. `skip` (operator
 *  2026-10-28): while it is not allowed, the quiet "Skip for now" with its confirm left of it, which says what is lost —
 *  the agents will not hear the person — and where to allow it; the call joins to listen meanwhile. */
export function MicrophoneContinue({ microphone, onContinue, skip, t }: { microphone: MicrophoneSnapshot; onContinue(): void; skip?: ReactNode; t: Translate }) {
  const { done } = microphoneAction(microphone);
  return <>
    {!done && skip}
    {/* Waiting, it says why on hover and focus: aria-disabled (blockedBy), so it stays focusable and its tooltip shows. */}
    <Tooltip content={done ? null : t("wizard.mic.continueWaiting")}>
      <Button type="button" variant="primary" id="wizard-mic-continue" className={done ? undefined : "wizard-continue-waiting"}
        disabled={!done} blockedBy={done ? undefined : "wizard-mic-continue-why"} onClick={onContinue}>{t("wizard.continue")}</Button>
    </Tooltip>
    {!done && <span id="wizard-mic-continue-why" className="sr-only">{t("wizard.mic.continueWaiting")}</span>}
  </>;
}
