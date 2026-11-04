import { useEffect, useRef, useState } from "react";
import { Button } from "../../components/ui/Button";
import { Group, Row } from "../../components/ui/Card";
import { MicrophoneIcon, MicrophoneOffIcon } from "../../components/ui/Icons";
import { PERSON_AVATAR, type AvatarSpec } from "../avatar/avatar-spec";
import { stillAvatar } from "../avatar/avatar-state";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { announcement, MicrophoneBadge, MicrophoneHowTo, microphoneAction, MIC_HELP_ID, microphoneView, type MicrophoneView } from "./permission-view";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import type { Translate } from "../../i18n/translator";
import { MediaPermissionRows } from "./media-permissions";

/* What Sidevoice needs allowed, one look wherever it is asked (operator, 2026-10-16): the setup's permissions step and
 * Settings › Permissions. The person's bicho on top — the microphone in its hand once allowed — and under it a list, each
 * permission a row: its icon, its name, why it is needed in a few words, and at the right its action, Allow, that becomes
 * the green Allowed badge (focus moves to the badge, never to the page); blocked, Check again and, under the row, how to
 * allow it. It follows the platform by itself. Another permission is one more row. */
function MicrophoneRow({ microphone, view, onRequest, openSettings, t, actionId, helpId }: {
  microphone: MicrophoneSnapshot; view: MicrophoneView; onRequest(): void; openSettings: (() => Promise<void>) | null; t: Translate; actionId: string; helpId: string;
}) {
  const { busy, again } = microphoneAction(microphone);
  const allowed = view.state === "granted" || view.state === "none";
  const badge = useRef<HTMLSpanElement>(null);
  const hadFocus = useRef(false);
  // Focus on the check-again button or inside the how-to alert (its settings button) moves to the badge once allowed.
  useEffect(() => {
    const inHelp = (target: EventTarget | null) => target instanceof Node && !!document.getElementById(helpId)?.contains(target);
    const enter = (event: FocusEvent) => { if (inHelp(event.target)) hadFocus.current = true; };
    const leave = (event: FocusEvent) => { if (inHelp(event.target)) hadFocus.current = false; };
    document.addEventListener("focusin", enter);
    document.addEventListener("focusout", leave);
    return () => { document.removeEventListener("focusin", enter); document.removeEventListener("focusout", leave); };
  }, [helpId]);
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
          : <Button id={actionId} size="sm" variant="primary" loading={busy}
              aria-describedby={view.blocked ? helpId : undefined}
              onFocus={() => { hadFocus.current = true; }} onBlur={() => { hadFocus.current = false; }}
              onClick={() => { hadFocus.current = true; onRequest(); }}>{t(again ? "wizard.mic.checkAgain" : "wizard.mic.allow")}</Button>}
      </span>
    </Row>
    <MicrophoneHowTo view={view} openSettings={openSettings} t={t} id={helpId} />
  </>;
}

/** The person's bicho with the microphone in its hand, once it is allowed. */
const PERSON_WITH_MIC: AvatarSpec = { kind: "person", hold: "microphone" };

/** `microphone` null, or with nothing to ask (`none`): no microphone row; the list still shows for the media permissions the
 *  app reports, if any. */
export function PermissionsList({ microphone, openSettings, onRequest, t, actionId = "wizard-mic-action", helpId = MIC_HELP_ID }: {
  microphone: MicrophoneSnapshot | null; openSettings: (() => Promise<void>) | null; onRequest(): void; t: Translate; actionId?: string; helpId?: string;
}) {
  const view = microphone && microphone.state !== "none" ? microphoneView(microphone) : null;
  const state = view?.state ?? "none";
  // What a media row's Allow came to, said in the same live region as the microphone's changes.
  const [mediaSaid, setMediaSaid] = useState("");
  return <div className="wizard-perm perm-list" data-state={state}>
    <span className="perm-hero-figure" data-state={state} aria-hidden><CharacterAvatar spec={state === "granted" ? PERSON_WITH_MIC : PERSON_AVATAR} state={stillAvatar("present")} size="pip" /></span>
    <Group>
      {microphone && view && <MicrophoneRow microphone={microphone} view={view} onRequest={onRequest} openSettings={openSettings} t={t} actionId={actionId} helpId={helpId} />}
      {/* Where the app lowers or pauses other apps' media in a call, the permissions that needs (macOS). */}
      <MediaPermissionRows t={t} onSay={setMediaSaid} />
    </Group>
    {/* Each change said once, as it happens. */}
    <p className="sr-only" role="status" aria-live="polite">{microphone && view ? announcement(microphone, t) : ""}{mediaSaid && <span> {mediaSaid}</span>}</p>
  </div>;
}
