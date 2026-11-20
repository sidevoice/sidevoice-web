import type { Meta, StoryObj } from "@storybook/react-vite";
import { Component, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import * as Icons from "../../components/ui/Icons";
import { isColour, useTokens, valueAt } from "./tokens";
import "./foundations.css";

/* The foundations every component is built from: the tokens of styles/theme.css and styles/tokens.css, read from the
 * page (tokens.ts), and the icon set of components/ui/Icons.tsx, listed from its exports. Nothing here is a second
 * list: add a token or an icon and it shows. Catalogue labels are English. */

const meta = {
  title: "Foundations",
  tags: ["!autodocs"],
  parameters: { layout: "fullscreen" },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

/** A token's resolved value in this column's theme, measured once it is on the page. */
function useValue(token: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  useEffect(() => { setValue(valueAt(ref.current, token)); }, [token]);
  return [ref, value] as const;
}

function Swatch({ token }: { token: string }) {
  const [ref, value] = useValue(token);
  return (
    <div className="fd-swatch" ref={ref}>
      <div className="fd-swatch-chip" style={{ background: `var(${token})` }} />
      <span className="fd-name" title={token}>{token.slice(5)}</span>
      <span className="fd-value" title={value}>{value}</span>
    </div>
  );
}

const COLOUR_GROUPS: [string, RegExp][] = [
  ["Surfaces", /^--sv-(bg|surface|stage-bg|scrim|input-bg|disabled)/],
  ["Text", /^--sv-(text|on-|disabled-text)/],
  ["Borders and focus", /^--sv-(border|focus|bubble-edge|button-border)/],
  ["Accent", /^--sv-accent/],
  ["Voice", /^--sv-voice/],
  ["Status", /^--sv-(positive|warning|danger)/],
  ["Conversation states", /^--sv-state-/],
  ["Chat", /^--sv-chat-/],
  ["Controls", /^--sv-(button|hover|pressed)/],
  ["Overlays", /^--sv-(tooltip|toast)/],
];

function ColourGroups() {
  const all = useTokens(/^--sv-/);
  const [colours, setColours] = useState<string[]>([]);
  const probe = useRef<HTMLDivElement>(null);
  useEffect(() => { setColours(all.filter((token) => isColour(valueAt(probe.current, token)))); }, [all]);
  const placed = new Set<string>();
  const groups = COLOUR_GROUPS.map(([title, pattern]) => {
    const tokens = colours.filter((token) => pattern.test(token) && !placed.has(token));
    tokens.forEach((token) => placed.add(token));
    return [title, tokens] as const;
  });
  const rest = colours.filter((token) => !placed.has(token));
  return (
    <div ref={probe}>
      {[...groups, ["Other", rest] as const].filter(([, tokens]) => tokens.length).map(([title, tokens]) => (
        <section className="fd-group" key={title}>
          <h3>{title}</h3>
          <div className="fd-grid">{tokens.map((token) => <Swatch key={token} token={token} />)}</div>
        </section>
      ))}
    </div>
  );
}

export const Colour: Story = { render: () => <ColourGroups /> };

function Measured({ token, children }: { token: string; children: (value: string) => ReactNode }) {
  const [ref, value] = useValue(token);
  return <div className="fd-row" ref={ref}><span className="fd-name">{token.slice(5)}</span><span className="fd-value">{value}</span>{children(value)}</div>;
}

const SAMPLE = "Talk to your agents while you work";

function TypeScale() {
  const sizes = useTokens(/^--sv-font-(xs|sm|md|lg|xl|2xl|body)$/);
  const weights = useTokens(/^--sv-weight-/);
  const families = useTokens(/^--sv-font-(sans|mono|cjk|indic)$/);
  return (
    <>
      <section className="fd-group"><h3>Sizes (scaled by the text-size setting)</h3><div className="fd-rows">
        {sizes.map((token) => <Measured key={token} token={token}>{() => <p className="fd-type-sample" style={{ fontSize: `var(${token})` }}>{SAMPLE}</p>}</Measured>)}
      </div></section>
      <section className="fd-group"><h3>Weights</h3><div className="fd-rows">
        {weights.map((token) => <Measured key={token} token={token}>{() => <p className="fd-type-sample" style={{ fontWeight: `var(${token})` }}>{SAMPLE}</p>}</Measured>)}
      </div></section>
      <section className="fd-group"><h3>Families</h3><div className="fd-rows">
        {families.map((token) => <Measured key={token} token={token}>{() => <p className="fd-type-sample" style={{ fontFamily: `var(${token})` }}>{SAMPLE} · 0123456789</p>}</Measured>)}
      </div></section>
    </>
  );
}

export const Type: Story = { render: () => <TypeScale /> };

function Spacings() {
  const spaces = useTokens(/^--sv-space-/);
  const controls = useTokens(/^--sv-(control-|call-button|header-height)/);
  return (
    <>
      <section className="fd-group"><h3>Spacing</h3><div className="fd-rows">
        {spaces.map((token) => <Measured key={token} token={token}>{() => <div className="fd-bar" style={{ width: `var(${token})` }} />}</Measured>)}
      </div></section>
      <section className="fd-group"><h3>Control and layout sizes</h3><div className="fd-rows">
        {controls.map((token) => <Measured key={token} token={token}>{() => <div className="fd-bar" style={{ width: `var(${token})`, height: `var(${token})`, maxHeight: 48 }} />}</Measured>)}
      </div></section>
    </>
  );
}

export const Spacing: Story = { render: () => <Spacings /> };

function RadiiAndShadows() {
  const radii = useTokens(/^--sv-radius-/);
  const shadows = useTokens(/^--sv-shadow-/);
  return (
    <>
      <section className="fd-group"><h3>Radii</h3><div className="fd-rows">
        {radii.map((token) => <Measured key={token} token={token}>{() => <div className="fd-radius" style={{ borderRadius: `var(${token})` }} />}</Measured>)}
      </div></section>
      <section className="fd-group"><h3>Shadows</h3><div className="fd-rows">
        {shadows.map((token) => <Measured key={token} token={token}>{() => <div className="fd-shadow" style={{ boxShadow: `var(${token})` }} />}</Measured>)}
      </div></section>
    </>
  );
}

export const Radii: Story = { name: "Radii and shadows", render: () => <RadiiAndShadows /> };

/** An icon that cannot draw without props it was not given shows its name alone, not a broken page. */
class Guard extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <span className="fd-value">needs props</span> : this.props.children; }
}

// The ones that need a prop to say which: each drawn with every value it takes.
const STATE_KINDS = ["listening", "transcribing", "speaking", "working", "muted", "holding", "offline"] as const;
const PROVIDERS = ["openai", "elevenlabs"];
const HARNESSES = ["claude-code", "codex", "cursor"];
const PLATFORMS = ["macos", "windows", "linux"];
const NEEDS_PROPS = new Set(["StateGlyph", "ProviderLogo", "HarnessIcon", "PlatformIcon"]);

function IconSet() {
  const entries = Object.entries(Icons)
    .filter(([name, value]) => /^[A-Z]/.test(name) && typeof value === "function" && !NEEDS_PROPS.has(name)) as [string, ComponentType][];
  const cell = (name: string, node: ReactNode) => (
    <div className="fd-icon" key={name}><div className="fd-icon-art"><Guard>{node}</Guard></div><span className="fd-name" title={name}>{name}</span></div>
  );
  return (
    <>
      <section className="fd-group"><h3>Icons and marks ({entries.length}), at their own default size</h3>
        <div className="fd-icons">{entries.map(([name, Icon]) => cell(name, <Icon />))}</div>
      </section>
      <section className="fd-group"><h3>StateGlyph</h3>
        <div className="fd-icons">{STATE_KINDS.map((kind) => cell(`kind="${kind}"`, <Icons.StateGlyph kind={kind} size={20} />))}</div>
      </section>
      <section className="fd-group"><h3>ProviderLogo, HarnessIcon, PlatformIcon</h3>
        <div className="fd-icons">
          {PROVIDERS.map((provider) => cell(`ProviderLogo ${provider}`, <Icons.ProviderLogo provider={provider} size={24} />))}
          {HARNESSES.map((harness) => cell(`HarnessIcon ${harness}`, <Icons.HarnessIcon harness={harness} size={24} />))}
          {PLATFORMS.map((platform) => cell(`PlatformIcon ${platform}`, <Icons.PlatformIcon platform={platform} size={20} />))}
        </div>
      </section>
    </>
  );
}

export const IconsSet: Story = { name: "Icons", render: () => <IconSet /> };

function Durations() {
  const durations = useTokens(/^--sv-dur-/);
  const [on, setOn] = useState(false);
  useEffect(() => { const timer = setInterval(() => setOn((value) => !value), 1600); return () => clearInterval(timer); }, []);
  return (
    <>
      <section className="fd-group"><h3>Durations, on the shared easing (--sv-ease)</h3><div className="fd-rows">
        {durations.map((token) => <Measured key={token} token={token}>{() => (
          <div className="fd-motion-track" data-on={on || undefined}><span className="fd-motion-dot" style={{ transitionDuration: `var(${token})` }} /></div>
        )}</Measured>)}
      </div></section>
      <section className="fd-group"><h3>Motion policy</h3>
        <p className="fd-type-sample">The page decides once whether its drawings may move: <code>data-motion="gpu"</code> where a GPU composites
          them, <code>"still"</code> under reduced motion or without one (lib/motion.ts). The toolbar's Motion switch sets it here; the
          <code> prefers-reduced-motion</code> media query itself is emulated from the browser's devtools (Rendering).</p>
      </section>
    </>
  );
}

export const Motion: Story = { render: () => <Durations /> };
