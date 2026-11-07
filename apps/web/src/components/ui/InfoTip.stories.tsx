import type { Meta, StoryObj } from "@storybook/react-vite";
import { InfoTip } from "./InfoTip";

const meta = {
  title: "Primitives/InfoTip",
  component: InfoTip,
  args: { label: "About patience", children: "How long Sidevoice waits after you stop before it sends your turn." },
} satisfies Meta<typeof InfoTip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: (args) => <span className="catalogue-row">Patience <InfoTip {...args} /></span> };
