import { Section } from "../../components/ui/Card";
import { desktopHost } from "../../services/desktop-host";
import type { MicrophoneAccess, MicrophoneSnapshot } from "../../services/microphone-access";
import { PermissionsList } from "../permissions/PermissionsList";
import type { Translate } from "../../i18n/translator";

/* Settings › Permissions (2026-10-16): what Sidevoice may use on this device, in the setup's list look — each
 * permission a row with its name and why, where it stands as a badge, and what can be done at the row's end (Allow,
 * then Check again, or the system's settings where the app opens them); blocked, how to allow it under the list;
 * It reads again by itself when the person comes back to the page
 * or the app. In the desktop app and in a browser alike: there, it is the site's permission, and the section says where
 * it is changed (on a computer, and on an iPhone's Safari). Not drawn where there is nothing to ask (SettingsDialog
 * hides it). After Call (the microphone and speaker are chosen there; this is what lets them work), before the
 * machines.
 *
 * The row's button stays mounted and only changes its words (Allow microphone, Check again; busy while it asks), so
 * focus never falls to the page; a polite live region says the result. The reader is the dialog's, shared with Call's
 * link to this section. */
export function PermissionsSettings({ t, access, microphone }: { t: Translate; access: MicrophoneAccess | null; microphone: MicrophoneSnapshot | null }) {
  // The same list as the setup's permissions step (PermissionsList, operator 2026-10-16): the person's bicho, then a row per
  // permission with its action at the right; it follows the platform by itself, so no Refresh.
  return <Section id="permissions" title={t("settings.section.permissions")} description={t("settings.permissions.description")}>
    {microphone && <PermissionsList microphone={microphone} openSettings={access?.openSettings ?? null} onRequest={() => void access?.request()} t={t}
      actionId="permissions-mic-action" helpId="settings-mic-help" />}
    {!desktopHost() && <div className="perm-site-note">
      <p>{t("settings.permissions.site")}</p>
      <p>{t("settings.permissions.sitePhone")}</p>
    </div>}
  </Section>;
}
