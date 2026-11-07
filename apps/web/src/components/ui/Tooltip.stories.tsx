import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { SettingsIcon } from "./Icons";
import { Tooltip } from "./Tooltip";

/* Hover or keyboard focus on a desktop; a tap on touch. `action` for a button that does something: a press does it and
 * puts the tooltip away. */
const meta = {
  title: "Primitives/Tooltip",
  component: Tooltip,
  args: { content: "Settings", children: <Button size="icon" variant="ghost" tone="neutral" aria-label="Settings"><SettingsIcon /></Button> },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Tooltip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Explains: Story = {};
export const Action: Story = { args: { action: true } };
export const LongContent: Story = { args: { content: "Plays while the agent works, so a silence never reads as a dropped call.", children: <Button>Hover me</Button> } };
