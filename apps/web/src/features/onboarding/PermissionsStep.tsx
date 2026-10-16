import { useEffect, useRef } from "react";
import { Button } from "../../components/ui/Button";
import { PERSON_AVATAR } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { MicrophoneIcon, MicrophoneOffIcon, RefreshIcon } from "../../components/ui/Icons";
import { Group, Row } from "../../components/ui/Card";
import { announcement, MicrophoneBadge, MicrophoneHowTo, microphoneAction, MIC_HELP_ID, microphoneView, useMicrophoneAccess, type MicrophoneView, type Platform } from "../permissions/permission-view";
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
 * microphone" (quiet) until allowed, then Continue. The bicho moves a little by state
 * (a hop once allowed, a droop while blocked, a lean while asked) on a wrapper: the engine has no expressions.
 *
 * Calm always: the permission check lets the microphone go at once, so nothing is heard here and the bicho never acts
 * out listening (the transcription try after it tests the microphone for real). */

/* The bicho on top, and under it the list of what Sidevoice needs allowed, as Settings › Permissions has it (operator,
 * 2026-10-16): each permission a row — its mark, its name, why it is needed — with its action at the end, Allow, that
 * becomes the green Allowed badge once allowed (focus moves to the badge, never to the page); blocked, Check again and,
 * under the row, how to allow it. Refresh status re-reads by hand, though it follows the platform by itself. Another
 * permission is one more row. */
function MicrophoneRow({ microphone, view, onRequest, openSettings, t }: {
  microphone: MicrophoneSnapshot; view: MicrophoneView; onRequest(): void; openSettings: (() => Promise<void>) | null; t: Translate;
}) {
  const { busy, again } = microphoneAction(microphone);
  const allowed = view.state === "granted" || view.state === "none";
  const badge = useRef<HTMLSpanElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const hadFocus = useRef(false);
  useEffect(() => {
    if (allowed && hadFocus.current) badge.current?.focus();
    hadFocus.current = false;
  }, [allowed]);
  return <>
    <Row className="perm-settings-row perm-step-row" label={<span className="perm-label"><span className="perm-plain-icon" aria-hidden>{view.blocked ? <MicrophoneOffIcon size={18} /> : <MicrophoneIcon size={18} />}</span>{t("wizard.mic.label")}</span>}
      description={t("perm.mic.why")}>
      <span className="perm-settings-control">
        {allowed
          ? <span ref={badge} tabIndex={-1} className="perm-badge-focus"><MicrophoneBadge view={view} t={t} /></span>
          : <Button ref={button} id="wizard-mic-action" size="sm" variant="primary" loading={busy}
              aria-describedby={microphone.state === "denied" ? MIC_HELP_ID : undefined}
              onFocus={() => { hadFocus.current = true; }} onBlur={() => { hadFocus.current = false; }}
              onClick={() => { hadFocus.current = true; onRequest(); }}>{t(again ? "wizard.mic.checkAgain" : "wizard.mic.allow")}</Button>}
      </span>
    </Row>
    <MicrophoneHowTo view={view} openSettings={openSettings} t={t} />
  </>;
}

export function PermissionsStep({ microphone, openSettings, onRequest = () => {}, t, platform = devicePlatform() }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; onRequest?(): void; t: Translate; platform?: Platform;
}) {
  const view = microphoneView(microphone, platform);
  const { access } = useMicrophoneAccess();
  return <section className="wizard-mic wizard-perm" data-state={view.state}>
    <span className="perm-hero-figure" data-state={view.state} aria-hidden><CharacterAvatar spec={PERSON_AVATAR} mood="present" size="pip" /></span>
    <Group>
      <MicrophoneRow microphone={microphone} view={view} onRequest={onRequest} openSettings={openSettings} t={t} />
    </Group>
    <Button size="sm" variant="ghost" tone="neutral" className="perm-refresh" disabled={!access || view.busy} onClick={() => void access?.check()}>
      <RefreshIcon size={14} />{t("perm.refresh")}</Button>
    {/* Each change said once, as it happens; the title, focused on arrival, says the step. */}
    <p className="sr-only" role="status" aria-live="polite">{announcement(microphone, t)}</p>
  </section>;
}

/** The footer's forward action, always there and never waiting for the microphone (operator, 2026-10-16): quiet and saying
 *  "Continue without microphone" until it is allowed, then the primary Continue. One element, so focus stays on it. */
export function MicrophoneContinue({ microphone, onContinue, t }: { microphone: MicrophoneSnapshot; onContinue(): void; t: Translate }) {
  const { done } = microphoneAction(microphone);
  // Two ways on (operator, 2026-10-16): "Continue without microphone", secondary, at the left until it is allowed; and
  // Continue, the primary, in the brand's colour but waiting until the microphone is allowed.
  return <>
    {!done && <Button type="button" variant="secondary" id="wizard-mic-skip" onClick={onContinue}>{t("wizard.mic.continueWithout")}</Button>}
    <Button type="button" variant="primary" id="wizard-mic-continue" className={done ? undefined : "wizard-continue-waiting"} disabled={!done} onClick={onContinue}>
      {t("wizard.continue")}</Button>
  </>;
}
