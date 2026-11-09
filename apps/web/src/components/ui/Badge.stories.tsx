import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { tone: "neutral", children: "Downloaded" },
  argTypes: { tag: { control: "boolean" }, dot: { control: "boolean" }, tone: { control: "inline-radio", options: ["neutral", "accent", "positive", "warning", "danger"] } },
} satisfies Meta<typeof Badge>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div className="catalogue-row">
        <Badge>Neutral</Badge><Badge tone="accent">Recommended</Badge><Badge tone="positive">Ready</Badge><Badge tone="warning">Needs a key</Badge><Badge tone="danger">Failed</Badge>
      </div>
      <div className="catalogue-row">
        <Badge dot>Neutral</Badge><Badge tone="accent" dot>Recommended</Badge><Badge tone="positive" dot>Ready</Badge><Badge tone="warning" dot>Needs a key</Badge><Badge tone="danger" dot>Failed</Badge>
      </div>
    </div>
  ),
};

/** A `tag`: the status beside a row's name (a provider's, an agent's, in Settings). Smaller and lighter, with a quiet
 *  border in its own colour, so it reads as a label rather than a button. */
export const Tags: Story = {
  render: () => (
    <div className="catalogue-stack">
      <div className="catalogue-row">
        <Badge tag>Checking…</Badge><Badge tag tone="accent">In use for speech</Badge><Badge tag tone="positive">Connected</Badge><Badge tag tone="warning" dot>Needs attention</Badge><Badge tag tone="danger" dot>Couldn't connect</Badge><Badge tag dot>Not connected</Badge>
      </div>
      <div className="catalogue-row">
        <Badge tone="positive">Plain</Badge><Badge tag tone="positive">Tag</Badge>
      </div>
    </div>
  ),
};
