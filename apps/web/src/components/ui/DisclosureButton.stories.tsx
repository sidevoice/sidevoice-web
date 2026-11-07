import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { DisclosureButton } from "./DisclosureButton";

const meta = {
  title: "Primitives/DisclosureButton",
  component: DisclosureButton,
  args: { open: false, controls: "ds-disclosure", children: "I'll do it myself" },
} satisfies Meta<typeof DisclosureButton>;
export default meta;
type Story = StoryObj<typeof meta>;

function Live() {
  const [open, setOpen] = useState(false);
  return (
    <div className="catalogue-stack">
      <DisclosureButton open={open} controls="ds-disclosure" onClick={() => setOpen(!open)}>I'll do it myself</DisclosureButton>
      <div id="ds-disclosure" hidden={!open}>The steps, by hand.</div>
    </div>
  );
}
export const Interactive: Story = { render: () => <Live /> };
export const Closed: Story = {};
export const Open: Story = { args: { open: true } };
