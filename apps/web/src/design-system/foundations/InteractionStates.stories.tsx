import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { Switch } from "../../components/ui/Switch";
import { CloseIcon } from "../../components/ui/Icons";
import { translator } from "../../i18n/translator";

/* One hover, one press, one focus for every control (ui.css, "States"). Button steps its fills to its own tokens (Primitives
 * › Button › Hover, press, focus); every other control wears `ui-state`, which lays the theme's wash over whatever fill it
 * has: --sv-hover on hover (only where there is a pointer), --sv-pressed on press, the 2px --sv-focus ring from the
 * keyboard. Under reduced motion the colours change at once. The states are forced by storybook-addon-pseudo-states. */

const meta = {
  title: "Foundations/Interaction states",
  tags: ["!autodocs"],
  parameters: { pseudo: { hover: [".is-hover"], active: [".is-press"], focusVisible: [".is-focus"] } },
} satisfies Meta;
export default meta;
type Story = StoryObj<typeof meta>;

const INTERACTIONS = ["rest", "hover", "press", "focus", "disabled"] as const;

function Grid({ rows }: { rows: [string, (state: (typeof INTERACTIONS)[number]) => ReactNode][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: `max-content repeat(${INTERACTIONS.length}, max-content)`, gap: "14px 18px", alignItems: "center" }}>
      <span />
      {INTERACTIONS.map((state) => <p key={state} className="catalogue-label" style={{ margin: 0 }}>{state}</p>)}
      {rows.map(([name, cell]) => <div key={name} style={{ display: "contents" }}>
        <p className="catalogue-label" style={{ margin: 0 }}>{name}</p>
        {INTERACTIONS.map((state) => <span key={state}>{cell(state)}</span>)}
      </div>)}
    </div>
  );
}

/* A control drawn its own way, on the fills it sits on: no fill, the page, a raised surface, the accent's soft fill. */
const plain = (background: string, label: string) => (state: (typeof INTERACTIONS)[number]) =>
  <button type="button" className={`ui-state is-${state}`} disabled={state === "disabled"}
    style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 32, padding: "0 12px", border: 0, borderRadius: "var(--sv-radius-md)", backgroundColor: background, color: state === "disabled" ? "var(--sv-disabled-text)" : "var(--sv-text)", font: "inherit", fontSize: "var(--sv-font-sm)", cursor: "pointer" }}>{label}</button>;
const round = (state: (typeof INTERACTIONS)[number]) =>
  <button type="button" className={`ui-state is-${state}`} disabled={state === "disabled"} aria-label={translator()("sidebar.close")}
    style={{ display: "grid", placeItems: "center", width: 28, height: 28, padding: 0, border: 0, borderRadius: "50%", backgroundColor: "var(--sv-bg-sunken)", color: "var(--sv-text-muted)", cursor: "pointer" }}><CloseIcon size={14} /></button>;

export const StateLayer: Story = {
  name: "ui-state",
  render: () => <Grid rows={[
    ["no fill", plain("transparent", "Call details")],
    ["--sv-bg-subtle", plain("var(--sv-bg-subtle)", "Listen again")],
    ["--sv-surface", plain("var(--sv-surface)", "Details")],
    ["--sv-accent-soft", plain("var(--sv-accent-soft)", "This device")],
    ["round, sunken", round],
  ]} />,
};

export const Switches: Story = {
  render: () => <Grid rows={[
    ["off", (state) => <Switch className={`is-${state}`} checked={false} disabled={state === "disabled"} onChange={() => {}} aria-label="Off" />],
    ["on", (state) => <Switch className={`is-${state}`} checked disabled={state === "disabled"} onChange={() => {}} aria-label="On" />],
  ]} />,
};
