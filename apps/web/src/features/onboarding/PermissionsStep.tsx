import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { CheckIcon, MicrophoneIcon } from "../../components/ui/Icons";
import { PERSON_AVATAR } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { announcement, MicrophoneHowTo, microphoneAction, MIC_HELP_ID, microphoneView, type MicrophoneView, type Platform } from "../permissions/permission-view";
import { devicePlatform, type MicrophoneSnapshot } from "../../services/microphone-access";
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
 * found, Allowed (a check, not pressable) — so focus stays on it; the footer's forward action is always there: "Continue without
 * microphone" (quiet) until allowed, then Continue. Three looks of that control are compared (variant `permissionButton`). The bicho moves a little by state
 * (a hop once allowed, a droop while blocked, a lean while asked) on a wrapper: the engine has no expressions.
 *
 * Calm always: the permission check lets the microphone go at once, so nothing is heard here and the bicho never acts
 * out listening (the transcription try after it tests the microphone for real). */

/* Simplified (operator, 2026-10-16): the block is the bicho and its one button, nothing around them but, blocked, how to
 * recover. The button says it all: the microphone's icon and Allow microphone; Check again once blocked or none found;
 * Microphone allowed (a check, not pressable) once allowed — one element, so focus stays on it. */
const LINE_ID = "wizard-mic-line";

function MicrophoneControl({ microphone, view, onRequest, t }: { microphone: MicrophoneSnapshot; view: MicrophoneView; onRequest(): void; t: Translate }) {
  const { done, busy, again } = microphoneAction(microphone);
  const allowed = view.state === "granted" || view.state === "none";
  const label = t(allowed || done ? "wizard.mic.allowed" : again ? "wizard.mic.checkAgain" : "wizard.mic.allow");
  return <Button type="button" variant="primary" id="wizard-mic-action" className="perm-control" data-state={allowed ? "granted" : view.state}
    loading={busy} disabled={allowed} blockedBy={allowed ? LINE_ID : undefined} block
    aria-describedby={microphone.state === "denied" ? MIC_HELP_ID : undefined} onClick={onRequest}>
    {allowed ? <CheckIcon size={16} /> : <MicrophoneIcon size={16} />}{label}
  </Button>;
}

/** One permission's block, self-contained: its figure, its one action and, blocked, everything to recover it. The step is a
 *  list of these, so another permission is one more entry with its own action and recovery. */
function PermissionBlock({ id, state, figure, action, recovery, line }: { id: string; state: string; figure: ReactNode; action: ReactNode; recovery: ReactNode; line: ReactNode | null }) {
  return <li className="perm-hero" data-permission={id} data-state={state}>
    <span className="perm-hero-figure" data-state={state} aria-hidden>{figure}</span>
    {action}
    {line}
    {recovery}
  </li>;
}

/** The microphone's block: the person's own bicho, moving a little by state, and its button. */
function MicrophoneBlock({ microphone, view, openSettings, onRequest, t }: {
  microphone: MicrophoneSnapshot; view: MicrophoneView; openSettings: (() => Promise<void>) | null; onRequest(): void; t: Translate;
}) {
  return <PermissionBlock id="microphone" state={view.state}
    figure={<CharacterAvatar spec={PERSON_AVATAR} mood="present" size="pip" />}
    action={<MicrophoneControl microphone={microphone} view={view} onRequest={onRequest} t={t} />}
    line={view.line && view.state !== "granted" ? <span className="perm-line" id={LINE_ID}>{t(view.line)}</span> : null}
    recovery={<MicrophoneHowTo view={view} openSettings={openSettings} t={t} />} />;
}

export function PermissionsStep({ microphone, openSettings, onRequest = () => {}, t, platform = devicePlatform() }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; onRequest?(): void; t: Translate; platform?: Platform;
}) {
  const view = microphoneView(microphone, platform);
  return <section className="wizard-mic wizard-perm" data-state={view.state}>
    <ul className="perm-blocks">
      <MicrophoneBlock microphone={microphone} view={view} openSettings={openSettings} onRequest={onRequest} t={t} />
    </ul>
    {/* Each change said once, as it happens; the title, focused on arrival, says the step. */}
    <p className="sr-only" role="status" aria-live="polite">{announcement(microphone, t)}</p>
  </section>;
}

/** The footer's forward action, always there and never waiting for the microphone (operator, 2026-10-16): quiet and saying
 *  "Continue without microphone" until it is allowed, then the primary Continue. One element, so focus stays on it. */
export function MicrophoneContinue({ microphone, onContinue, t }: { microphone: MicrophoneSnapshot; onContinue(): void; t: Translate }) {
  const { done } = microphoneAction(microphone);
  return <Button type="button" variant={done ? "primary" : "secondary"} id="wizard-mic-continue" onClick={onContinue}>
    {t(done ? "wizard.continue" : "wizard.mic.continueWithout")}
  </Button>;
}
