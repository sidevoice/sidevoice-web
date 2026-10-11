import { Fragment, useContext, useEffect, useState, type ReactNode } from "react";
import { DialogSurface } from "../../components/ui/Dialog";
import { OverlayPortalProvider } from "../../components/ui/Tooltip";
import { AdvancedIcon, CallSettingsIcon, SidevoiceMark, GeneralIcon, IntegrationsIcon, MachinesIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { NativeSelect } from "../../components/ui/NativeSelect";
import { Group, Row, Section } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { useVariant } from "../../lib/variants";
import { readThemePreference, setThemePreference, type ThemePreference } from "../../lib/theme";
import { MACHINES_LAYOUT, MachineList, MachineNav } from "../room/MachineList";
import { ProviderKeys } from "./ProviderKeys";
import { IdleUnloadChoice, SlotPane, TurnChoices, useVoiceReadiness } from "./VoiceSettings";
import { catalogueShown } from "./ModelSetup";
import { DownloadedModels } from "./DownloadedModels";
import { Alert } from "../../components/ui/Alert";
import { Switch } from "../../components/ui/Switch";
import { readCallPreferences, subscribeCallPreferences, writeCallPreferences, type CallPreferences, type PresenceSound } from "../../services/call-preferences";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { ErrorBoundary } from "../../app/ErrorBoundary";
import "./settings.css";

/* Settings: a screen of their own, its sections beside its content (above it on a phone), and Save at the foot. The
 * runtime opens and closes it by its ids (#language-settings, #settings-close) and saves it on the form's submit
 * (#language-form); which section shows is the store's `settingsSection`, which the runtime also sets (no machine yet,
 * an agent waiting). Save waits while a chosen model is not ready yet, and says so. */

const SECTIONS: { id: string; label: HostMessageKey; icon: ReactNode }[] = [
  { id: "general", label: "settings.section.general", icon: <GeneralIcon /> },
  { id: "transcription", label: "settings.section.transcription", icon: <TranscriptionIcon /> },
  { id: "voice", label: "settings.section.voice", icon: <VoicesIcon /> },
  { id: "call", label: "settings.section.call", icon: <CallSettingsIcon /> },
  { id: "providers", label: "settings.section.providers", icon: <IntegrationsIcon /> },
  { id: "machines", label: "settings.section.machines", icon: <MachinesIcon /> },
  { id: "advanced", label: "settings.section.advanced", icon: <AdvancedIcon /> },
];

function Appearance({ t }: { t: HostTranslate }) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const choose = (next: ThemePreference) => { setTheme(next); setThemePreference(next); };
  return <Segmented size="sm" label={t("settings.appearance")} value={theme} onChange={choose} items={[
    { value: "system", label: t("settings.appearance.system") }, { value: "light", label: t("settings.appearance.light") }, { value: "dark", label: t("settings.appearance.dark") },
  ]} />;
}

function GeneralSettings({ t }: { t: HostTranslate }) {
  return <Section id="general" title={t("settings.section.general")} description={t("settings.general.description")}>
    <Group>
      <Row label={t("settings.general.languageLabel")} description={t("settings.general.languageHint")} htmlFor="ui-language">
        <NativeSelect id="ui-language" defaultValue=""><option value="">{t("settings.general.languageAuto")}</option><option value="es">Español</option><option value="en">English</option></NativeSelect>
      </Row>
      <Row label={t("settings.appearance")} description={t("settings.appearance.hint")}><Appearance t={t} /></Row>
    </Group>
  </Section>;
}

function SlotSection({ id, t }: { id: "transcription" | "voice"; t: HostTranslate }) {
  return <Section id={id} title={t(id === "transcription" ? "settings.section.transcription" : "settings.section.voice")}
    description={t(id === "transcription" ? "settings.transcription.description" : "settings.voice.description")}>
    <RestartNote t={t} />
    <SlotPane task={id === "transcription" ? "stt" : "tts"} />
  </Section>;
}

/** The call's own behaviour: when your turn ends (kept on Save), the sound while the agent works and the screen during
 *  a call (this device's, applied at once). */
function CallSettings({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const ready = useRoomStore((state) => catalogueShown(state.facts.voiceCatalogue));
  const [prefs, setPrefs] = useState(readCallPreferences);
  useEffect(() => subscribeCallPreferences(() => setPrefs(readCallPreferences())), []);
  const set = (patch: Partial<CallPreferences>) => setPrefs(writeCallPreferences(patch));
  const wakeLock = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const presence: { value: PresenceSound; label: HostMessageKey }[] = [
    { value: "off", label: "settings.call.presence.off" }, { value: "hidden", label: "settings.call.presence.hidden" }, { value: "always", label: "settings.call.presence.always" },
  ];
  return <Section id="call" title={t("settings.section.call")} description={t("settings.call.description")}>
    <RestartNote t={t} />
    {ready && draft ? <TurnChoices draft={draft} /> : <p className="muted" role="status">{t("voice.loading")}</p>}
    <Group title={t("settings.call.working")}>
      <Row label={t("settings.call.presence")} description={t(prefs.presence === "off" ? "settings.call.presence.offHint" : prefs.presence === "hidden" ? "settings.call.presence.hiddenHint" : "settings.call.presence.alwaysHint")}>
        <Segmented size="sm" label={t("settings.call.presence")} value={prefs.presence} onChange={(value) => set({ presence: value })}
          items={presence.map((option) => ({ value: option.value, label: t(option.label) }))} />
      </Row>
    </Group>
    <Group title={t("settings.call.device")}>
      <Row label={t("settings.call.keepAwake")} description={wakeLock ? t("settings.call.keepAwakeHint") : t("settings.call.keepAwakeUnsupported")}>
        <Switch checked={prefs.keepAwake && wakeLock} disabled={!wakeLock} onChange={(keepAwake) => set({ keepAwake })} aria-label={t("settings.call.keepAwake")} />
      </Row>
    </Group>
  </Section>;
}

/** What changing a source, a model or when a turn ends does during a call: the voice restarts for a moment. Said only
 *  while a call is on. */
function RestartNote({ t }: { t: HostTranslate }) {
  const inCall = useRoomStore((state) => !!(state.facts.ws || state.facts.reconnecting));
  return inCall ? <Alert tone="warning" title={t("settings.restart.title")}>{t("voice.restartNote")}</Alert> : null;
}

/** For diagnosis and recovery, and the engine's internals: models' memory, this device's settings, the build. */
function AdvancedSettings({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const build = (window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId ?? "dev";
  return <Section id="advanced" title={t("settings.section.advanced")} description={t("settings.advanced.description")}>
    {draft && <Group title={t("settings.advanced.models")}><IdleUnloadChoice draft={draft} /><DownloadedModels /></Group>}
    <Group title={t("settings.general.device")}>
      <Row label={t("settings.general.reset")} description={<>{t("settings.general.deviceHint")} <span id="reset-settings-note" role="status" /></>}>
        <Button id="reset-settings" variant="ghost" tone="danger" size="sm" aria-label={t("settings.general.reset")}>{t("settings.general.resetShort")}</Button>
      </Row>
      <Row label={t("settings.general.build")}><code id="build-id" className="settings-build">{build}</code></Row>
    </Group>
  </Section>;
}

function Pane({ id, current, children }: { id: string; current: string; children: ReactNode }) {
  // A section that fails to draw says so in its own place; the other sections, and Save, stay.
  return <div id={"pane-" + id} className="settings-pane" role="tabpanel" aria-labelledby={"settings-" + id} hidden={id !== current}><ErrorBoundary area={"settings:" + id}>{children}</ErrorBoundary></div>;
}

/** How Settings is headed (VARIANTS `settings-header`): its own header (A), or the room's kept in place, the brand where
 *  it always is and Settings after it as a breadcrumb (B). */
const SETTINGS_HEADER = ["own", "app"] as const;

export function SettingsDialog() {
  const t = hostTranslator();
  const header = useVariant("settings-header", SETTINGS_HEADER);
  const machinesLayout = useVariant("machines", MACHINES_LAYOUT);
  const store = useContext(RoomStoreContext);
  const current = useRoomStore((state) => state.facts.settingsSection) || "general";
  const waits = useVoiceReadiness();
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const show = (section: string) => store?.patch({ settingsSection: section });
  const blocked = waits.stt || waits.tts || waits.turn;
  const reason = waits.stt ? t("settings.save.waitTranscription") : waits.tts ? t("settings.save.waitVoice") : waits.turn ? t("settings.save.waitTurn") : "";
  return (
    <dialog ref={setDialog} id="language-settings" className="ui-dialog settings-page" data-layout="page" data-header={header} aria-labelledby="settings-title">
      <OverlayPortalProvider container={dialog}>
        <DialogSurface titleId="settings-title" closeId="settings-close" closeable flush closeLabel={t("settings.close")}
          title={header === "app" ? <span className="settings-crumb"><SidevoiceMark size={22} /><span className="settings-crumb-brand">Sidevoice</span><span className="settings-crumb-sep" aria-hidden="true">·</span><span>{t("settings.title")}</span></span> : t("settings.title")}
          footer={<>
            <p id="settings-error" className="settings-error" role="alert" />
            {blocked && <p className="ui-dialog-reason" id="settings-save-reason">{reason}</p>}
            <Button type="submit" form="language-form" variant="primary" disabled={blocked} blockedBy="settings-save-reason"
              onBlocked={() => show(waits.stt ? "transcription" : waits.tts ? "voice" : "call")}>{t("settings.save")}</Button>
          </>}>
          <form id="language-form" className="settings-layout">
            <nav className="ui-nav settings-nav" aria-label={t("settings.sections")}>
              {SECTIONS.map((section) => <Fragment key={section.id}><button type="button" id={"settings-" + section.id} className="ui-nav-item" aria-controls={"pane-" + section.id}
                aria-current={section.id === current ? section.id === "machines" && machinesLayout === "c" ? "true" : "page" : undefined} onClick={() => show(section.id)}>
                {section.icon}<span>{t(section.label)}</span>
                {((section.id === "transcription" && waits.stt) || (section.id === "voice" && waits.tts) || (section.id === "call" && waits.turn)) && <Badge tone="warning" className="ui-nav-badge" title={t("settings.section.waiting")}>{t("settings.section.notReady")}</Badge>}
              </button>
              {/* Machines as Paseo's settings lay them out (VARIANTS machines C): the machine and its parts under it. */}
              {section.id === "machines" && machinesLayout === "c" && <MachineNav current={current === "machines"} />}
              </Fragment>)}
            </nav>
            <div className="settings-content">
              <div className="settings-column">
                <Pane id="general" current={current}><GeneralSettings t={t} /></Pane>
                <Pane id="transcription" current={current}><SlotSection id="transcription" t={t} /></Pane>
                <Pane id="voice" current={current}><SlotSection id="voice" t={t} /></Pane>
                <Pane id="call" current={current}><CallSettings t={t} /></Pane>
                <Pane id="providers" current={current}><ProviderKeys /></Pane>
                <Pane id="machines" current={current}><MachineList /></Pane>
                <Pane id="advanced" current={current}><AdvancedSettings t={t} /></Pane>
              </div>
            </div>
          </form>
        </DialogSurface>
      </OverlayPortalProvider>
    </dialog>
  );
}
