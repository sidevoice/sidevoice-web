import type { Meta, StoryObj } from "@storybook/react-vite";
import { Quote, Snippet } from "./Snippet";

/* The only two ways to show something to copy: a command (Snippet) and a sentence (Quote). */
const meta = {
  title: "Primitives/Snippet",
  component: Snippet,
  args: { text: "curl -fsSL https://sidevoice.ai/install.sh | sh" },
  argTypes: { feedback: { control: "inline-radio", options: [undefined, "copied", "failed"] } },
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
} satisfies Meta<typeof Snippet>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Command: Story = {};
export const Copied: Story = { args: { feedback: "copied" } };
export const Failed: Story = { args: { feedback: "failed" } };
export const QuoteText: Story = { name: "Quote", render: () => <Quote text="Connect to Sidevoice so we can talk while you work." /> };
