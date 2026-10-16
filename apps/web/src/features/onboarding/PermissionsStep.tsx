import { Button } from "../../components/ui/Button";
import { RefreshIcon } from "../../components/ui/Icons";
import { PERSON_AVATAR } from "../avatar/avatar-spec";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { announcement, MicrophoneBadge, MicrophoneHowTo, MicrophoneMark, microphoneView, type MicrophoneView, type Platform } from "../permissions/permission-view";
import { devicePlatform, type MicrophoneSnapshot } from "../../services/microphone-access";
import { useVariant } from "../../lib/variants";
import type { Translate } from "../../i18n/translator";

/* The setup's permissions step (W4m; web#129, moved early on 2026-10-16): right after the basics, before this computer
 * is prepared or a machine paired, everything Sidevoice needs allowed on this device — today the microphone alone
 * (briefs/plans/permissions-screen.md: Accessibility is not needed). Each permission says why, where it stands — not
 * allowed yet (who will ask: the browser, or the computer), waiting for the answer, allowed, blocked, none connected —
 * and, blocked, how to allow it where this page runs (the app's system settings with a button where the app opens
 * them, the computer's elsewhere in the app, the site's permission and the computer's in a browser). The footer's one
 * action asks (Allow microphone; Check again once blocked or none found) and, allowed, is Continue: the step always
 * waits for it. A live region says each change.
 *
 * Four looks are compared on the live page (variant `permissionsStep`): a, the settings-style list Settings ›
 * Permissions shows too; b, the person's bicho listening, the microphone on its badge; c, a checklist card; d, one
 * compact row. Each covers every state; behaviour is the same. */

const LOOKS = ["a", "b", "c", "d"] as const;

/** a: the settings-style list — each permission a row with its mark, name and why, its badge at the end — and Refresh
 *  status under it, as Settings › Permissions draws it. */
function ListLook({ view, onRefresh, t }: { view: MicrophoneView; onRefresh(): void; t: Translate }) {
  return <>
    <p>{t("perm.intro")}</p>
    <ul className="perm-list" aria-label={t("perm.list")}>
      <li className="perm-row" data-permission="microphone" data-state={view.state}>
        <MicrophoneMark view={view} />
        <span className="perm-text">
          <span className="perm-name">{t("wizard.mic.label")}</span>
          <span className="perm-why">{t("perm.mic.why")}</span>
          {view.line && <span className="perm-line">{t(view.line)}</span>}
        </span>
        <MicrophoneBadge view={view} t={t} />
      </li>
    </ul>
    <Button type="button" variant="ghost" tone="neutral" size="sm" className="perm-refresh" disabled={view.busy} onClick={onRefresh}><RefreshIcon size={14} />{t("perm.refresh")}</Button>
  </>;
}

/** b: the person's own bicho, listening once it may (the cue of sound flowing in), the microphone on its badge; under
 *  it the state, large, its line, and why. */
function HeroLook({ view, t }: { view: MicrophoneView; t: Translate }) {
  const mood = view.state === "granted" || view.state === "requesting" ? "listening" : "present";
  return <>
    <div className="perm-hero" data-permission="microphone" data-state={view.state}>
      <span className="perm-hero-figure" aria-hidden>
        <CharacterAvatar spec={PERSON_AVATAR} mood={mood} size="pip" />
        <MicrophoneMark view={view} className="perm-mark perm-hero-badge" />
      </span>
      <span className="perm-name">{t("wizard.mic.label")}</span>
      <strong className="perm-hero-state">{view.busy && <span className="ui-spinner ui-spinner--inline" aria-hidden />}{t(view.label)}</strong>
      {view.line && <span className="perm-line">{t(view.line)}</span>}
    </div>
    <p className="perm-hero-why">{t("wizard.mic.intro")}</p>
  </>;
}

/** c: a checklist card, "Before your first call": each permission a mark that fills as it is allowed (a ring, a
 *  spinner while asked, a check, a warning), its name and state on one line, why under it. */
function ChecklistLook({ view, t }: { view: MicrophoneView; t: Translate }) {
  return <div className="perm-checklist">
    <h3 className="perm-checklist-title">{t("perm.checklist.title")}</h3>
    <ol className="perm-checklist-items">
      <li className="perm-check" data-permission="microphone" data-state={view.state}>
        <span className="perm-check-mark" aria-hidden>{view.busy ? <span className="ui-spinner ui-spinner--inline" /> : view.state === "granted" ? "✓" : view.blocked ? "!" : ""}</span>
        <span className="perm-text">
          <span className="perm-check-line"><span className="perm-name">{t("wizard.mic.label")}</span><strong>{t(view.label)}</strong></span>
          <span className="perm-why">{t("perm.mic.why")}</span>
          {view.line && <span className="perm-line">{t(view.line)}</span>}
        </span>
      </li>
    </ol>
  </div>;
}

/** d: one compact row — the reason in a sentence above, the microphone and its state on one line, its line under. */
function CompactLook({ view, t }: { view: MicrophoneView; t: Translate }) {
  return <>
    <p>{t("perm.compact.lead")}</p>
    <div className="perm-compact" data-permission="microphone" data-state={view.state}>
      <MicrophoneMark view={view} />
      <span className="perm-name">{t("wizard.mic.label")}</span>
      <MicrophoneBadge view={view} t={t} />
      {view.line && <span className="perm-line">{t(view.line)}</span>}
    </div>
  </>;
}

export function PermissionsStep({ microphone, openSettings, onRefresh, t, platform = devicePlatform() }: {
  microphone: MicrophoneSnapshot; openSettings: (() => Promise<void>) | null; onRefresh(): void; t: Translate; platform?: Platform;
}) {
  const look = useVariant("permissionsStep", LOOKS);
  const view = microphoneView(microphone, platform);
  return <section className="wizard-mic wizard-perm" data-look={look} data-state={view.state}>
    {look === "a" && <ListLook view={view} onRefresh={onRefresh} t={t} />}
    {look === "b" && <HeroLook view={view} t={t} />}
    {look === "c" && <ChecklistLook view={view} t={t} />}
    {look === "d" && <CompactLook view={view} t={t} />}
    <MicrophoneHowTo view={view} openSettings={openSettings} t={t} />
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
