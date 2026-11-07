import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { CloseIcon, TurnMicIcon } from "./Icons";
import { Pill } from "./Pill";

/* A rounded surface with three slots (lead, label, action); TurnPill is built on it (web#537). Its fill is the caller's:
 * here the catalogue gives it the soft accent. */
const meta = {
  title: "Primitives/Pill",
  component: Pill,
  args: { lead: <TurnMicIcon />, label: "Listening", size: "inline", style: { background: "var(--sv-accent-soft)" } },
  argTypes: { size: { control: "inline-radio", options: ["inline", "stage"] } },
} satisfies Meta<typeof Pill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {};
export const Stage: Story = { args: { size: "stage" } };
export const WithAction: Story = {
  args: { action: <Button size="icon-sm" variant="ghost" tone="neutral" aria-label="Cancel"><CloseIcon /></Button> },
};
export const Sizes: Story = {
  render: (args) => <div className="catalogue-row"><Pill {...args} size="inline" /><Pill {...args} size="stage" /></div>,
};
