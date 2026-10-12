import { Fragment, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { DialogSurface } from "../../components/ui/Dialog";
import { OverlayPortalProvider } from "../../components/ui/Tooltip";
import { AdvancedIcon, BackIcon, CallSettingsIcon, CheckIcon, GeneralIcon, IntegrationsIcon, MachinesIcon, TranscriptionIcon, VoicesIcon, ThisComputerIcon, OtherMachineIcon } from "../../components/ui/Icons";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { Select } from "../../components/ui/Select";
import { Group, Row, Section } from "../../components/ui/Card";
import { Segmented } from "../../components/ui/Tabs";
import { RoomStoreContext, useRoomStore } from "../../state/room-store";
import { readThemePreference, setThemePreference, type ThemePreference } from "../../lib/theme";
import { MachineList, MachineNav, machineName, ThisComputerSettings, useMachinesSummary, useThisComputerSummary } from "../room/MachineList";
import { useThisComputerSection } from "../../state/this-computer";
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
import { remoteProviders } from "../../services/voice-settings.js";
import { motionOf, SettingsLevelsProvider, useSectionShown, useSettingsLevelsOf } from "./settings-levels";
import { MenuRow } from "./SettingsMenu";
import "./settings.css";

/* Settings: a screen of their own, its sections beside its content on a desktop; on a phone a menu of them, each
 * section a page of its own under it (settings-levels.tsx). The runtime opens and closes it by its ids
 * (#language-settings, #settings-close) and writes what fails under its header (#settings-error), whatever shows; which
 * section shows is the store's `settingsSection`, which the runtime also sets (no machine yet, an agent waiting). There
 * is no Save: every setting applies as it changes. */

/** Each section in the nav's order, its icon drawn at the size asked (the nav's, by default; a phone's row, 20px). */
const SECTIONS: { id: string; label: HostMessageKey; icon: (size?: number) => ReactNode }[] = [
  { id: "general", label: "settings.section.general", icon: (size) => <GeneralIcon size={size} /> },
  { id: "transcription", label: "settings.section.transcription", icon: (size) => <TranscriptionIcon size={size} /> },
  { id: "voice", label: "settings.section.voice", icon: (size) => <VoicesIcon size={size} /> },
  { id: "call", label: "settings.section.call", icon: (size) => <CallSettingsIcon size={size} /> },
  { id: "this-computer", label: "settings.section.thisDevice", icon: (size = 18) => <ThisComputerIcon size={size} /> },
  { id: "providers", label: "settings.section.providers", icon: (size) => <IntegrationsIcon size={size} /> },
  { id: "machines", label: "settings.section.machines", icon: (size) => <MachinesIcon size={size} /> },
  { id: "advanced", label: "settings.section.advanced", icon: (size) => <AdvancedIcon size={size} /> },
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
      <Row label={t("settings.appearance")} description={t("settings.appearance.hint")}><Appearance t={t} /></Row>
      <Row label={t("settings.deviceName")} description={t("settings.deviceName.hint")} htmlFor="device-name"><DeviceNameField id="device-name" /></Row>
      <Row label={t("settings.general.languageLabel")} description={t("settings.general.languageHint")} htmlFor="ui-language">
        <Select id="ui-language" value={language} onValueChange={(next) => window.sidevoiceActions?.setInterfaceLanguage?.(next)}
          options={[{ value: "", label: t("settings.general.languageAuto") }, { value: "es", label: "Español" }, { value: "en", label: "English" }]} />
      </Row>
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
  // Every section is drawn, one shown: another section shown (or, on a phone, the list of them, or Settings closed)
  // stops a try of the end of turn here.
  const shown = useSectionShown("call");
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
  // A section that fails to draw says so in its own place; the other sections stay. Not a tab panel: the sections are a
  // navigation, not tabs; the section in it is named by its own heading.
  return <div id={"pane-" + id} className="settings-pane" hidden={id !== current}><ErrorBoundary area={"settings:" + id}>{children}</ErrorBoundary></div>;
}

/** What a section's row in a phone's menu says under its name, where the section has one state that says whether it is
 *  set up and working: the model chosen, This device's service, the providers connected, the machines. Blank while it
 *  is not known yet (the catalogue loading or failed); none for a section of preferences. */
function useSummaries(t: HostTranslate): Record<string, string | undefined> {
  const draft = useRoomStore((state) => state.facts.voiceDraft ?? state.facts.voiceSettings);
  const catalogue = useRoomStore((state) => state.facts.voiceCatalogue);
  const keys = useRoomStore((state) => state.facts.providerKeys);
  const machines = useMachinesSummary();
  const thisComputer = useThisComputerSummary();
  const known = catalogueShown(catalogue);
  // The model's id, as the slot's own model list names it.
  const model = (task: "stt" | "tts") => !known ? "" : draft?.[task].model || t("settings.summary.noModel");
  const connected = remoteProviders(catalogue.catalogs).filter((provider: { id: string }) => keys[provider.id] === true).map((provider: { name: string }) => provider.name);
  return {
    transcription: model("stt"), voice: model("tts"), "this-computer": thisComputer,
    providers: !known ? "" : connected.length ? connected.join(", ") : t("settings.summary.providersNone"),
    machines,
  };
}

export function SettingsDialog() {
  const t = hostTranslator();
  const store = useContext(RoomStoreContext);
  const current = useRoomStore((state) => state.facts.settingsSection) || "general";
  // This computer as a section of its own, where this device can host.
  const ownComputer = useThisComputerSection();
  const content = useRef<HTMLDivElement>(null);
  const nav = useRef<HTMLElement>(null);
  const [dialog, setDialog] = useState<HTMLDialogElement | null>(null);
  const { levels, said } = useSettingsLevelsOf(dialog, { nav, content });
  const { phone, level, motion } = levels;
  const machine = useRoomStore((state) => state.facts.machinesView?.machine ?? null);
  // A section changed (or a machine within Machines) starts at its top, not where the last one was scrolled to. A
  // phone's levels keep and restore their own.
  useEffect(() => { if (!phone) content.current?.scrollTo?.({ top: 0 }); }, [current, machine]); // eslint-disable-line react-hooks/exhaustive-deps
  const waits = useVoiceReadiness();
  const news = useHighlights();
  const summaries = useSummaries(t);
  const savedAt = useRoomStore((state) => state.facts.settingsSavedAt);
  const focus = useRoomStore((state) => state.facts.settingsFocus);
  // A control asked for (This device's rename): in view, focused, and lit for a moment, once its section is drawn.
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
  // This device's page shown on a phone when this device stops having it (no longer able to host): the list, its title.
  useEffect(() => {
    if (phone && level === 2 && current === "this-computer" && !ownComputer) levels.back({ instantly: true, focus: "title" });
  }, [phone, level, current, ownComputer]); // eslint-disable-line react-hooks/exhaustive-deps
  const show = (section: string) => store?.patch({ settingsSection: section });
  const sections = SECTIONS.filter((section) => section.id !== "this-computer" || ownComputer);
  const label = (id: string) => t(ownComputer && id === "machines" ? "settings.section.remoteMachines" : SECTIONS.find((section) => section.id === id)?.label ?? "settings.title");
  const icon = (id: string, size?: number) => ownComputer && id === "machines" ? <OtherMachineIcon size={size ?? 18} /> : SECTIONS.find((section) => section.id === id)!.icon(size);
  const isNew = (id: string) => news.some((item) => item.section === id);
  const notReady = (id: string) => (id === "transcription" && waits.stt) || (id === "voice" && waits.tts) || (id === "call" && waits.turn);
  const badge = (id: string) => notReady(id) && <Badge tone="warning" className="ui-nav-badge" title={t("settings.section.waiting")}>{t("settings.section.notReady")}</Badge>;
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
        <DialogSurface titleId="settings-title" closeId="settings-close" closeable flush closeLabel={t("settings.close")} title={title} titleFocusable={phone}
          leading={phone && level > 1 ? <Button variant="ghost" tone="neutral" size="icon" className="settings-back" aria-label={t("settings.backTo", { page: parent })} title={t("settings.back")}
            onClick={() => levels.back()}><BackIcon size={20} /></Button> : undefined}>
          {/* No Save: every setting applies as it changes. */}
          <form id="language-form" className="settings-layout">
            {/* What fails says so here, under the header, whichever level shows. */}
            <p id="settings-error" className="settings-error" role="alert" />
            <nav ref={nav} className="ui-nav settings-nav" aria-label={t("settings.sections")} hidden={!navShown}
              inert={motionOf(across, 1)?.startsWith("out") || undefined} data-motion={motionOf(across, 1)}>
              {phone ? <ul className="settings-menu">
                  {sections.map((section) => <li key={section.id}>
                    <MenuRow id={"settings-" + section.id} aria-controls={"pane-" + section.id} icon={<NewOnIcon icon={icon(section.id, 20)} isNew={isNew(section.id)} />}
                      label={label(section.id)} summary={summaries[section.id]} badge={badge(section.id)} newLabel={isNew(section.id) ? t("highlights.navNew") : undefined}
                      onClick={() => levels.open(section.id)} />
                  </li>)}
                </ul>
                : sections.map((section) => <Fragment key={section.id}><button type="button" id={"settings-" + section.id} className="ui-nav-item" aria-controls={"pane-" + section.id}
                  aria-current={section.id === current ? section.id === "machines" ? "true" : "page" : undefined}
                  onClick={() => section.id === "machines" ? store?.patch({ settingsSection: "machines", machinesView: { machine: null } }) : show(section.id)}>
                  <NewOnIcon icon={icon(section.id)} isNew={isNew(section.id)} label={t("highlights.navNew")} /><span>{label(section.id)}</span>
                  {badge(section.id)}
                </button>
                {/* Each machine under Machines, and Add a machine after them. */}
                {section.id === "machines" && <MachineNav current={current === "machines"} />}
                </Fragment>)}
            </nav>
            <div className="settings-content" ref={content} hidden={!pageShown} inert={motionOf(across, 2)?.startsWith("out") || undefined} data-motion={motionOf(across, 2)}>
              <div className="settings-column">
                <Pane id="general" current={current}><GeneralSettings t={t} /></Pane>
                <Pane id="transcription" current={current}><SlotSection id="transcription" t={t} /></Pane>
                <Pane id="voice" current={current}><SlotSection id="voice" t={t} /></Pane>
                <Pane id="call" current={current}><CallSettings t={t} /></Pane>
                <Pane id="providers" current={current}><ProviderKeys /></Pane>
                {ownComputer && <Pane id="this-computer" current={current}><ThisComputerSettings /></Pane>}
                <Pane id="machines" current={current}><MachineList /></Pane>
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
