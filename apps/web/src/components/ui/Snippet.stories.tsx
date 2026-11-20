import type { Meta, StoryObj } from "@storybook/react-vite";
import { useRef } from "react";
import { CopyButton, Quote, Snippet } from "./Snippet";

/* The only two ways to show something to copy: a command (Snippet) and a sentence (Quote). Something to copy drawn its own
 * way (the new conversation's agent message) wears their CopyButton, so a copy goes, and says how it went, the same
 * everywhere. */
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

/** The copy button alone, beside text drawn its own way: a press copies the text and selects it in its target. */
function OwnText({ feedback }: { feedback?: "copied" | "failed" }) {
  const target = useRef<HTMLSpanElement>(null);
  const text = "Connect to Sidevoice so we can talk while you work.";
  return <div className="catalogue-row"><span ref={target}>{text}</span><CopyButton text={text} feedback={feedback} target={target} /></div>;
}
export const CopyButtonAlone: Story = {
  name: "CopyButton",
  render: () => <div className="catalogue-stack"><OwnText /><OwnText feedback="copied" /><OwnText feedback="failed" /></div>,
};
