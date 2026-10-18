import { Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DialogSurface } from "../../components/ui/Dialog";
import { OverlayPortalProvider, Tooltip } from "../../components/ui/Tooltip";
import { AdvancedIcon, ArrowLeftIcon, BackIcon, CallSettingsIcon, CheckIcon, GeneralIcon, IntegrationsIcon, MachinesIcon, ShortcutsIcon, PermissionsIcon, TranscriptionIcon, VoicesIcon, ThisComputerIcon, OtherMachineIcon, UpdateIcon, WarningIcon } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { Select } from "../../components/ui/Select";
import { LanguagePicker } from "../../components/ui/LanguagePicker";
import { Group, Row, Section } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { readThemePreference, setThemePreference, type ThemePreference } from "../../lib/theme";
import { MachineList, MachineNav, machineName, ThisComputerSettings, useMachinesSummary } from "../room/MachineList";
import { useThisComputerSection } from "../../state/this-computer";
import { ProviderKeys } from "./ProviderKeys";
import { IdleUnloadChoice, SlotPane, TurnChoices, useVoiceReadiness } from "./VoiceSettings";
import { catalogueShown } from "./ModelSetup";
import { DeleteUnusedChoice, DownloadedModels } from "./DownloadedModels";
import { DangerZone } from "./DangerZone";
import { AudioDeviceRows } from "../call/AudioDevices";
import { DeviceNameField } from "./DeviceNameField";
import { DesktopCallSettings } from "./DesktopCallSettings";
import { desktopHost } from "../../services/desktop-host";
import { PermissionsSettings } from "./PermissionsSettings";
import { useMicrophoneAccess } from "../permissions/permission-view";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { ShortcutsSettings, useShortcutsSection } from "./ShortcutsSettings";
import { NewAtEnd, NewOnIcon, useHighlights } from "../highlights/highlights";
import { machineStatus, type MachineStatus } from "./machine-status";
import { MachineEntryCopy, MachineEntryState, StateOnIcon, machineEntryName } from "./MachineState";
import { Alert } from "../../components/ui/Alert";
import { ErrorText } from "../../components/ui/ErrorText";
import { Switch } from "../../components/ui/Switch";
import { readCallPreferences, subscribeCallPreferences, writeCallPreferences, type CallPreferences, type PresenceSound } from "../../services/call-preferences";
import { languageName, translator, UI_LANGUAGES, type MessageKey, type Translate } from "../../i18n/translator";
import { ErrorBoundary } from "../../app/ErrorBoundary";
import { remoteProviders } from "../../services/voice-settings.js";
import { useDialogFocusReturn } from "../../lib/focus-return";
import { motionOf, SettingsLevelsProvider, useSectionShown, useSettingsLevelsOf } from "./settings-levels";
import { MenuRow } from "./SettingsMenu";
import { UpdatesSettings, useUpdatesSection } from "./UpdatesSettings";
import "./settings.css";

/* Settings: a screen of their own, its sections beside its content on a desktop; on a phone a menu of them, each
 * section a page of its own under it (settings-levels.tsx). The runtime opens and closes it by its ids
 * (#language-settings, #settings-close) and says what fails under its header (#settings-error, the store's
 * `settingsError`), whatever shows; which section shows is the store's `settingsSection`, which the runtime also sets
 * (no machine yet, an agent waiting). There is no Save: every setting applies as it changes. */

/** Each section in the nav's order, its icon drawn at the size asked (the nav's, by default; a phone's row, 20px). */
const SECTIONS: { id: string; label: MessageKey; icon: (size?: number) => ReactNode }[] = [
  { id: "general", label: "settings.section.general", icon: (size) => <GeneralIcon size={size} /> },
  { id: "transcription", label: "settings.section.transcription", icon: (size) => <TranscriptionIcon size={size} /> },
  { id: "voice", label: "settings.section.voice", icon: (size) => <VoicesIcon size={size} /> },
  { id: "call", label: "settings.section.call", icon: (size) => <CallSettingsIcon size={size} /> },
  // What the call needs this device to allow (the microphone), next to where its devices are chosen.
  { id: "permissions", label: "settings.section.permissions", icon: (size) => <PermissionsIcon size={size} /> },
  // The keys for the microphone: in the desktop app, or wherever there is a keyboard (ShortcutsSettings).
  { id: "shortcuts", label: "settings.section.shortcuts", icon: (size) => <ShortcutsIcon size={size} /> },
  // The keys the voice's models use, right after them; this device and the other machines then side by side (2026-10-16).
  { id: "providers", label: "settings.section.providers", icon: (size) => <IntegrationsIcon size={size} /> },
  { id: "this-computer", label: "settings.section.thisDevice", icon: (size = 18) => <ThisComputerIcon size={size} /> },
  { id: "machines", label: "settings.section.machines", icon: (size) => <MachinesIcon size={size} /> },
  // Everything that updates: in the desktop app, or wherever a machine is behind (UpdatesSettings).
  { id: "updates", label: "settings.section.updates", icon: (size) => <UpdateIcon size={size} /> },
  { id: "advanced", label: "settings.section.advanced", icon: (size) => <AdvancedIcon size={size} /> },
];

/** What a place asked for (`settingsFocus`) can focus: a control that takes it now. */
const FOCUSABLE = "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])";

export function Appearance({ t }: { t: Translate }) {
  const [theme, setTheme] = useState<ThemePreference>(readThemePreference);
  const choose = (next: ThemePreference) => { setTheme(next); setThemePreference(next); };
  return <Segmented size="sm" label={t("settings.appearance")} value={theme} onChange={choose} items={[
    { value: "system", label: t("settings.appearance.system") }, { value: "light", label: t("settings.appearance.light") }, { value: "dark", label: t("settings.appearance.dark") },
  ]} />;
}

function GeneralSettings({ t }: { t: Translate }) {
  // The runtime keeps it (saved as it is chosen, said to the call); this shows it and asks for a change.
  const language = useRoomStore((state) => state.facts.uiLanguage);
  return <Section id="general" title={t("settings.section.general")} description={t("settings.general.description")}>
    <Group>
      <Row label={t("settings.appearance")} description={t("settings.appearance.hint")}><Appearance t={t} /></Row>
      <Row label={t("settings.deviceName")} description={t("settings.deviceName.hint")} htmlFor="device-name"><DeviceNameField id="device-name" /></Row>
      <Row label={t("settings.general.languageLabel")} description={t("settings.general.languageHint")} htmlFor="ui-language">
        <LanguagePicker id="ui-language" value={language} label={t("settings.general.languageLabel")} showLanguageIcon={false} onValueChange={(next) => window.sidevoiceActions?.setInterfaceLanguage?.(next)}
          options={[{ value: "", label: t("settings.general.languageAuto") }, ...UI_LANGUAGES.map((value) => ({ value, label: languageName(value) }))]} />
      </Row>
    </Group>
  </Section>;
}

function SlotSection({ id, t }: { id: "transcription" | "voice"; t: Translate }) {
  return <Section id={id} title={t(id === "transcription" ? "settings.section.transcription" : "settings.section.voice")}
    description={t(id === "transcription" ? "settings.transcription.description" : "settings.voice.description")}>
    <SlotPane task={id === "transcription" ? "stt" : "tts"} />
  </Section>;
}

/** The call's own behaviour: when your turn ends (kept on Save), the sound while the agent works and the screen during
 *  a call (this device's, applied at once). */
function CallSettings({ t, microphone }: { t: Translate; microphone: MicrophoneSnapshot | null }) {
  const store = useContext(RoomStoreContext);
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const ready = useRoomStore((state) => catalogueShown(state.facts.voiceCatalogue));
  // Every section is drawn, one shown: another section shown (or, on a phone, the list of them, or Settings closed)
  // stops a try of the end of turn here.
  const shown = useSectionShown("call");
  const [prefs, setPrefs] = useState(readCallPreferences);
  useEffect(() => subscribeCallPreferences(() => setPrefs(readCallPreferences())), []);
  const set = (patch: Partial<CallPreferences>) => setPrefs(writeCallPreferences(patch));
  const wakeLock = typeof navigator !== "undefined" && "wakeLock" in navigator;
  const presence: { value: PresenceSound; label: MessageKey }[] = [
    { value: "off", label: "settings.call.presence.off" }, { value: "hidden", label: "settings.call.presence.hidden" }, { value: "always", label: "settings.call.presence.always" },
  ];
  return <Section id="call" title={t("settings.section.call")} description={t("settings.call.description")}>
    <RestartNote t={t} />
    {/* The microphone not allowed: a call can't hear you. The way to allow it is in Permissions. */}
    {microphone && (microphone.state === "prompt" || microphone.state === "requesting" || microphone.state === "denied" || microphone.state === "missing") &&
      <Alert tone="warning" title={t(microphone.state === "denied" ? "settings.call.micNotAllowed" : "call.needsMic")} action={<Button type="button" variant="secondary" size="sm" onClick={() => store?.patch({ settingsSection: "permissions", settingsLevel: "page" })}>{t("settings.call.openPermissions")}</Button>} />}
    {/* The microphone and the speaker, as the call's own panel chooses them. */}
    <AudioDeviceRows />
    {ready && draft ? <TurnChoices draft={draft} active={shown} /> : <p className="muted" role="status">{t("voice.loading")}</p>}
    <Group title={t("settings.call.working")}>
      <Row label={t("settings.call.presence")} description={t(prefs.presence === "off" ? "settings.call.presence.offHint" : prefs.presence === "hidden" ? "settings.call.presence.hiddenHint" : "settings.call.presence.alwaysHint")}>
        <Segmented size="sm" label={t("settings.call.presence")} value={prefs.presence} onChange={(value) => set({ presence: value })}
          items={presence.map((option) => ({ value: option.value, label: t(option.label) }))} />
      </Row>
      <DesktopCallSettings t={t} />
    </Group>
    {/* The desktop app keeps its computer awake as any app does; holding the screen on is for a browser or a phone. */}
    {!desktopHost() && <Group title={t("settings.call.device")}>
      <Row label={t("settings.call.keepAwake")} description={wakeLock ? t("settings.call.keepAwakeHint") : t("settings.call.keepAwakeUnsupported")}>
        <Switch checked={prefs.keepAwake && wakeLock} disabled={!wakeLock} onChange={(keepAwake) => set({ keepAwake })} aria-label={t("settings.call.keepAwake")} />
      </Row>
    </Group>}
  </Section>;
}

/** What switching between Smart and Silence does during a call: the voice restarts for a moment (a source or a model
 *  changes without a cut — the new one takes over once it is ready). Said only while a call is on, in Call. */
function RestartNote({ t }: { t: Translate }) {
  const inCall = useRoomStore((state) => !!(state.facts.ws || state.facts.reconnecting));
  return inCall ? <Alert tone="warning" title={t("settings.restart.title")}>{t("voice.restartNote")}</Alert> : null;
}

/** For diagnosis and the engine's internals: models' memory, this device's settings, the build. */
function AdvancedSettings({ t }: { t: Translate }) {
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
    {/* Last, in red: deleting Sidevoice's data or Sidevoice itself. */}
    <DangerZone />
  </Section>;
}

/** "Saved", for a moment after a setting is kept: settings apply as they change, with no Save to press. */
function SavedNote({ at, t }: { at: number; t: Translate }) {
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
  // A section that fails to draw says so in its own place; the other sections stay. Not a tab panel: the sections are a
  // navigation, not tabs; the section in it is named by its own heading.
  return <div id={"pane-" + id} className="settings-pane" hidden={id !== current}><ErrorBoundary area={"settings:" + id}>{children}</ErrorBoundary></div>;
}

/** What a section's row in a phone's menu says under its name, where the section has one state that says whether it is
 *  set up and working: the model chosen, This device's service (as its entry words it), the providers connected, the
 *  machines. Blank while it is not known yet (the catalogue loading or failed); none for a section of preferences. */
function useSummaries(t: Translate, thisDevice: MachineStatus | null): Record<string, ReactNode> {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const keys = useRoomStore((state) => state.facts.providerKeys);
  const machines = useMachinesSummary();
  const known = catalogueShown(catalogue);
  // The model's id, as the slot's own model list names it.
  const model = (task: "stt" | "tts") => !known ? "" : draft?.[task].model || t("settings.summary.noModel");
  const connected = remoteProviders(catalogue.catalogs).filter((provider: { id: string }) => keys[provider.id] === true).map((provider: { name: string }) => provider.name);
  return {
    transcription: model("stt"), voice: model("tts"), "this-computer": <MachineEntryState status={thisDevice} />,
    providers: !known ? "" : connected.length ? connected.join(", ") : t("settings.summary.providersNone"),
    machines,
  };
}

/** What failed while Settings was open (the store's `settingsError`): its sentence, what was raw about it behind Details. */
function SettingsError() {
  const error = useRoomStore((state) => state.facts.settingsError);
  return <div id="settings-error" className="settings-error" role="alert">{error && <ErrorText message={error} />}</div>;
}

export function SettingsDialog() {
  const t = translator();
  const store = useContext(RoomStoreContext);
  const current = useRoomStore((state) => state.facts.settingsSection) || "general";
  // This computer as a section of its own, where this device can host.
  const ownComputer = useThisComputerSection();
  const content = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  // The runtime closes it (#settings-close, Escape): focus back on what opened it, else on a Settings button
  // (aria-controls), never on whatever follows (focus-return.ts).
  useDialogFocusReturn(dialog);
  const { levels, said } = useSettingsLevelsOf(dialog, { nav, content });
  const { phone, level, motion } = levels;
  const machine = useRoomStore((state) => state.facts.machinesView?.machine ?? null);
  // A section changed (or a machine within Machines) starts at its top, not where the last one was scrolled to. A
  // phone's levels keep and restore their own.
  useEffect(() => { if (!phone) content.current?.scrollTo?.({ top: 0 }); }, [current, machine]); // eslint-disable-line react-hooks/exhaustive-deps
  const waits = useVoiceReadiness();
  const news = useHighlights();
  // This device's state, as its section's entry says it (only shown where the app reads its service).
  const localMachine = useRoomStore((state) => state.machines.find((item) => item.local) ?? null);
  const localStatus = useRoomStore((state) => state.facts.localHostStatus);
  const thisDevice = machineStatus(localMachine, localStatus, true, t);
  const summaries = useSummaries(t, thisDevice);
  const savedAt = useRoomStore((state) => state.facts.settingsSavedAt);
  const focus = useRoomStore((state) => state.facts.settingsFocus);
  // A place asked for, once its section is drawn (it may come later: an update found as the app answers): in view, lit
  // for a moment, and focused — a control itself (This device's rename, an update's Download), else the first one in it
  // (a remote machine's update row: its command's Copy). Its row is what is lit: a setting's, an update's, or itself.
  useEffect(() => {
    if (!focus) return;
    let tries = 0;
    const find = () => {
      const place = document.getElementById(focus);
      if (!place && ++tries < 20) { timer = window.setTimeout(find, 100); return; }
      store?.patch({ settingsFocus: null });
      if (!place) return;
      const control = place.matches(FOCUSABLE) ? place : place.querySelector<HTMLElement>(FOCUSABLE);
      const row = place.closest<HTMLElement>(".ui-row, [data-settings-row]") ?? place;
      row.scrollIntoView?.({ block: "center" });
      control?.focus({ preventScroll: true });
      row.classList.add("settings-highlight");
      window.setTimeout(() => row.classList.remove("settings-highlight"), 2400);
    };
    let timer = window.setTimeout(find, 0);
    return () => window.clearTimeout(timer);
  }, [focus]); // eslint-disable-line react-hooks/exhaustive-deps
  // This device's page shown on a phone when this device stops having it (no longer able to host): the list, its title.
  useEffect(() => {
    if (phone && level === 2 && current === "this-computer" && !ownComputer) levels.back({ instantly: true, focus: "title" });
  }, [phone, level, current, ownComputer]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = (section: string) => store?.patch({ settingsSection: section });
  // Updates: in the desktop app, or wherever a machine is behind.
  const updatesShown = useUpdatesSection();
  // Shortcuts: in the desktop app, or wherever there is a keyboard; never on a phone.
  const shortcutsShown = useShortcutsSection();
  // The microphone's reader, one for Permissions and Call's link to it. Permissions is drawn only where there is
  // something to ask (not in an app that asks for itself when its call opens, nor a page with no microphone).
  const mic = useMicrophoneAccess();
  const permissionsShown = mic.microphone?.state !== "none";
  const sections = SECTIONS.filter((section) => (section.id !== "this-computer" || ownComputer) && (section.id !== "updates" || updatesShown)
    && (section.id !== "shortcuts" || shortcutsShown) && (section.id !== "permissions" || permissionsShown));
  // Updates shown as the last machine behind is updated (a browser, a phone), or Shortcuts as the mouse or trackpad
  // goes (a tablet's keyboard taken off): General.
  useEffect(() => {
    if ((current === "updates" && !updatesShown) || (current === "shortcuts" && !shortcutsShown) || (current === "permissions" && !permissionsShown)) show("general");
  }, [current, updatesShown, shortcutsShown, permissionsShown]); // eslint-disable-line react-hooks/exhaustive-deps
  const label = (id: string) => t(ownComputer && id === "machines" ? "settings.section.remoteMachines" : SECTIONS.find((section) => section.id === id)?.label ?? "settings.title");
  // This device's icon wears its connected dot, as a machine's does.
  const icon = (id: string, size?: number) => ownComputer && id === "machines" ? <OtherMachineIcon size={size ?? 18} />
    : id === "this-computer" ? <StateOnIcon icon={SECTIONS.find((section) => section.id === id)!.icon(size)} status={thisDevice} />
      : SECTIONS.find((section) => section.id === id)!.icon(size);
  // How many new things are under a section (its mark, VARIANTS `section-new`).
  const isNew = (id: string) => news.filter((item) => item.section === id).length;
  // What needs attention wears the one warning dot the app uses (the stage's title has it too; operator, 2026-10-16):
  // a model chosen but not ready, or the microphone not allowed; said in words on hover and to assistive tech.
  const micBlocked = ["prompt", "requesting", "denied", "missing"].includes(mic.microphone?.state ?? "");
  const attention = (id: string): MessageKey | null => (id === "transcription" && waits.stt) || (id === "voice" && waits.tts) || (id === "call" && waits.turn)
    ? "settings.section.waiting" : id === "permissions" && micBlocked ? "settings.call.micNotAllowed" : null;
  const badge = (id: string) => { const why = attention(id); return why && <Tooltip content={t(why)}><span className="ui-nav-badge settings-attention" role="img" aria-label={t(why)} /></Tooltip>; };
  // A phone's header says where the person is: Settings on the list, the section on its page, the machine on its own.
  const shownMachine = useRoomStore((state) => state.machines.find((entry) => entry.id === machine) ?? null);
  const title = !phone || level === 1 ? t("settings.title") : level === 3 && shownMachine ? machineName(shownMachine, t) : label(current);
  const parent = level === 3 ? label("machines") : t("settings.title");
  // A slide between the list and a page moves them both; between Machines' list and a machine's page, only what is in it.
  const across = motion && (motion.from === 1 || motion.to === 1) ? motion : null;
  const navShown = !phone || level === 1 || !!across;
  const pageShown = !phone || level > 1 || !!across;
  return (
    <dialog ref={setDialog} id="language-settings" className="ui-dialog settings-page" data-layout="page" data-phone={phone || undefined}
      // Named Settings at every level (a deep link to Call is not "Call, dialog"); the title says the level.
      aria-labelledby={phone ? undefined : "settings-title"} aria-label={phone ? t("settings.title") : undefined}>
      <OverlayPortalProvider container={dialog}>
        <SettingsLevelsProvider value={levels}>
        <DialogSurface titleId="settings-title" flush title={title} titleFocusable={phone}
          // Leaving Settings is a back arrow before the title (the runtime binds #settings-close; Esc closes too). A
          // phone's page goes back to its list there instead: the arrow that leaves stays in the page, hidden.
          leading={<>
            {phone && level > 1 && <Button variant="ghost" tone="neutral" size="icon" className="settings-back" aria-label={t("settings.backTo", { page: parent })} title={t("settings.back")}
              onClick={() => levels.back()}><BackIcon size={20} /></Button>}
            <Button id="settings-close" variant="ghost" tone="neutral" size="icon" className="settings-back" hidden={phone && level > 1}
              aria-label={t("settings.leave")} title={t("settings.close")}><ArrowLeftIcon /></Button>
          </>}>
          {/* No Save: every setting applies as it changes. */}
          <form id="language-form" className="settings-layout">
            {/* What fails says so here, under the header, whichever level shows. */}
            <SettingsError />
            <nav ref={nav} className="ui-nav settings-nav" aria-label={t("settings.sections")} hidden={!navShown}
              inert={motionOf(across, 1)?.startsWith("out") || undefined} data-motion={motionOf(across, 1)}>
              {phone ? <ul className="settings-menu">
                  {sections.map((section) => <li key={section.id}>
                    <MenuRow id={"settings-" + section.id} aria-controls={"pane-" + section.id} icon={<NewOnIcon icon={icon(section.id, 20)} isNew={isNew(section.id)} />}
                      // This device is a machine's entry too, named as one: its name, its service's state, new.
                      aria-label={section.id === "this-computer" ? machineEntryName(label(section.id), thisDevice, isNew(section.id), t) : undefined}
                      label={label(section.id)} summary={summaries[section.id]} badge={badge(section.id)} end={<NewAtEnd isNew={isNew(section.id)} spoken={t("highlights.navNew")} />}
                      onClick={() => levels.open(section.id)} />
                  </li>)}
                </ul>
                : sections.map((section) => {
                  // This device is a machine's entry too: its name, and its service's state under it, said in its name.
                  const device = section.id === "this-computer";
                  return <Fragment key={section.id}><button type="button" id={"settings-" + section.id} className={device ? "ui-nav-item this-device-entry" : "ui-nav-item"} aria-controls={"pane-" + section.id}
                    aria-current={section.id === current ? section.id === "machines" ? "true" : "page" : undefined} aria-label={device ? machineEntryName(label(section.id), thisDevice, isNew(section.id), t) : undefined}
                    onClick={() => section.id === "machines" ? store?.patch({ settingsSection: "machines", machinesView: { machine: null } }) : show(section.id)}>
                    <NewOnIcon icon={icon(section.id)} isNew={isNew(section.id)} />
                    {device ? <MachineEntryCopy name={label(section.id)} status={thisDevice} isNew={isNew(section.id)} /> : <span>{label(section.id)}</span>}
                    {badge(section.id)}
                    {!device && <NewAtEnd isNew={isNew(section.id)} spoken={t("highlights.navNew")} />}
                  </button>
                  {/* Each machine under Machines, and Add a machine after them. */}
                  {section.id === "machines" && <MachineNav current={current === "machines"} />}
                  </Fragment>;
                })}
            </nav>
            <div className="settings-content" ref={content} hidden={!pageShown} inert={motionOf(across, 2)?.startsWith("out") || undefined} data-motion={motionOf(across, 2)}>
              <div className="settings-column">
                <Pane id="general" current={current}><GeneralSettings t={t} /></Pane>
                <Pane id="transcription" current={current}><SlotSection id="transcription" t={t} /></Pane>
                <Pane id="voice" current={current}><SlotSection id="voice" t={t} /></Pane>
                <Pane id="call" current={current}><CallSettings t={t} microphone={mic.microphone} /></Pane>
                {permissionsShown && <Pane id="permissions" current={current}><PermissionsSettings t={t} access={mic.access} microphone={mic.microphone} /></Pane>}
                {shortcutsShown && <Pane id="shortcuts" current={current}><ShortcutsSettings t={t} /></Pane>}
                <Pane id="providers" current={current}><ProviderKeys /></Pane>
                {ownComputer && <Pane id="this-computer" current={current}><ThisComputerSettings /></Pane>}
                <Pane id="machines" current={current}><MachineList /></Pane>
                {updatesShown && <Pane id="updates" current={current}><UpdatesSettings /></Pane>}
                <Pane id="advanced" current={current}><AdvancedSettings t={t} /></Pane>
              </div>
            </div>
            {/* Settings' own polite region (a machine forgotten), never the call's. */}
            <p className="sr-only" role="status">{said}</p>
          </form>
        </DialogSurface>
        </SettingsLevelsProvider>
      </OverlayPortalProvider>
    </dialog>
  );
}
