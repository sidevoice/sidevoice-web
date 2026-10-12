import { Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DialogSurface } from "../../components/ui/Dialog";
import { OverlayPortalProvider } from "../../components/ui/Tooltip";
import { AdvancedIcon, CallSettingsIcon, CheckIcon, GeneralIcon, IntegrationsIcon, MachinesIcon, TranscriptionIcon, VoicesIcon } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { Group, Row, Section } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { readThemePreference, setThemePreference, type ThemePreference } from "../../lib/theme";
import { MachineList, MachineNav } from "../room/MachineList";
import { ProviderKeys } from "./ProviderKeys";
import { IdleUnloadChoice, SlotPane, TurnChoices, useVoiceReadiness } from "./VoiceSettings";
import { catalogueShown } from "./ModelSetup";
import { DeleteUnusedChoice, DownloadedModels } from "./DownloadedModels";
import { DeviceNameField } from "./DeviceNameField";
import { NewOnIcon, useHighlights } from "../highlights/highlights";
import { Alert } from "../../components/ui/Alert";
import { Switch } from "../../components/ui/Switch";
import { readCallPreferences, subscribeCallPreferences, writeCallPreferences, type CallPreferences, type PresenceSound } from "../../services/call-preferences";
import { hostTranslator, type HostTranslate } from "./host-i18n";
import type { HostMessageKey } from "./messages/en";
import { ErrorBoundary } from "../../app/ErrorBoundary";
import { useVoiceSwitch } from "../../state/call-model";
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

export function Appearance({ t }: { t: HostTranslate }) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const choose = (next: ThemePreference) => { setTheme(next); setThemePreference(next); };
  return <Segmented size="sm" label={t("settings.appearance")} value={theme} onChange={choose} items={[
    { value: "system", label: t("settings.appearance.system") }, { value: "light", label: t("settings.appearance.light") }, { value: "dark", label: t("settings.appearance.dark") },
  ]} />;
}

function GeneralSettings({ t }: { t: HostTranslate }) {
  // The runtime keeps it (saved as it is chosen, said to the call); this shows it and asks for a change.
  const language = useRoomStore((state) => state.facts.uiLanguage);
  return <Section id="general" title={t("settings.section.general")} description={t("settings.general.description")}>
    <Group>
      <Row label={t("settings.general.languageLabel")} description={t("settings.general.languageHint")} htmlFor="ui-language">
        <Select id="ui-language" value={language} onValueChange={(next) => window.sidevoiceActions?.setInterfaceLanguage?.(next)}
          options={[{ value: "", label: t("settings.general.languageAuto") }, { value: "es", label: "Español" }, { value: "en", label: "English" }]} />
      </Row>
      <Row label={t("settings.appearance")} description={t("settings.appearance.hint")}><Appearance t={t} /></Row>
      <Row label={t("settings.deviceName")} description={t("settings.deviceName.hint")} htmlFor="device-name"><DeviceNameField id="device-name" /></Row>
    </Group>
  </Section>;
}

function SlotSection({ id, t }: { id: "transcription" | "voice"; t: HostTranslate }) {
  return <Section id={id} title={t(id === "transcription" ? "settings.section.transcription" : "settings.section.voice")}
    description={t(id === "transcription" ? "settings.transcription.description" : "settings.voice.description")}>
    <SlotPane task={id === "transcription" ? "stt" : "tts"} />
  </Section>;
}

/** The call's own behaviour: when your turn ends (kept on Save), the sound while the agent works and the screen during
 *  a call (this device's, applied at once). */
function CallSettings({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const ready = useRoomStore((state) => catalogueShown(state.facts.voiceCatalogue));
  // Every section is drawn, one shown: another section shown stops a try of the end of turn here.
  const shown = useRoomStore((state) => (state.facts.settingsSection || "general") === "call");
  const [prefs, setPrefs] = useState(readCallPreferences);
  useEffect(() => subscribeCallPreferences(() => setPrefs(readCallPreferences())), []);
  const set = (patch: Partial<CallPreferences>) => setPrefs(writeCallPreferences(patch));
  const wakeLock = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const voiceSwitch = useVoiceSwitch();
  const presence: { value: PresenceSound; label: HostMessageKey }[] = [
    { value: "off", label: "settings.call.presence.off" }, { value: "hidden", label: "settings.call.presence.hidden" }, { value: "always", label: "settings.call.presence.always" },
  ];
  return <Section id="call" title={t("settings.section.call")} description={t("settings.call.description")}>
    <RestartNote t={t} />
    {ready && draft ? <TurnChoices draft={draft} active={shown} /> : <p className="muted" role="status">{t("voice.loading")}</p>}
    <Group title={t("settings.call.working")}>
      <Row label={t("settings.call.presence")} description={t(prefs.presence === "off" ? "settings.call.presence.offHint" : prefs.presence === "hidden" ? "settings.call.presence.hiddenHint" : "settings.call.presence.alwaysHint")}>
        <Segmented size="sm" label={t("settings.call.presence")} value={prefs.presence} onChange={(value) => set({ presence: value })}
          items={presence.map((option) => ({ value: option.value, label: t(option.label) }))} />
      </Row>
    </Group>
    <Group title={t("settings.call.device")}>
      <Row label={t(voiceSwitch ? "settings.call.keepAwakeVoice" : "settings.call.keepAwake")} description={wakeLock ? t(voiceSwitch ? "settings.call.keepAwakeVoiceHint" : "settings.call.keepAwakeHint") : t("settings.call.keepAwakeUnsupported")}>
        <Switch checked={prefs.keepAwake && wakeLock} disabled={!wakeLock} onChange={(keepAwake) => set({ keepAwake })} aria-label={t(voiceSwitch ? "settings.call.keepAwakeVoice" : "settings.call.keepAwake")} />
      </Row>
    </Group>
  </Section>;
}

/** What switching between Smart and Silence does during a call: the voice restarts for a moment (a source or a model
 *  changes without a cut — the new one takes over once it is ready). Said only while a call is on, in Call. */
function RestartNote({ t }: { t: HostTranslate }) {
  // With the voice switch (call model B) it is the voice being on that a restart interrupts.
  const voiceSwitch = useVoiceSwitch();
  const inCall = useRoomStore((state) => (voiceSwitch ? state.facts.voiceOn : !!(state.facts.ws || state.facts.reconnecting)));
  return inCall ? <Alert tone="warning" title={t(voiceSwitch ? "settings.restart.voiceOn" : "settings.restart.title")}>{t("voice.restartNote")}</Alert> : null;
}

/** For diagnosis and recovery, and the engine's internals: models' memory, this device's settings, the build. */
function AdvancedSettings({ t }: { t: HostTranslate }) {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const build = (window as unknown as { sidevoiceBuildId?: string }).sidevoiceBuildId ?? "dev";
  return <Section id="advanced" title={t("settings.section.advanced")} description={t("settings.advanced.description")}>
    {draft && <Group title={t("settings.advanced.models")}><IdleUnloadChoice draft={draft} /><DeleteUnusedChoice /><DownloadedModels /></Group>}
    <Group title={t("settings.general.device")}>
      <Row label={t("settings.general.reset")} description={<>{t("settings.general.deviceHint")} <span id="reset-settings-note" role="status" /></>}>
        <Button id="reset-settings" variant="ghost" tone="danger" size="sm" aria-label={t("settings.general.reset")}>{t("settings.general.resetShort")}</Button>
      </Row>
      <Row label={t("settings.general.build")}><code id="build-id" className="settings-build">{build}</code></Row>
    </Group>
  </Section>;
}

/** "Saved", for a moment after a setting is kept: settings apply as they change, with no Save to press. */
function SavedNote({ at, t }: { at: number; t: HostTranslate }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (!at) return;
    setShown(true);
    const timer = window.setTimeout(() => setShown(false), 2000);
    return () => window.clearTimeout(timer);
  }, [at]);
  return <span className="settings-saved" role="status">{shown ? <><CheckIcon size={14} />{t("settings.saved")}</> : null}</span>;
}

function Pane({ id, current, children }: { id: string; current: string; children: ReactNode }) {
  // A section that fails to draw says so in its own place; the other sections, and Save, stay.
  return <div id={"pane-" + id} className="settings-pane" role="tabpanel" aria-labelledby={"settings-" + id} hidden={id !== current}><ErrorBoundary area={"settings:" + id}>{children}</ErrorBoundary></div>;
}

export function SettingsDialog() {
  const t = hostTranslator();
  const store = useContext(RoomStoreContext);
  const current = useRoomStore((state) => state.facts.settingsSection) || "general";
  // A section changed (or a machine within Machines) starts at its top, not where the last one was scrolled to.
  const content = useRef<HTMLDivElement>(null);
  const machine = useRoomStore((state) => state.facts.machinesView?.machine ?? null);
  useEffect(() => { content.current?.scrollTo?.({ top: 0 }); }, [current, machine]);
  const waits = useVoiceReadiness();
  const news = useHighlights();
  const savedAt = useRoomStore((state) => state.facts.settingsSavedAt);
  const focus = useRoomStore((state) => state.facts.settingsFocus);
  // A control asked for (what's new's Set up): in view, focused, and lit for a moment, once its section is drawn.
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    const find = () => {
      const control = document.getElementById(focus);
      if (!control && ++tries < 20) { timer = window.setTimeout(find, 100); return; }
      store?.patch({ settingsFocus: null });
      if (!control) return;
      const row = control.closest(".ui-row") ?? control;
      row.scrollIntoView?.({ block: "center" });
      control.focus({ preventScroll: true });
      row.classList.add("settings-highlight");
      window.setTimeout(() => row.classList.remove("settings-highlight"), 2400);
    };
    let timer = window.setTimeout(find, 0);
    return () => window.clearTimeout(timer);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const show = (section: string) => store?.patch({ settingsSection: section });
  return (
    <dialog ref={setDialog} id="language-settings" className="ui-dialog settings-page" data-layout="page" aria-labelledby="settings-title">
      <OverlayPortalProvider container={dialog}>
        <DialogSurface titleId="settings-title" closeId="settings-close" closeable flush closeLabel={t("settings.close")}
          title={t("settings.title")}
>
          {/* No Save: every setting applies as it changes; what fails says so here. */}
          <form id="language-form" className="settings-layout">
            <nav className="ui-nav settings-nav" aria-label={t("settings.sections")}>
              {SECTIONS.map((section) => <Fragment key={section.id}><button type="button" id={"settings-" + section.id} className="ui-nav-item" aria-controls={"pane-" + section.id}
                aria-current={section.id === current ? section.id === "machines" ? "true" : "page" : undefined}
                onClick={() => section.id === "machines" ? store?.patch({ settingsSection: "machines", machinesView: { machine: null } }) : show(section.id)}>
                <NewOnIcon icon={section.icon} isNew={news.some((item) => item.section === section.id)} label={t("highlights.navNew")} /><span>{t(section.label)}</span>
                {((section.id === "transcription" && waits.stt) || (section.id === "voice" && waits.tts) || (section.id === "call" && waits.turn)) && <Badge tone="warning" className="ui-nav-badge" title={t("settings.section.waiting")}>{t("settings.section.notReady")}</Badge>}
              </button>
              {/* Each machine under Machines, and Add a machine after them. */}
              {section.id === "machines" && <MachineNav current={current === "machines"} />}
              </Fragment>)}
            </nav>
            <div className="settings-content" ref={content}>
              <p id="settings-error" className="settings-error" role="alert" />
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
