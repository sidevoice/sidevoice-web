import { useState, type CSSProperties, type ReactNode } from "react";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ChoiceCard, Group, Row, Section } from "../components/ui/Card";
import { DialogSurface } from "../components/ui/Dialog";
import { Field } from "../components/ui/Field";
import { Select } from "../components/ui/Select";
import { Snippet } from "../components/ui/Snippet";
import { Input, Textarea } from "../components/ui/Input";
import { Switch } from "../components/ui/Switch";
import {
  AddIcon, CallIcon, CheckIcon, ChevronIcon, CloseIcon, CloseUpIcon, ConnectorIcon, HangupIcon, HarnessIcon, ProviderLogo,
  ListenAgainIcon, MachinesIcon, OtherMachineIcon, ThisComputerIcon, MicrophoneIcon, MicrophoneOffIcon, MoreIcon, MoreVerticalIcon, PlatformIcon, ReadIcon, RefreshIcon, SentIcon,
  SettingsIcon, SendIcon, SidebarCollapseIcon, SidebarExpandIcon, SidevoiceMark, SkipIcon, TranscriptIcon,
} from "../components/ui/Icons";
import { avatarFor, PERSON_AVATAR, type AvatarMood } from "../features/avatar/avatar-spec";
import { avatarColor } from "../features/avatar/bicho-draw";
import { StageBackdrop, useSceneScale } from "../features/avatar/StageScene";
import { CharacterAvatar, type AvatarSize } from "../features/avatar/CharacterAvatar";
import { translator } from "../i18n/translator";
import { ModelPrepare } from "../features/settings/ModelPrepare";
import { machineStatus } from "../features/settings/machine-status";
import { MachineState, machineEntryName } from "../features/settings/MachineState";
import type { MachineView } from "../state/room-types";
import type { LocalHostStatus } from "../services/desktop-host";
import { NewConversation } from "../features/room/NewConversation";
import { CONNECTOR_INSTALL, CONNECTOR_PAIR_DEVICE } from "../features/pairing/connector-commands";

/* The app's whole vocabulary drawn with the design system: every surface of the room, the call, the transcript, the
 * first-run setup, pairing and Settings, as the system would draw it. These are pictures, not the app: they take no
 * actions and read no state. The product's words come from its bundles; names, messages and figures are samples. The
 * avatars are today's, as placeholders: another piece of work designs them. */

type State = "in-call" | "working" | "waiting" | "idle";

/** A conversation's agent, small, with the dot of its state — the sidebar, the rail, the phone's header. */
function Avatar({ id, mood = "idle", state, size = "small", person = false }: { id: string; mood?: AvatarMood; state?: State; size?: AvatarSize; person?: boolean }) {
  const spec = person ? PERSON_AVATAR : avatarFor(id);
  const color = avatarColor(spec);
  const tone = { "--pt-tone": color, "--pt-tone-bg": `color-mix(in srgb, ${color} 22%, var(--sv-surface))` } as CSSProperties;
  return (
    <span className="pt-avatar" data-size={size} style={tone}>
      <CharacterAvatar spec={spec} mood={mood} size={size} />
      {state && <span className="pt-state-dot" data-state={state} aria-hidden />}
    </span>
  );
}

function Phone({ children, label }: { children: ReactNode; label: string }) {
  return <figure className="pt-phone"><div className="pt-phone-screen">{children}</div><figcaption>{label}</figcaption></figure>;
}

function Frame({ children, label, className }: { children: ReactNode; label?: string; className?: string }) {
  return <figure className={"pt-frame " + (className ?? "")}>{children}{label && <figcaption>{label}</figcaption>}</figure>;
}

function Pattern({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ds-specimen">
      <h2 className="ds-specimen-title">{title}</h2>
      {note && <p className="ds-specimen-note">{note}</p>}
      <div className="ds-specimen-body">{children}</div>
    </section>
  );
}

const ROWS: { id: string; title: string; harness: string; state: State; mood: AvatarMood; selected?: boolean; unread?: number }[] = [
  { id: "sidevoice-web", title: "sidevoice-web", harness: "claude", state: "in-call", mood: "speaking", selected: true },
  { id: "release", title: "release", harness: "codex", state: "working", mood: "working" },
  { id: "landing-copy", title: "landing copy", harness: "claude", state: "waiting", mood: "idle", unread: 2 },
  { id: "infra", title: "infra · terraform", harness: "cursor", state: "idle", mood: "idle" },
];

function stateLabel(state: State, t: ReturnType<typeof translator>) {
  return t(state === "in-call" ? "state.inCall" : state === "working" ? "state.working" : state === "waiting" ? "state.waiting" : "state.offline");
}

// ---------------------------------------------------------------- the room

function Header({ phone = false }: { phone?: boolean }) {
  const t = translator();
  return (
    <header className="pt-header" data-phone={phone || undefined}>
      <span className="pt-brand"><SidevoiceMark size={phone ? 20 : 22} />{!phone && <span>Sidevoice</span>}</span>
      {phone && <span className="pt-header-others">
        <button type="button" className="pt-header-avatar" aria-label="landing copy"><Avatar id="landing-copy" state="waiting" /></button>
        <button type="button" className="pt-header-avatar" aria-label="release"><Avatar id="release" mood="working" state="working" /></button>
      </span>}
      <span className="pt-header-end">
        <Button variant="ghost" tone="neutral" size="icon" aria-label={t("header.settings")} title={t("header.settings")} className="pt-has-dot"><SettingsIcon size={20} /><span className="pt-notice-dot" aria-hidden /></Button>
      </span>
    </header>
  );
}

function ConversationRow({ row, rail = false }: { row: (typeof ROWS)[number]; rail?: boolean }) {
  const t = translator();
  return (
    <div className="pt-row" data-selected={row.selected || undefined} data-state={row.state}>
      <button type="button" className="pt-row-main" aria-pressed={!!row.selected} title={rail ? `${row.title} · ${stateLabel(row.state, t)}` : undefined}>
        <Avatar id={row.id} mood={row.mood} state={row.state} />
        {!rail && <span className="pt-row-copy">
          <span className="pt-row-title">{row.title}</span>
          <span className="pt-row-sub"><HarnessIcon harness={row.harness} size={12} />{stateLabel(row.state, t)}</span>
        </span>}
        {!rail && row.unread && <Badge tone="accent">{t("state.unread", { n: row.unread })}</Badge>}
      </button>
      {!rail && <Button variant="ghost" tone="neutral" size="icon-sm" className="pt-row-more" aria-label={t("sidebar.options", { title: row.title })}><MoreIcon /></Button>}
    </div>
  );
}

function Sidebar({ rail = false }: { rail?: boolean }) {
  const t = translator();
  return (
    <aside className="pt-sidebar" data-rail={rail || undefined}>
      <div className="pt-sidebar-head">
        {!rail && <h3>{t("sidebar.title")}</h3>}
        <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={rail ? t("sidebar.expand") : t("sidebar.collapse")}>{rail ? <SidebarExpandIcon /> : <SidebarCollapseIcon />}</Button>
      </div>
      <div className="pt-group">
        {!rail && <p className="pt-group-label"><PlatformIcon platform="macos" size={12} />MacBook Pro</p>}
        {ROWS.slice(0, 2).map((row) => <ConversationRow key={row.id} row={row} rail={rail} />)}
      </div>
      <div className="pt-group">
        {!rail && <p className="pt-group-label"><PlatformIcon platform="linux" size={12} />NUC del salón</p>}
        {ROWS.slice(2).map((row) => <ConversationRow key={row.id} row={row} rail={rail} />)}
      </div>
      {/* The real button: it opens what it says to tell your agent. */}
      <div className="pt-sidebar-new"><NewConversation rail={rail} /></div>
    </aside>
  );
}

function PhonePanel() {
  const t = translator();
  return (
    <div className="pt-phone-room">
      <Header phone />
      <div className="pt-sheet-down">
        <div className="pt-sidebar-head"><h3>{t("sidebar.title")}</h3><Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("sidebar.close")}><CloseUpIcon /></Button></div>
        <p className="pt-group-label"><PlatformIcon platform="macos" size={12} />MacBook Pro</p>
        {ROWS.slice(0, 3).map((row) => <ConversationRow key={row.id} row={row} />)}
      </div>
      <div className="pt-scrim-fill" />
    </div>
  );
}

// ---------------------------------------------------------------- the call

function StageTile({ mood, compact = false, phone = false }: { mood: "speaking" | "working" | "waiting" | "listening"; compact?: boolean; phone?: boolean }) {
  const t = translator();
  const spec = avatarFor("sidevoice-web");
  const sceneRef = useSceneScale();
  return (
    <div ref={sceneRef} className="pt-stage" data-compact={compact || undefined} style={{ "--pt-tone": avatarColor(spec) } as CSSProperties}>
      {/* The bicho's backdrop, as the room's stage draws it (StageScene), behind the pattern. */}
      <div className="stage-scene"><StageBackdrop seed="sidevoice-web" tone={avatarColor(spec)} /></div>
      <div className="pt-stage-name"><h3>sidevoice-web</h3><span>MacBook Pro</span></div>
      <div className="pt-stage-top">
        {mood === "speaking" && <div className="pt-bubble pt-bubble--agent">
          <span className="pt-bubble-previous">The tokens are in place for both themes.</span>
          <span><span className="pt-spoken">Now I'm moving the settings onto them,</span> section by section.</span>
        </div>}
        {mood === "working" && <p className="pt-working" role="status"><span className="ui-spinner ui-spinner--inline" aria-hidden />{t("stage.working")}</p>}
      </div>
      <Avatar id="sidevoice-web" mood={mood === "waiting" ? "idle" : mood} size="stage" />
      <div className="pt-stage-tags"><span className="pt-tag"><HarnessIcon harness="claude-code" size={12} />claude-opus-5-5 · xhigh</span></div>
      {mood === "listening" && <div className="pt-bubble pt-bubble--person">
        <span>…and make the dark theme a little warmer</span>
        <Button variant="ghost" tone="neutral" size="sm">{t("stage.cancelTurn")}</Button>
      </div>}
      {/* The way into the transcript, phone and desktop: a round button in the tile's corner, a dot when something is unread. */}
      <Button size="icon" variant="secondary" className="pt-transcript" aria-label={t("transcript.showUnread", { n: 1 })}><TranscriptIcon size={20} /><span className="pt-transcript-dot" aria-hidden /></Button>
    </div>
  );
}

/** The microphone and the speaker's panel, as the call shows it above the chevron (features/call/AudioDevices). */
function DevicesPanel({ fixed = false, lost = false }: { fixed?: boolean; lost?: boolean }) {
  const t = translator();
  return (
    <div className="pt-devices">
      <Field label={t("devices.mic")}><Select defaultValue="headset" options={[{ value: "", label: t("devices.default") }, { value: "headset", label: "AirPods Pro" }, { value: "built-in", label: "MacBook Pro Microphone" }]} /></Field>
      <Field label={t("devices.speaker")} hint={fixed ? t("devices.speakerFixed") : undefined}>
        <Select defaultValue="" disabled={fixed} options={[{ value: "", label: t("devices.default") }, { value: "headset", label: "AirPods Pro" }, { value: "built-in", label: "MacBook Pro Speakers" }]} />
      </Field>
      {lost && <p className="pt-devices-lost">{t("devices.lostInput")} <Button variant="ghost" tone="neutral" size="sm">{t("devices.gotIt")}</Button></p>}
    </div>
  );
}

function StageEmpty() {
  const t = translator();
  return <div className="pt-stage pt-stage--empty"><p>{t("stage.empty")}</p><Button>{t("stage.chooseConversation")}</Button></div>;
}

function CallBar({ joined = false, muted = false, menu = false, transcript = false, phone = false }: { joined?: boolean; muted?: boolean; menu?: boolean; transcript?: boolean; phone?: boolean }) {
  const t = translator();
  return (
    <div className="pt-callbar" data-phone={phone || undefined}>
      <div className="pt-callbar-center">
        <p className="pt-join" data-state={joined ? "on" : "off"}><span className="pt-join-dot" aria-hidden />{joined ? "Connected · 42 ms" : "Not in the call"}</p>
        <div className="pt-call-actions">
          <span className="pt-mic" data-muted={muted || undefined}>
            <button type="button" className="pt-mic-devices" aria-label="Microphone and speaker"><span className="pt-wave" aria-hidden><i /><i /><i /><i /></span><ChevronIcon size={14} /></button>
            <button type="button" className="pt-call-button pt-mute" aria-pressed={muted} aria-label={muted ? "Turn on microphone" : "Turn off microphone"}>{muted ? <MicrophoneOffIcon size={22} /> : <MicrophoneIcon size={22} />}</button>
          </span>
          <button type="button" className="pt-call-button" disabled={!joined} aria-label={t("toolbar.skip")}><SkipIcon size={22} /></button>
          <button type="button" className="pt-call-button pt-call" data-joined={joined || undefined} aria-label={joined ? "Leave the call" : "Join the call"}>{joined ? <HangupIcon /> : <CallIcon />}</button>
          <span className="pt-menu-anchor">
            <button type="button" className="pt-call-button" aria-expanded={menu} aria-label={t("header.menu")}><MoreVerticalIcon size={22} /></button>
            {menu && <div className="pt-menu pt-menu--up" role="menu"><button type="button" role="menuitem" className="pt-menu-item">{t("header.stats")}</button></div>}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- the transcript

function Message({ role, text, time, last = true, interrupted = false, read = false, replay = false }: { role: "assistant" | "user"; text: string; time: string; last?: boolean; interrupted?: boolean; read?: boolean; replay?: boolean }) {
  return (
    <div className="pt-message" data-role={role} data-last={last || undefined}>
      {role === "assistant" && (last ? <Avatar id="sidevoice-web" mood="idle" /> : <span className="pt-avatar-spacer" />)}
      <article className="pt-chat" data-role={role} data-last={last || undefined} data-interrupted={interrupted || undefined}>
        <p>{text}</p>
        <div className="pt-chat-meta">
          <time>{time}</time>
          {replay && <Button variant="ghost" tone="neutral" size="icon-sm" className="pt-listen" aria-label="Listen again"><ListenAgainIcon size={12} /></Button>}
          {role === "user" && <span className="pt-receipt" data-read={read || undefined}>{read ? <ReadIcon size={14} /> : <SentIcon size={14} />}</span>}
        </div>
      </article>
    </div>
  );
}

function Transcript({ phone = false }: { phone?: boolean }) {
  const t = translator();
  const [text, setText] = useState("");
  return (
    <section className="pt-transcript" data-phone={phone || undefined}>
      {phone && <span className="pt-grab" aria-hidden />}
      <header className="pt-transcript-head">
        <div><strong>{t("transcript.title")}</strong><span>sidevoice-web</span></div>
        <Button variant="ghost" tone="neutral" size="icon-sm" aria-label={t("transcript.close")}><CloseIcon /></Button>
      </header>
      <div className="pt-messages">
        <p className="pt-day">Today</p>
        <Message role="user" text="Can you make the dark theme a little warmer?" time="11:02" read />
        <Message role="assistant" last={false} text="Sure. I'll try three directions and put them side by side on the design system page." time="11:02" replay />
        <Message role="assistant" text="The first is near-black with a brighter lila." time="11:03" interrupted />
        <Message role="user" text="Perfect, and the buttons too." time="11:04" />
        <Button size="sm" variant="secondary" className="pt-new-messages">2 new messages</Button>
      </div>
      <form className="pt-composer" onSubmit={(event) => event.preventDefault()}>
        <div className="pt-composer-field">
          <Textarea minRows={1} maxRows={phone ? 5 : 8} value={text} onChange={(event) => setText(event.target.value)} placeholder={t("transcript.placeholder")} aria-label={t("transcript.message")} />
          <Button type="submit" variant="ghost" size="icon-sm" className="pt-composer-send" disabled={!text.trim()} aria-label={t("transcript.sendLabel")}><SendIcon /></Button>
        </div>
      </form>
    </section>
  );
}

// ---------------------------------------------------------------- the first-run setup and pairing

function Stepper({ current }: { current: number }) {
  const t = translator();
  const groups = ["wizard.group.where", "wizard.group.agents", "wizard.group.transcription", "wizard.group.voice", "wizard.group.ready"] as const;
  return (
    <div className="pt-stepper">
      <p className="pt-stepper-label">Step {current + 1} of {groups.length} · {t(groups[current])}</p>
      <ol aria-label="Progress">{groups.map((key, index) => <li key={key} data-state={index < current ? "done" : index === current ? "current" : "next"} aria-current={index === current ? "step" : undefined}><span className="sr-only">{t(key)}</span></li>)}</ol>
    </div>
  );
}

function WizardFrame({ step, title, children, footer }: { step: number; title: string; children: ReactNode; footer: ReactNode }) {
  const t = translator();
  return (
    <div className="pt-wizard">
      <header className="pt-wizard-head">
        <span className="pt-wizard-brand"><SidevoiceMark size={18} />{t("wizard.eyebrow")}</span>
      </header>
      <Stepper current={step} />
      <h3 className="pt-wizard-title">{title}</h3>
      <div className="pt-wizard-body">{children}</div>
      <footer className="pt-wizard-foot">{footer}</footer>
    </div>
  );
}

function WizardWhere() {
  const t = translator();
  const [choice, setChoice] = useState<"local" | "remote">("local");
  return (
    <WizardFrame step={0} title={t("wizard.title.where")} footer={<Button variant="primary">{t("wizard.continue")}</Button>}>
      <p>{t("wizard.where.body")}</p>
      <div className="pt-choices" role="radiogroup" aria-label={t("wizard.title.where")}>
        <ChoiceCard selected={choice === "local"} onSelect={() => setChoice("local")}><ThisComputerIcon size={20} /><strong>{t("wizard.choice.local")}</strong><span className="pt-choice-note">{t("wizard.choice.localNote")}</span></ChoiceCard>
        <ChoiceCard selected={choice === "remote"} onSelect={() => setChoice("remote")}><OtherMachineIcon size={20} /><strong>{t("wizard.choice.remote")}</strong><span className="pt-choice-note">{t("wizard.choice.remoteNote")}</span></ChoiceCard>
      </div>
    </WizardFrame>
  );
}

function PairingForm({ error = false }: { error?: boolean }) {
  const t = translator();
  return (
    <form className="pt-stack" onSubmit={(event) => event.preventDefault()}>
      <Field label={t("pairing.address")} hint={t("pairing.addressHint")}><Input placeholder={t("pairing.addressPlaceholder")} defaultValue="192.168.1.20:8768" inputMode="url" /></Field>
      <Field label={t("pairing.code")} error={error ? t("pairing.expired") : undefined}><Textarea minRows={2} maxRows={4} className="pt-mono" defaultValue="SV1.eyJhIjoiMTkyLjE2OC4xLjIwOjg3NjUiLCJjIjoiOGY0MiJ9" /></Field>
    </form>
  );
}

function WizardPair() {
  const t = translator();
  return (
    <WizardFrame step={1} title={t("wizard.title.pair")} footer={<><Button variant="ghost" tone="neutral" className="pt-back">{t("wizard.back")}</Button><Button variant="primary">{t("pairing.connect")}</Button></>}>
      <p>{t("pairing.intro")}</p>
      <ol className="pt-steps">
        <li><p>{t("pairing.stepInstall")}</p><Snippet text={CONNECTOR_INSTALL} label={t("noMachine.copyCommand")} /></li>
        <li><p>{t("pairing.stepPair")}</p><Snippet text={CONNECTOR_PAIR_DEVICE} label={t("noMachine.copyPairCommand")} /></li>
      </ol>
      <PairingForm />
    </WizardFrame>
  );
}

function WizardTranscription() {
  const t = translator();
  return (
    <WizardFrame step={2} title={t("wizard.title.stt")} footer={<><Button variant="ghost" tone="neutral" className="pt-back">{t("wizard.back")}</Button><p className="ui-dialog-reason" id="pt-wizard-reason">The transcription model isn't ready yet.</p><Button variant="primary" disabled blockedBy="pt-wizard-reason">{t("wizard.continue")}</Button></>}>
      <ModelPrepare status="downloading" model="whisper-small" size={466e6} fraction={0.58} meta="English, Spanish and 4 more · good accuracy, fast"
        pickers={(locked) => <>
          <Field label="Family"><Select disabled={locked} defaultValue="whisper" options={[{ value: "whisper", label: "Whisper" }]} /></Field>
          <Field label="Model"><Select disabled={locked} defaultValue="small" options={[{ value: "base", label: "whisper-base" }, { value: "small", label: "whisper-small" },
            { value: "large", label: "whisper-large", disabled: true, reason: t("voice.model.unfit", { reasons: t("voice.unfit.memory") }) }]} /></Field>
        </>} />
    </WizardFrame>
  );
}

// ---------------------------------------------------------------- Settings

/** A machine gives a device its pairing code: a button makes it, then the code shows, selected whole on a tap. */
function PairAnotherDevice() {
  const t = translator();
  const [code, setCode] = useState(false);
  return (
    <Row label={t("hosts.devices.pairAnother")} description={code ? undefined : "Make a one-time code here, then enter it on the device."} block={code}>
      {code ? <div className="pt-pair-code">
        <output className="pt-code" aria-label="Pairing code">SV1.8F42-K7QD</output>
        <p className="pt-hint">{t("hosts.devices.codeExpires", { minutes: 10 })}</p>
        <Button variant="ghost" tone="neutral" size="sm" onClick={() => setCode(false)}>Done</Button>
      </div> : <Button onClick={() => setCode(true)}>{t("hosts.devices.generateCode")}</Button>}
    </Row>
  );
}

/** Machines as the room's store has them (MachineView): this computer, one connected, one asleep. Their state is worded
 *  as everywhere (machineStatus), in words as a machine's page says it. */
const RUNNING: LocalHostStatus = { state: "running", reachable: true };
const machine = (id: string, host: string, changes: Partial<MachineView> = {}): MachineView =>
  ({ id, host, revoked: false, reach: "direct", state: "connected", ...changes });
const PATTERN_MACHINES: { view: MachineView; platform: string; note: string }[] = [
  { view: machine("mbp", "MacBook Pro", { local: true }), platform: "macos", note: "2 agents" },
  { view: machine("nuc", "NUC del salón"), platform: "linux", note: "192.168.1.20 · 1 agent" },
  { view: machine("imac", "Office iMac", { reach: "offline", state: "offline" }), platform: "macos", note: "Last seen yesterday" },
];

function MachineDetail() {
  const t = translator();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="pt-stack">
      <div className="pt-machine-head">
        <span className="pt-machine-icon"><PlatformIcon platform="macos" size={20} /></span>
        <div><strong>MacBook Pro</strong><span>This computer · {t("hosts.version", { version: "0.5.0" })}</span></div>
        <MachineState status={machineStatus(PATTERN_MACHINES[0].view, RUNNING, true, t)} form="long" />
      </div>
      <Group title="Sidevoice on this computer">
        <Row label={t("hosts.status.running")} description="Started 2 hours ago · 3 calls">
          {confirm
            ? <span className="pt-confirm"><Button variant="ghost" tone="neutral" size="sm" onClick={() => setConfirm(false)}>Cancel</Button><Button variant="danger" size="sm">{t("hosts.stop")}</Button></span>
            : <span className="pt-confirm"><Button size="sm">{t("hosts.restart")}</Button><Button variant="ghost" tone="danger" size="sm" onClick={() => setConfirm(true)}>{t("hosts.stop")}</Button></span>}
        </Row>
        {confirm && <div className="pt-row-note"><Alert tone="warning" title={t("hosts.stopConfirm")} /></div>}
        <Row label={t("hosts.startAtLogin")}><Switch checked onChange={() => {}} aria-label={t("hosts.startAtLogin")} /></Row>
      </Group>
      <Group title={t("hosts.tab.devices")}>
        <Row label="Pixel 8" description={`${t("hosts.devices.created", { date: "3 Oct" })} · ${t("hosts.devices.lastSeen", { date: "today" })}`}><Button variant="ghost" tone="danger" size="sm">Revoke</Button></Row>
        <Row label={<>iPad <Badge>{t("hosts.devices.thisDevice")}</Badge></>} description={t("hosts.devices.created", { date: "1 Oct" })} />
        <PairAnotherDevice />
      </Group>
    </div>
  );
}

function MachinesList() {
  const t = translator();
  return (
    <Section title="Machines" description="The computers where your agents run. Sidevoice talks to them; each can be opened to see its agents and devices."
      actions={<Button variant="primary"><AddIcon />Add a machine</Button>}>
      <Group>
        {PATTERN_MACHINES.map(({ view, platform, note }) => {
          // Its state in words under its name, never a dot.
          const state = machineStatus(view, RUNNING, false, t);
          return <button type="button" className="ui-row pt-machine-row" key={view.id} aria-label={machineEntryName(view.host, state, false, t)}>
            <span className="pt-machine-line"><span className="pt-machine-icon"><PlatformIcon platform={platform} size={18} /></span>
              <span className="ui-row-text"><span className="ui-row-label">{view.host}{view.local && <Badge>This computer</Badge>}</span>
                <span className="ui-row-description pt-machine-state"><MachineState status={state} /><span>{note}</span></span></span></span>
            <span className="ui-row-control"><ChevronIcon size={16} className="pt-chevron-right" /></span>
          </button>;
        })}
      </Group>
    </Section>
  );
}


function Providers() {
  const t = translator();
  return (
    <Section title={t("keys.title")} description={t("keys.intro")}>
      <Alert tone="warning" title="Kept in this browser">{t("keys.browser").split(". ")[0]}.</Alert>
      <Group>
        <Row label={<span className="pt-provider-name"><span className="pt-provider-logo"><ProviderLogo provider="openai" /></span>OpenAI</span>} description="Transcription and voice"><Badge tone="positive" dot>{t("keys.kept")}</Badge></Row>
        <Row label={<span className="pt-provider-name"><span className="pt-provider-logo"><ProviderLogo provider="elevenlabs" /></span>ElevenLabs</span>} description="Voice" block>
          <div className="pt-key-form">
            <Field label={t("keys.label", { provider: "ElevenLabs" })} aside={<Badge>{t("keys.missing")}</Badge>}><Input type="password" placeholder={t("keys.placeholder.new")} /></Field>
            <div className="pt-key-actions"><Button variant="ghost" tone="neutral" size="sm" disabled>{t("keys.remove")}</Button><Button size="sm">{t("keys.save")}</Button></div>
          </div>
        </Row>
      </Group>
    </Section>
  );
}

function HostAgents() {
  const t = translator();
  return (
    <Group title="Agents on MacBook Pro">
      <div className="ui-row pt-agent">
        <div className="pt-machine-line"><span className="pt-machine-icon"><HarnessIcon harness="claude" size={18} /></span>
          <div className="ui-row-text"><span className="ui-row-label">Claude Code <span className="pt-version">2.1.4</span></span><p className="ui-row-description pt-ok"><CheckIcon size={14} />{t("agents.connected")}</p></div></div>
        <div className="ui-row-control"><Button variant="ghost" tone="neutral" size="sm">{t("agents.disconnect")}</Button></div>
      </div>
      <div className="ui-row pt-agent">
        <div className="pt-machine-line"><span className="pt-machine-icon"><HarnessIcon harness="codex" size={18} /></span>
          <div className="ui-row-text"><span className="ui-row-label">Codex <span className="pt-version">0.48</span> <Badge tone="accent">{t("highlights.new")}</Badge></span><p className="ui-row-description">Not connected yet</p></div></div>
        <div className="ui-row-control pt-confirm"><Button variant="ghost" tone="neutral" size="sm">{t("agents.notNow")}</Button><Button variant="primary" size="sm">{t("agents.connect")}</Button></div>
      </div>
      <div className="ui-row ui-row--block pt-agent">
        <div className="pt-machine-line"><span className="pt-machine-icon"><HarnessIcon harness="cursor" size={18} /></span>
          <div className="ui-row-text"><span className="ui-row-label">Cursor</span><p className="ui-row-description">{t("agents.manual.toggle")}</p></div></div>
        <div className="ui-row-control pt-howto"><Snippet text="npx sidevoice agents connect cursor" /><p className="pt-hint">Waiting for Cursor to connect…</p></div>
      </div>
    </Group>
  );
}

// ---------------------------------------------------------------- banners, menus, status, empty states, stats

function Banners() {
  const t = translator();
  return (
    <div className="pt-stack">
      <div className="pt-banner" data-tone="warning"><Alert tone="warning" title="Site data is blocked">{t("storage.blocked")}</Alert></div>
      <div className="pt-banner" data-tone="danger"><Alert tone="danger" title={t("noMachine.retryBanner", { cause: "it stopped answering" })} action={<Button size="sm"><RefreshIcon />Retry</Button>} /></div>
      <Alert tone="danger" live title="Couldn't join the call">The machine refused the connection. Try again in a moment.</Alert>
    </div>
  );
}

function Menus() {
  return (
    <div className="pt-menus">
      <div className="pt-menu" role="menu">
        <button type="button" role="menuitem" className="pt-menu-item"><RefreshIcon />Rename</button>
        <button type="button" role="menuitemradio" aria-checked className="pt-menu-item" data-selected><CheckIcon />Pinned</button>
        <span className="pt-menu-separator" role="separator" />
        <button type="button" role="menuitem" className="pt-menu-item" data-danger><CloseIcon />Close conversation</button>
      </div>
      <div className="pt-tooltip" role="tooltip">landing copy · Waiting for you<br />Claude Code · via the NUC</div>
    </div>
  );
}

function StatusLines() {
  return (
    <div className="pt-stack">
      <p className="pt-status"><CheckIcon size={16} />Paired with the NUC.</p>
      <p className="pt-status" data-tone="muted"><span className="ui-spinner ui-spinner--inline" aria-hidden />Connecting…</p>
      <div className="pt-toast" role="status"><CheckIcon size={18} /><span>Key saved.</span><Button variant="ghost" tone="neutral" size="icon-sm" aria-label="Dismiss"><CloseIcon /></Button></div>
    </div>
  );
}

function EmptyStates() {
  const t = translator();
  return (
    <div className="pt-stack">
      <div className="pt-empty pt-card-empty">
        <span className="pt-empty-icon"><MachinesIcon size={28} /></span>
        <h3>{t("noMachine.title")}</h3><p>{t("noMachine.body")}</p>
        <div className="pt-empty-actions"><Button variant="primary">{t("localInstall.cta")}</Button><Button variant="secondary"><AddIcon />{t("noMachine.connect")}</Button></div>
      </div>
      <div className="pt-two">
        <div className="pt-empty pt-empty--small"><p>{t("sidebar.empty")}</p></div>
        <div className="pt-empty pt-empty--small"><p>{t("hosts.devices.empty")}</p></div>
      </div>
    </div>
  );
}

function Stats() {
  return (
    <DialogSurface titleId="pt-stats-title" eyebrow="Call diagnostics" title="Connection and latency" onClose={() => {}}
      footer={<><p className="ui-dialog-reason">Updated 11:04:12</p><Button><RefreshIcon />Refresh</Button></>}>
      <div className="pt-metrics">
        <div className="pt-metric"><span>End of turn → text</span><strong>412 ms</strong><small>Median · recognition on this device</small></div>
        <div className="pt-metric"><span>Text sent → reply</span><strong>2.8 s</strong><small>Median · first reply per turn</small></div>
      </div>
      <dl className="pt-facts">
        <div><dt>Route</dt><dd>Direct · UDP</dd></div><div><dt>Round trip</dt><dd>38 ms</dd></div><div><dt>Lost packets</dt><dd>0.2 %</dd></div><div><dt>Codec</dt><dd>Opus 48 kHz</dd></div>
      </dl>
      <div className="pt-table-wrap" tabIndex={0}><table className="pt-table">
        <thead><tr><th>Turn</th><th>Silence</th><th>Recognition</th><th>Agent</th><th>State</th></tr></thead>
        <tbody>
          <tr><td>11:04</td><td>620 ms</td><td>398 ms</td><td>2.6 s</td><td><Badge tone="positive">Played</Badge></td></tr>
          <tr><td>11:02</td><td>540 ms</td><td>441 ms</td><td>3.1 s</td><td><Badge tone="warning">Cut</Badge></td></tr>
          <tr><td>11:01</td><td>—</td><td>—</td><td>—</td><td><Badge>Text</Badge></td></tr>
        </tbody>
      </table></div>
    </DialogSurface>
  );
}

// ---------------------------------------------------------------- the section

export function AppPatterns() {
  return (
    <div className="ds-showcase">
      <Pattern title="Room · header" note="The mark and Settings (with a dot when agents wait to be connected). On a phone, two other conversations sit beside the mark.">
        <Frame><Header /></Frame>
        <Phone label="Phone"><Header phone /></Phone>
      </Pattern>
      <Pattern title="Room · conversations" note="Grouped by machine; each row is the agent's avatar with its state dot, its title, its harness and state, and ⋯. Collapses into a rail; on a phone it drops from the header over the dimmed call. After the last conversation, New conversation (a + in the rail) says what to tell your agent.">
        <div className="pt-two pt-two--sidebar"><Frame><Sidebar /></Frame><Frame><Sidebar rail /></Frame></div>
        <Phone label="Phone · the list drops from the header"><PhonePanel /></Phone>
      </Pattern>
      <Pattern title="Call · stage" note="The agent fills the stage, named with its machine; what it says plays in its bubble, the spoken words lit. While it works, a pill stands where the bubble was. The harness and model sit below; the person's bubble shows what they are saying.">
        <StageTile mood="speaking" />
        <div className="pt-two"><StageTile mood="working" compact /><StageTile mood="listening" compact /></div>
        <div className="pt-two"><StageEmpty /><Phone label="Phone · the transcript's button floats in the corner"><StageTile mood="waiting" compact phone /></Phone></div>
      </Pattern>
      <Pattern title="Call · bar" note="The microphone (its devices and level beside it), skip, the call, ⋮, and the transcript at the right. Only their look changes: their meaning is as today.">
        <Frame><CallBar /></Frame>
        <Frame><CallBar joined transcript /></Frame>
        <Frame className="pt-frame--tall"><CallBar joined muted menu /></Frame>
        <Phone label="Phone"><CallBar joined phone /></Phone>
      </Pattern>
      <Pattern title="Call · microphone and speaker" note="The chevron joined to the microphone opens a small panel right above it, its left edge on the pill's: the microphone and the speaker, one under the other. With a mouse, resting on the chevron opens it and leaving both closes it; a click, a key or a tap holds it open until a click outside or Escape. Where the speaker cannot be chosen (a browser that lacks it), it is disabled and says why; a chosen device that went away is said once.">
        <Frame><DevicesPanel /></Frame>
        <Frame><DevicesPanel fixed lost /></Frame>
      </Pattern>
      <Pattern title="Transcript" note="Docked beside the call on a desktop, a sheet on a phone. The agent in lila, you in crema; time, read marks and listen again. The text box is a rounded field pinned at the foot, Send an arrow inside it; it grows with what you write and is never resized by hand.">
        <Frame className="pt-frame--transcript"><Transcript /></Frame>
      </Pattern>
      <Pattern title="First-run setup" note="A fixed-height dialog (the whole screen on a phone): the step and its group, a five-part progress bar, the title, the step, and Back/Continue. Continue says why it waits.">
        <Frame className="pt-frame--dialog"><WizardWhere /></Frame>
        <Frame className="pt-frame--dialog"><WizardPair /></Frame>
        <Frame className="pt-frame--dialog"><WizardTranscription /></Frame>
      </Pattern>
      <Pattern title="Pairing dialog" note="Prepare the other machine with two commands, then its address and the code it gives.">
        <Frame className="pt-frame--dialog">
          <DialogSurface titleId="pt-pair-title" title="Connect to a machine" onClose={() => {}} footer={<><Button variant="ghost" tone="neutral">Cancel</Button><Button variant="primary" loading>Connect</Button></>}>
            <ol className="pt-steps">
              <li><p>On the machine where your agents run, install Sidevoice from a terminal:</p><Snippet text={CONNECTOR_INSTALL} label="Copy setup command" /></li>
              <li><p>Then get a pairing code there and paste it below with the machine's address:</p></li>
            </ol>
            <PairingForm error />
          </DialogSurface>
        </Frame>
      </Pattern>
      <Pattern title="Settings · machines" note="The machines, with adding one always in sight; then a machine's own page: its state and actions (stop asks first), its paired devices, and a code to pair another. The A/B layouts are switchable in the app (VARIANTS).">
        <MachinesList />
        <MachineDetail />
      </Pattern>
      <Pattern title="Settings · providers" note="Each provider with its own mark (from its brand kit), whether its key is kept, and the key's field.">
        <Providers />
      </Pattern>
      <Pattern title="Settings · agents on a machine" note="Connected, new (connect or not now), and one to connect by hand with its command.">
        <HostAgents />
      </Pattern>
      <Pattern title="Banners and errors" note="Storage blocked, this computer unavailable (with retry), and a failure that just happened.">
        <Banners />
      </Pattern>
      <Pattern title="Menus and tooltips"><Menus /></Pattern>
      <Pattern title="Status lines and toasts" note="Inline status after an action, a working line, and a toast — which the app does not have today; proposed for confirmations that have no place of their own.">
        <StatusLines />
      </Pattern>
      <Pattern title="Empty states" note="No machine yet (the first screen without setup), and the small ones inside lists.">
        <EmptyStates />
      </Pattern>
      <Pattern title="Connection statistics dialog" note="The call's diagnostics: medians as figures, the connection's facts, and the last turns.">
        <Frame className="pt-frame--dialog"><Stats /></Frame>
      </Pattern>
    </div>
  );
}
