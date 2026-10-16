import type { ReactNode } from "react";
import { Button } from "../../components/ui/Button";
import { CheckIcon } from "../../components/ui/Icons";
import { useVariant } from "../../lib/variants";
import { PERSON_AVATAR } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { announcement, MicrophoneHowTo, MicrophoneMark, microphoneAction, MIC_HELP_ID, microphoneView, type MicrophoneView, type Platform } from "../permissions/permission-view";
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

const BUTTON_LOOKS = ["a", "b", "c"] as const;
type ButtonLook = typeof BUTTON_LOOKS[number];
const LINE_ID = "wizard-mic-line";

/** The card's one control: its words follow the state, it is never swapped for another element (focus stays), and once
 *  allowed it keeps its size, shows a check and cannot be pressed. a: full width under the bicho; b: a pill beside the
 *  state; c: a toggle that flips to Allowed. */
function MicrophoneControl({ microphone, view, onRequest, look, t }: { microphone: MicrophoneSnapshot; view: MicrophoneView; onRequest(): void; look: ButtonLook; t: Translate }) {
  const { done, busy, again } = microphoneAction(microphone);
  const label = t(done ? "wizard.mic.state.granted" : again ? "wizard.mic.checkAgain" : "wizard.mic.allow");
  const allowed = view.state === "granted" || view.state === "none";
  return <Button type="button" variant={look === "c" ? "secondary" : "primary"} size={look === "b" ? "sm" : "md"} id="wizard-mic-action" className="perm-control"
    data-look={look} data-state={allowed ? "granted" : view.state} loading={busy} disabled={allowed} blockedBy={allowed ? LINE_ID : undefined}
    block={look === "a"} aria-pressed={look === "c" ? allowed : undefined}
    aria-describedby={microphone.state === "denied" ? MIC_HELP_ID : undefined} onClick={onRequest}>
    {look === "c" && <span className="perm-toggle-track" aria-hidden><span className="perm-toggle-knob" /></span>}
    {allowed && look !== "c" && <CheckIcon size={16} />}{label}
  </Button>;
}

/** One permission's block, self-contained: its figure, name, where it stands, the line under it, its one action and, when
 *  it is blocked, everything to recover it (the how-to, the system's settings, Check again) — nothing of it is in the footer
 *  or outside the block. The step is a list of these, so another permission is one more entry with its own action and
 *  recovery. `action` sits under the state, or `inline` beside it. */
function PermissionBlock({ id, state, figure, name, mark, label, busy, line, action, inline, why, recovery }: {
  id: string; state: string; figure: ReactNode; name: string; mark: ReactNode; label: string; busy: boolean; line: ReactNode | null;
  action: ReactNode; inline?: boolean; why: string; recovery: ReactNode;
}) {
  return <li className="perm-hero" data-permission={id} data-state={state}>
    <span className="perm-hero-figure" data-state={state} aria-hidden>{figure}</span>
    <span className="perm-name">{name}</span>
    <span className="perm-hero-chip">
      {mark}
      <strong className="perm-hero-state">{busy && <span className="ui-spinner ui-spinner--inline" aria-hidden />}{label}</strong>
      {inline && action}
    </span>
    {line}
    {!inline && action}
    <p className="perm-hero-why">{why}</p>
    {recovery}
  </li>;
}

/** The microphone's block: the person's own bicho, calm, the microphone as a chip with its state. */
function MicrophoneBlock({ microphone, view, openSettings, onRequest, t }: {
  microphone: MicrophoneSnapshot; view: MicrophoneView; openSettings: (() => Promise<void>) | null; onRequest(): void; t: Translate;
}) {
  const look = useVariant("permissionButton", BUTTON_LOOKS);
  return <PermissionBlock id="microphone" state={view.state} name={t("wizard.mic.label")} busy={view.busy} label={t(view.label)}
    figure={<CharacterAvatar spec={PERSON_AVATAR} mood="present" size="pip" />} mark={<MicrophoneMark view={view} />}
    line={view.line ? <span className="perm-line" id={LINE_ID}>{t(view.line)}</span> : null}
    action={<MicrophoneControl microphone={microphone} view={view} onRequest={onRequest} look={look} t={t} />} inline={look === "b"}
    why={t(view.state === "granted" ? "perm.hero.granted" : view.blocked ? "perm.hero.blocked" : "wizard.mic.intro")}
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
