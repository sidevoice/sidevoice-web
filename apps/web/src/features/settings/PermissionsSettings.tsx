import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Group, Row, Section } from "../../components/ui/Card";
import { RefreshIcon } from "../../components/ui/Icons";
import { desktopHost } from "../../services/desktop-host";
import type { MicrophoneAccess, MicrophoneSnapshot } from "../../services/microphone-access";
import { announcement, MicrophoneBadge, MicrophoneHowTo, MicrophoneMark, microphoneAction, microphoneView } from "../permissions/permission-view";
import type { Translate } from "../../i18n/translator";

/* Settings › Permissions (2026-10-16): what Sidevoice may use on this device, in the setup's list look — each
 * permission a row with its name and why, where it stands as a badge, and what can be done at the row's end (Allow,
 * then Check again, or the system's settings where the app opens them); blocked, how to allow it under the list;
 * Refresh status reads every one again without asking. It reads again by itself when the person comes back to the page
 * or the app. In the desktop app and in a browser alike: there, it is the site's permission, and the section says where
 * it is changed (on a computer, and on an iPhone's Safari). Not drawn where there is nothing to ask (SettingsDialog
 * hides it). After Call (the microphone and speaker are chosen there; this is what lets them work), before the
 * machines.
 *
 * The row's button stays mounted and only changes its words (Allow microphone, Check again; busy while it asks), so
 * focus never falls to the page; a polite live region says the result. The reader is the dialog's, shared with Call's
 * link to this section. */
export function PermissionsSettings({ t, access, microphone }: { t: Translate; access: MicrophoneAccess | null; microphone: MicrophoneSnapshot | null }) {
  const view = microphone ? microphoneView(microphone) : null;
  // Allowed, it is still there as Check again (quiet), so the focus the press had does not fall to the page.
  const quiet = microphone?.state === "granted" || (microphone?.state === "requesting" && microphone.from === "granted");
  const action = access && microphone && view && microphone.state !== "checking" && microphone.state !== "none" ? microphoneAction(microphone) : null;
  return <Section id="permissions" title={t("settings.section.permissions")} description={t("settings.permissions.description")}
    actions={<Button size="sm" variant="ghost" tone="neutral" className="perm-refresh" disabled={!access || view?.busy} onClick={() => void access?.check()}>
      <RefreshIcon size={14} />{t("perm.refresh")}</Button>}>
    <Group>
      <Row className="perm-settings-row" label={<span className="perm-label">{view ? <MicrophoneMark view={view} /> : null}{t("wizard.mic.label")}</span>}
        description={<>{t("perm.mic.why")}{view?.line && <> {t(view.line)}</>}</>}>
        <span className="perm-settings-control">
          {view ? <MicrophoneBadge view={view} t={t} /> : <Badge>{t("wizard.mic.checking")}</Badge>}
          {action && access && <Button id="permissions-mic-action" size="sm" variant={quiet ? "ghost" : "secondary"} tone={quiet ? "neutral" : undefined}
            loading={action.busy} onClick={() => void access.request()}>{t(quiet ? "wizard.mic.checkAgain" : action.label)}</Button>}
        </span>
      </Row>
    </Group>
    {view && <MicrophoneHowTo view={view} openSettings={access?.openSettings ?? null} t={t} id="settings-mic-help" />}
    {!desktopHost() && <div className="perm-site-note">
      <p>{t("settings.permissions.site")}</p>
      <p>{t("settings.permissions.sitePhone")}</p>
    </div>}
    <p className="sr-only" role="status" aria-live="polite">{microphone ? announcement(microphone, t) : ""}</p>
  </Section>;
}
