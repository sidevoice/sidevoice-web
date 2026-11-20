import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Switch } from "./Switch";

const meta = {
  title: "Primitives/Switch",
  component: Switch,
  args: { checked: true, onChange: () => {}, "aria-label": "Thinking sound" },
} satisfies Meta<typeof Switch>;
export default meta;
type Story = StoryObj<typeof meta>;

function Live() {
  const [on, setOn] = useState(true);
  return <Switch checked={on} onChange={setOn} aria-label="Thinking sound" />;
}
export const Interactive: Story = { render: () => <Live /> };
export const States: Story = {
  render: () => (
    <div className="catalogue-row">
      <Switch checked onChange={() => {}} aria-label="On" />
      <Switch checked={false} onChange={() => {}} aria-label="Off" />
      <Switch checked disabled onChange={() => {}} aria-label="On, disabled" />
      <Switch checked={false} disabled onChange={() => {}} aria-label="Off, disabled" />
    </div>
  ),
};
