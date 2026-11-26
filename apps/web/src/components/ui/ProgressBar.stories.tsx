import type { Meta, StoryObj } from "@storybook/react-vite";
import { ProgressBar } from "./ProgressBar";

const meta = {
  title: "Primitives/ProgressBar",
  component: ProgressBar,
  args: { value: 0.42, label: "Downloading whisper-small" },
  argTypes: { value: { control: { type: "range", min: 0, max: 1, step: 0.01 } } },
  decorators: [(Story) => <div style={{ maxWidth: 420 }}><Story /></div>],
} satisfies Meta<typeof ProgressBar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Determinate: Story = {};
export const Indeterminate: Story = { args: { value: null, label: "Verifying" } };
export const Steps: Story = {
  render: () => <div className="catalogue-stack">{[0, 0.25, 0.5, 0.75, 1].map((value) => <ProgressBar key={value} value={value} label={`${value * 100}%`} />)}</div>,
};
