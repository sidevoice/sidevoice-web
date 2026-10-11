import { useEffect, useId, useState, type ReactNode } from "react";
import { Alert } from "../components/ui/Alert";
import { Badge } from "../components/ui/Badge";
import { Button } from "../components/ui/Button";
import { ChoiceCard, Group, Row, Section } from "../components/ui/Card";
import { Dialog, DialogSurface } from "../components/ui/Dialog";
import { Field } from "../components/ui/Field";
import { Input, Textarea } from "../components/ui/Input";
import { NativeSelect } from "../components/ui/NativeSelect";
import { ProgressBar } from "../components/ui/ProgressBar";
import { Segmented, Tabs } from "../components/ui/Tabs";
import { Switch } from "../components/ui/Switch";
import { AddIcon, AdvancedIcon, CloseIcon, CopyIcon, GeneralIcon, IntegrationsIcon, MachinesIcon, SettingsIcon, SidevoiceMark, TranscriptionIcon, VoicesIcon } from "../components/ui/Icons";
import { ModelPrepare, type PrepareStatus } from "../features/settings/ModelPrepare";
import { applyTheme } from "../lib/theme";
import { AppPatterns } from "./AppPatterns";

/* A reference page, not part of the product: its own words name the components, in English, for whoever builds with
 * them. Every word a component says itself comes from its bundle, as in the app. */

type View = "both" | "light" | "dark";

function Specimen({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <section className="ds-specimen">
      <h2 className="ds-specimen-title">{title}</h2>
      {note && <p className="ds-specimen-note">{note}</p>}
      <div className="ds-specimen-body">{children}</div>
    </section>
  );
}

const SWATCHES = [
  ["bg", "--sv-bg"], ["bg-subtle", "--sv-bg-subtle"], ["bg-sunken", "--sv-bg-sunken"], ["surface", "--sv-surface"],
  ["surface-raised", "--sv-surface-raised"], ["border", "--sv-border"], ["border-strong", "--sv-border-strong"], ["text", "--sv-text"],
  ["text-muted", "--sv-text-muted"], ["text-subtle", "--sv-text-subtle"], ["accent", "--sv-accent"], ["accent-soft", "--sv-accent-soft"],
  ["voice", "--sv-voice"], ["positive", "--sv-positive"], ["warning", "--sv-warning"], ["danger", "--sv-danger"],
] as const;

function Palette() {
  return <div className="ds-swatches">{SWATCHES.map(([name, token]) => (
    <div className="ds-swatch" key={token}><span style={{ background: `var(${token})` }} /><code>{name}</code></div>
  ))}</div>;
}

function Type() {
  return <div className="ds-type">
    <p className="sv-text-2xl">Talk to your agents · 2xl</p>
    <p className="sv-text-xl">Section title · xl</p>
    <p className="sv-text-lg">Card and dialog title · lg</p>
    <p className="sv-text-md">Body · md (15px): what a setting does, in a sentence or two, at a size made for reading.</p>
    <p className="sv-text-sm">Small · sm — hints, descriptions, meta.</p>
    <p className="sv-text-xs">Extra small · xs — badges, timestamps (the floor)</p>
  </div>;
}

function Buttons() {
  return <>
    <div className="ds-row">
      <Button variant="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="ghost" tone="neutral">Ghost neutral</Button>
      <Button variant="ghost" tone="danger">Remove</Button>
      <Button variant="danger">Danger</Button>
    </div>
    <div className="ds-row">
      <Button variant="primary" size="lg">Large</Button>
      <Button variant="primary">Medium</Button>
      <Button variant="primary" size="sm">Small</Button>
      <Button size="icon" variant="ghost" tone="neutral" aria-label="Settings" title="Settings"><SettingsIcon /></Button>
      <Button size="icon-sm" variant="ghost" tone="neutral" aria-label="Close" title="Close"><CloseIcon /></Button>
      <Button size="icon" aria-label="Copy" title="Copy"><CopyIcon /></Button>
    </div>
    <div className="ds-row">
      <Button variant="primary"><AddIcon />Add machine</Button>
      <Button loading variant="primary">Saving</Button>
      <Button disabled variant="primary">Disabled</Button>
      <Button disabled>Disabled</Button>
    </div>
    <Button variant="primary" block>Block — fills its column (phone footers)</Button>
  </>;
}

function Fields() {
  const [text, setText] = useState("Three rows to start with.\nIt grows as you type, up to ten, then scrolls.\nIt is never resized by hand.");
  return <div className="ds-stack">
    <Field label="Machine name" hint="How this machine shows in the room."><Input defaultValue="Office iMac" /></Field>
    <Field label="Room address" error="That does not look like an address." hint="Copy it from the room's pairing screen."><Input defaultValue="sidevoice:/room" /></Field>
    <Field label="Interface language" aside="(optional)">
      <NativeSelect defaultValue="es"><option value="en">English</option><option value="es">Español</option></NativeSelect>
    </Field>
    <Field label="Sample sentence"><Textarea value={text} onChange={(event) => setText(event.target.value)} /></Field>
    <Field label="Disabled"><Input disabled defaultValue="Can't edit" /></Field>
    <div className="ds-row">
      <Input size="sm" placeholder="Small input" aria-label="Small input" style={{ width: "12rem" }} />
      <NativeSelect size="sm" aria-label="Small select" style={{ width: "12rem" }}><option>Small select</option></NativeSelect>
    </div>
  </div>;
}

function Navigation() {
  const id = useId();
  const [tab, setTab] = useState<"macos" | "windows" | "linux">("macos");
  const [seg, setSeg] = useState<"system" | "light" | "dark">("system");
  const [on, setOn] = useState(true);
  return <div className="ds-stack">
    <div>
      <Tabs label="Operating system" idPrefix={id} value={tab} onChange={setTab} items={[{ value: "macos", label: "macOS" }, { value: "windows", label: "Windows" }, { value: "linux", label: "Linux" }]} />
      <p className="sv-text-sm ds-tab-panel" role="tabpanel" id={`${id}-panel-${tab}`} aria-labelledby={`${id}-tab-${tab}`}>Tabs switch views of one thing — here, one set of instructions per system.</p>
    </div>
    <Segmented label="Appearance" value={seg} onChange={setSeg} items={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />
    <Segmented size="sm" label="Runs on" value={seg} onChange={setSeg} items={[{ value: "system", label: "This device" }, { value: "light", label: "Provider" }, { value: "dark", label: "Off", disabled: true }]} />
    <div className="ds-row"><Switch checked={on} onChange={setOn} aria-label="Example switch" /><Switch checked={false} onChange={() => {}} aria-label="Example switch off" /><Switch checked disabled onChange={() => {}} aria-label="Example switch disabled" /></div>
  </div>;
}

function Badges() {
  return <div className="ds-row">
    <Badge>Neutral</Badge><Badge tone="accent">Recommended</Badge><Badge tone="positive" dot>Ready</Badge>
    <Badge tone="warning" dot>Needs a key</Badge><Badge tone="danger" dot>Failed</Badge>
  </div>;
}

function Alerts() {
  return <div className="ds-stack">
    <Alert title="Storage is blocked" tone="warning">This browser won't keep settings. Allow site data to keep them.</Alert>
    <Alert title="Couldn't reach the machine" tone="danger" action={<Button size="sm">Retry</Button>}>It stopped answering 2 minutes ago.</Alert>
    <Alert title="Paired" tone="positive">Office iMac is in the room.</Alert>
    <Alert title="One more step">Install the connector on the machine you want to add.</Alert>
  </div>;
}

function Cards() {
  const [where, setWhere] = useState<"device" | "provider">("device");
  const [send, setSend] = useState(true);
  return <div className="ds-stack">
    <Section title="General" description="How Sidevoice looks and speaks to you on this device.">
      <Group>
        <Row label="Interface language" description="The language of Sidevoice's own words." htmlFor="ds-row-lang">
          <NativeSelect id="ds-row-lang" defaultValue="en"><option value="en">English</option><option value="es">Español</option></NativeSelect>
        </Row>
        <Row label="Appearance"><Segmented size="sm" label="Appearance" value="system" onChange={() => {}} items={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></Row>
        <Row label="End turn on silence" description="Send what you said when you stop talking."><Switch checked={send} onChange={setSend} aria-label="End turn on silence" /></Row>
      </Group>
      <Group title="This device">
        <Row label="Reset this device" description="Forget every setting saved here."><Button variant="ghost" tone="danger" size="sm">Reset…</Button></Row>
      </Group>
    </Section>
    <div className="ds-grid-2" role="radiogroup" aria-label="Where it runs">
      <ChoiceCard selected={where === "device"} onSelect={() => setWhere("device")}><strong>On this device</strong><p className="sv-text-sm">Private, free; a one-time download.</p></ChoiceCard>
      <ChoiceCard selected={where === "provider"} onSelect={() => setWhere("provider")}><strong>With a provider</strong><p className="sv-text-sm">No download; needs an API key.</p></ChoiceCard>
    </div>
  </div>;
}

function Pickers({ locked }: { locked: boolean }) {
  return <>
    <Field label="Family"><NativeSelect disabled={locked} defaultValue="whisper"><option value="whisper">Whisper</option><option value="parakeet">Parakeet</option></NativeSelect></Field>
    <Field label="Model"><NativeSelect disabled={locked} defaultValue="small"><option value="small">whisper-small</option><option value="base">whisper-base</option></NativeSelect></Field>
  </>;
}

const STATES: { status: PrepareStatus; fraction?: number; error?: string }[] = [
  { status: "absent" }, { status: "downloading", fraction: 0.42 }, { status: "verifying" }, { status: "loading" }, { status: "ready" },
  { status: "failed", error: "The connection dropped. Check it and try again." }, { status: "needs-key" },
];

function Prepare() {
  return <div className="ds-stack">
    <ModelPrepare status="absent" model="whisper-small" size={466e6} meta="English, Spanish and 4 more · good accuracy, fast" pickers={(locked) => <Pickers locked={locked} />} />
    {STATES.map((state) => <div className="ds-state" key={state.status}><code>{state.status}</code>
      <ModelPrepare model="whisper-small" size={state.status === "needs-key" ? null : 466e6} {...state} readyAction={<Button size="sm">Try it</Button>} />
    </div>)}
  </div>;
}

function Dialogs({ onOpen }: { onOpen: (layout: "dialog" | "page") => void }) {
  const previewId = useId();
  return <div className="ds-stack">
    <div className="ds-dialog-preview">
      <DialogSurface titleId={previewId} eyebrow="Office iMac" title="Pair a machine" onClose={() => {}}
        footer={<><Button variant="ghost" tone="neutral">Cancel</Button><Button variant="primary">Pair</Button></>}>
        <p className="sv-text-md">Run this on the machine you want to add, then paste the code it shows.</p>
        <Field label="Code"><Input placeholder="XXXX-XXXX" /></Field>
      </DialogSurface>
    </div>
    <div className="ds-row">
      <Button onClick={() => onOpen("dialog")}>Open dialog</Button>
      <Button onClick={() => onOpen("page")}>Open full-screen page</Button>
    </div>
  </div>;
}

function Showcase({ onOpen }: { onOpen: (layout: "dialog" | "page") => void }) {
  return <div className="ds-showcase">
    <Specimen title="Colour" note="Semantic tokens; components never use a raw colour. Mustard is the other voice, nothing else."><Palette /></Specimen>
    <Specimen title="Type" note="DM Sans, the landing's typeface. 15px body; nothing under 12px; sentence case."><Type /></Specimen>
    <Specimen title="Button" note="Soft solid: 10px corners like the fields, a light raise on fills, a small press. Content always centred; one primary per region; loading keeps the width."><Buttons /></Specimen>
    <Specimen title="Field · Input · Select · Textarea" note="Label, control, error, hint. Textareas grow and are never resized by hand."><Fields /></Specimen>
    <Specimen title="Tabs · Segmented · Switch" note="Tabs for views, Segmented for one value of a few, Switch for a boolean."><Navigation /></Specimen>
    <Specimen title="Badge"><Badges /></Specimen>
    <Specimen title="Alert"><Alerts /></Specimen>
    <Specimen title="Section · Group · Row · Choice card" note="Settings: a section, its groups as cards, rows label-left and control-right; stacked when narrow."><Cards /></Specimen>
    <Specimen title="Progress"><ProgressBar value={0.66} label="Example progress" /><ProgressBar value={null} label="Example indeterminate progress" /></Specimen>
    <Specimen title="Model · prepare" note="One block wherever a model is chosen, onboarding and Settings alike. Every state below; Save waits for ‘ready’."><Prepare /></Specimen>
    <Specimen title="Dialog · page shell" note="A head, a body that alone scrolls, a footer in sight. Full screen below 600px."><Dialogs onOpen={onOpen} /></Specimen>
  </div>;
}

const NAV = [
  { value: "general", label: "General", icon: <GeneralIcon /> }, { value: "transcription", label: "Transcription", icon: <TranscriptionIcon /> },
  { value: "voice", label: "Voice", icon: <VoicesIcon /> }, { value: "providers", label: "Providers", icon: <IntegrationsIcon /> },
  { value: "machines", label: "Machines", icon: <MachinesIcon /> }, { value: "advanced", label: "Advanced", icon: <AdvancedIcon /> },
];

/** The full-screen page, as Settings will wear it: Save blocked until the chosen model is ready, and saying why. */
function SettingsExample({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reasonId = useId();
  const [status, setStatus] = useState<PrepareStatus>("absent");
  const [fraction, setFraction] = useState(0);
  useEffect(() => {
    if (status !== "downloading") return;
    const timer = setInterval(() => setFraction((value) => {
      if (value >= 1) { setStatus("verifying"); setTimeout(() => setStatus("loading"), 900); setTimeout(() => setStatus("ready"), 1800); return 1; }
      return Math.min(1, value + 0.08);
    }), 250);
    return () => clearInterval(timer);
  }, [status]);
  const ready = status === "ready";
  return (
    <Dialog open={open} layout="page" titleId="ds-page-title" title="Settings" onClose={onClose} flush
      footer={<>{!ready && <p className="ui-dialog-reason" id={reasonId}>The transcription model isn't ready yet.</p>}
        <Button variant="ghost" tone="neutral" onClick={onClose}>Discard changes</Button>
        <Button variant="primary" disabled={!ready} blockedBy={reasonId} onBlocked={() => document.getElementById("ds-prepare")?.scrollIntoView({ block: "center" })} onClick={onClose}>Save changes</Button></>}>
      <div className="ds-settings">
        <nav className="ui-nav ds-settings-nav" aria-label="Settings sections">
          {NAV.map((item) => <button key={item.value} type="button" className="ui-nav-item" aria-current={item.value === "transcription" ? "page" : undefined}>
            {item.icon}<span>{item.label}</span>{item.value === "transcription" && <span className="ui-nav-dirty" aria-hidden />}</button>)}
        </nav>
        <div className="ds-settings-scroll"><div className="ds-settings-content">
          <Section title="Transcription" description="What turns your voice into text for the agent.">
            <Group>
              <Row label="Runs on"><Segmented size="sm" label="Runs on" value="local" onChange={() => {}} items={[{ value: "local", label: "This device" }, { value: "provider", label: "Provider" }]} /></Row>
              <Row label="Model" description="Pick a family, then one of its models." block>
                <ModelPrepare id="ds-prepare" status={status} model="whisper-small" size={466e6} fraction={fraction} meta="English, Spanish and 4 more · good accuracy, fast"
                  pickers={(locked) => <Pickers locked={locked} />} onDownload={() => { setFraction(0); setStatus("downloading"); }} onCancel={() => setStatus("absent")}
                  readyAction={<Button size="sm">Try it</Button>} />
              </Row>
              <Row label="Language" htmlFor="ds-lang" description="What you speak; auto-detect when unsure.">
                <NativeSelect id="ds-lang" defaultValue="auto"><option value="auto">Detect automatically</option><option value="es">Español</option><option value="en">English</option></NativeSelect>
              </Row>
            </Group>
          </Section>
        </div></div>
      </div>
    </Dialog>
  );
}

/** What the page shows, kept in its address so a view can be shared: `?section=patterns&theme=dark`. */
function useQueryState<Value extends string>(name: string, fallback: Value, allowed: readonly Value[]) {
  const read = () => { const value = new URLSearchParams(location.search).get(name) as Value | null; return value && allowed.includes(value) ? value : fallback; };
  const [value, setValue] = useState<Value>(read);
  const set = (next: Value) => {
    const params = new URLSearchParams(location.search);
    params.set(name, next);
    history.replaceState(null, "", location.pathname + "?" + params.toString());
    setValue(next);
  };
  return [value, set] as const;
}

export function DesignSystemPage() {
  const [view, setView] = useQueryState<View>("theme", "both", ["both", "light", "dark"]);
  const [section, setSection] = useQueryState<"components" | "patterns">("section", "components", ["components", "patterns"]);
  const [open, setOpen] = useState<"dialog" | "page" | null>(null);
  useEffect(() => applyTheme(view === "both" ? "system" : view), [view]);
  const columns: ("light" | "dark")[] = view === "both" ? ["light", "dark"] : [view];
  return <div className="ds-page">
    <header className="ds-top">
      <div className="ds-brand"><SidevoiceMark size={24} /><span>Sidevoice</span><Badge tone="accent">Design system</Badge></div>
      <Tabs className="ds-sections" label="Section" value={section} onChange={setSection} items={[{ value: "components", label: "Components" }, { value: "patterns", label: "App patterns" }]} />
      <div className="ds-controls">
        <div className="ds-control"><span>Theme</span><Segmented size="sm" label="Theme" value={view} onChange={setView} items={[{ value: "both", label: "Both" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} /></div>
      </div>
    </header>
    <div className="ds-columns" data-count={columns.length}>
      {columns.map((theme) => <div className="ds-column" data-theme={theme} key={theme}>
        <p className="ds-column-label">{theme === "light" ? "Light" : "Dark"}</p>
        {section === "components" ? <Showcase onOpen={setOpen} /> : <AppPatterns />}
      </div>)}
    </div>
    <Dialog open={open === "dialog"} layout="dialog" titleId="ds-dialog-title" eyebrow="Office iMac" title="Rename machine" onClose={() => setOpen(null)}
      footer={<><Button variant="ghost" tone="neutral" onClick={() => setOpen(null)}>Cancel</Button><Button variant="primary" onClick={() => setOpen(null)}>Save</Button></>}>
      <p className="sv-text-md">A card over the page; the whole screen on a phone. Escape or the close button dismiss it.</p>
      <Field label="Name"><Input defaultValue="Office iMac" /></Field>
    </Dialog>
    <SettingsExample open={open === "page"} onClose={() => setOpen(null)} />
  </div>;
}
