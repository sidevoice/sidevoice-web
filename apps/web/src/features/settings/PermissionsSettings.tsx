import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Group, Row, Section } from "../../components/ui/Card";
import { RefreshIcon } from "../../components/ui/Icons";
import { desktopHost } from "../../services/desktop-host";
import { MicrophoneBadge, MicrophoneHowTo, MicrophoneMark, microphoneView, useMicrophoneAccess } from "../permissions/permission-view";
import type { Translate } from "../../i18n/translator";

/* Settings › Permissions (2026-10-16): what Sidevoice may use on this device, in the setup's list look — each
 * permission a row with its name and why, where it stands as a badge, and what can be done at the row's end (Allow,
 * Check again, or the system's settings where the app opens them); blocked, how to allow it under the list; Refresh
 * status reads every one again without asking. In the desktop app and in a browser alike: there, it is the site's
 * permission, and the section says where it is changed. After Call (the microphone and speaker are chosen there; this
 * is what lets them work), before the machines. */
export function PermissionsSettings({ t }: { t: Translate }) {
  const { access, microphone } = useMicrophoneAccess();
  const view = microphone ? microphoneView(microphone) : null;
  const action = !access || !view ? null
    : view.state === "prompt" ? <Button size="sm" onClick={() => void access.request()}>{t("wizard.mic.allow")}</Button>
      : view.blocked || (microphone?.state === "requesting" && microphone.from !== "prompt")
        ? <Button size="sm" variant="secondary" loading={view.busy} onClick={() => void access.request()}>{t("wizard.mic.checkAgain")}</Button>
        : null;
  return <Section id="permissions" title={t("settings.section.permissions")} description={t("settings.permissions.description")}
    actions={<Button size="sm" variant="ghost" tone="neutral" className="perm-refresh" disabled={!access || view?.busy} onClick={() => void access?.check()}>
      <RefreshIcon size={14} />{t("perm.refresh")}</Button>}>
    <Group>
      <Row className="perm-settings-row" label={<span className="perm-label">{view ? <MicrophoneMark view={view} /> : null}{t("wizard.mic.label")}</span>}
        description={<>{t("perm.mic.why")}{view?.line && <> {t(view.line)}</>}</>}>
        <span className="perm-settings-control">
          {view ? <MicrophoneBadge view={view} t={t} /> : <Badge>{t("wizard.mic.checking")}</Badge>}
          {action}
        </span>
      </Row>
    </Group>
    {view && <MicrophoneHowTo view={view} openSettings={access?.openSettings ?? null} t={t} />}
    {!desktopHost() && <p className="perm-site-note">{t("settings.permissions.site")}</p>}
  </Section>;
}
