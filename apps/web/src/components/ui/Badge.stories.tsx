import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { tone: "neutral", children: "Downloaded" },
  argTypes: { tone: { control: "inline-radio", options: ["neutral", "accent", "positive", "warning", "danger"] } },
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
