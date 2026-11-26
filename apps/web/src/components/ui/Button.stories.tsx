import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ComponentProps } from "react";
import { fn } from "storybook/test";
import { Button } from "./Button";
import { AddIcon, CloseIcon, CopyIcon, SettingsIcon } from "./Icons";
import { translator } from "../../i18n/translator";

/* The one button. Catalogue labels are English; what the product says comes from the catalogue (`t`). */
const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Continue", onClick: fn() },
  argTypes: {
    variant: { control: "inline-radio", options: ["primary", "secondary", "ghost", "danger"] },
    tone: { control: "inline-radio", options: ["accent", "neutral", "danger"] },
    size: { control: "inline-radio", options: ["sm", "md", "lg", "icon", "icon-sm"] },
  },
} satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = { args: { variant: "primary" } };

export const Variants: Story = {
  render: () => (
    <div className="catalogue-row">
      <Button variant="primary">Primary</Button>
      <Button>Secondary</Button>
      <Button variant="ghost">Ghost</Button>
      <Button variant="ghost" tone="neutral">Ghost neutral</Button>
      <Button variant="ghost" tone="danger">Ghost danger</Button>
      <Button variant="danger">Danger</Button>
    </div>
  ),
};

export const Sizes: Story = {
  render: () => {
    const t = translator();
    return (
      <div className="catalogue-row">
        <Button variant="primary" size="lg">Large</Button>
        <Button variant="primary">Medium</Button>
        <Button variant="primary" size="sm">Small</Button>
        <Button size="icon" variant="ghost" tone="neutral" aria-label={t("header.settings")}><SettingsIcon /></Button>
        <Button size="icon-sm" variant="ghost" tone="neutral" aria-label={t("sidebar.close")}><CloseIcon /></Button>
        <Button size="icon" aria-label="Copy"><CopyIcon /></Button>
      </div>
    );
  },
};

export const States: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div className="catalogue-row">
        <Button variant="primary"><AddIcon />With an icon</Button>
        <Button loading variant="primary">Loading</Button>
        <Button disabled variant="primary">Disabled</Button>
        <Button disabled>Disabled</Button>
      </div>
      <div className="catalogue-row">
        <Button disabled blockedBy="why-blocked" onBlocked={fn()}>Blocked by a reason</Button>
        <span id="why-blocked" className="muted">The reason, which the button reads as its description.</span>
      </div>
      <Button variant="primary" block>Block: fills its column</Button>
    </div>
  ),
};

/* Every look of the button in every interaction state, side by side: at rest, hovered, pressed, focused from the keyboard,
 * disabled. Hover, press and focus are forced by storybook-addon-pseudo-states on the cells that name them, so what shows
 * is the stylesheet's own :hover, :active and :focus-visible. */
const LOOKS: { name: string; props: Partial<ComponentProps<typeof Button>> }[] = [
  { name: "primary", props: { variant: "primary" } },
  { name: "secondary", props: { variant: "secondary" } },
  { name: "ghost", props: { variant: "ghost" } },
  { name: "ghost neutral", props: { variant: "ghost", tone: "neutral" } },
  { name: "ghost danger", props: { variant: "ghost", tone: "danger" } },
  { name: "danger", props: { variant: "danger" } },
];
const INTERACTIONS = ["rest", "hover", "press", "focus", "disabled"] as const;

export const InteractionStates: Story = {
  name: "Hover, press, focus",
  parameters: { pseudo: { hover: [".is-hover"], active: [".is-press"], focusVisible: [".is-focus"] } },
  render: () => (
    <div style={{ display: "grid", gridTemplateColumns: `max-content repeat(${INTERACTIONS.length}, max-content)`, gap: "12px 16px", alignItems: "center" }}>
      <span />
      {INTERACTIONS.map((state) => <p key={state} className="catalogue-label" style={{ margin: 0 }}>{state}</p>)}
      {LOOKS.map(({ name, props }) => <div key={name} style={{ display: "contents" }}>
        <p className="catalogue-label" style={{ margin: 0 }}>{name}</p>
        {INTERACTIONS.map((state) => <span key={state}>
          <Button {...props} size="sm" className={`is-${state}`} disabled={state === "disabled"}><AddIcon />Connect</Button>
        </span>)}
      </div>)}
    </div>
  ),
};
