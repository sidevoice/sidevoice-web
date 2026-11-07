import type { Meta, StoryObj } from "@storybook/react-vite";
import { Alert } from "./Alert";
import { Button } from "./Button";

const meta = {
  title: "Primitives/Alert",
  component: Alert,
  args: { tone: "accent", title: "The model is downloading", children: "It keeps going if you close Settings." },
  argTypes: { tone: { control: "inline-radio", options: ["accent", "positive", "warning", "danger"] } },
} satisfies Meta<typeof Alert>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
  render: () => (
    <div className="catalogue-stack">
      <Alert tone="accent" title="Accent">A note about what is going on.</Alert>
      <Alert tone="positive" title="Positive">It worked: the machine is connected.</Alert>
      <Alert tone="warning" title="Warning">This machine has not answered for a while.</Alert>
      <Alert tone="danger" title="Danger">The download failed.</Alert>
    </div>
  ),
};

export const WithActionAndDetails: Story = {
  args: { tone: "danger", title: "The download failed", children: "Check the connection and try again.", details: "ECONNRESET: socket hang up (models.example)", action: <Button size="sm">Retry</Button> },
};

export const BodyOnly: Story = { args: { title: undefined, children: "A single line, without a title." } };
