import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { Popover, PopoverClose } from "./Popover";

/* A small panel anchored to what opened it: a few lines and an action, not a dialog. */
const meta = {
  title: "Primitives/Popover",
  component: Popover,
  args: {
    label: "Connect your agent",
    side: "bottom",
    trigger: <Button>Open popover</Button>,
    children: <div className="catalogue-stack" style={{ padding: 4, maxWidth: 280 }}><strong>Connect your agent to talk to it</strong><p style={{ margin: 0 }}>Ask it to connect to Sidevoice.</p><PopoverClose asChild><Button size="sm">Got it</Button></PopoverClose></div>,
  },
  argTypes: { side: { control: "inline-radio", options: ["top", "right", "bottom", "left"] }, align: { control: "inline-radio", options: ["start", "center", "end"] } },
  parameters: { layout: "centered" },
} satisfies Meta<typeof Popover>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const HeldOpen: Story = { args: { open: true, onOpenChange: () => {} } };
