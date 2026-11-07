import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./Button";
import { Dialog, DialogSurface } from "./Dialog";

/* DialogSurface is the frame (head, a body that alone scrolls, a footer in sight); Dialog puts it in a native modal, or a
 * full page below 600px (`layout="page"`). */
const meta = {
  title: "Primitives/Dialog",
  component: DialogSurface,
  args: { titleId: "ds-dialog-title", title: "Remove this machine?", children: <p>Its conversations leave this device. You can pair it again later.</p> },
} satisfies Meta<typeof DialogSurface>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Surface: Story = {
  render: (args) => (
    <div className="catalogue-dialog-preview">
      <DialogSurface {...args} onClose={() => {}} footer={<><Button>Cancel</Button><Button variant="danger">Remove</Button></>} />
    </div>
  ),
};

function Modal({ layout }: { layout: "dialog" | "page" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)}>Open {layout}</Button>
      <Dialog id={`ds-${layout}`} open={open} layout={layout} onClose={() => setOpen(false)} titleId={`ds-${layout}-title`} title="Settings"
        footer={<Button variant="primary" onClick={() => setOpen(false)}>Done</Button>}>
        <p>The body scrolls on its own; the head and the footer stay.</p>
        {Array.from({ length: 12 }, (_, i) => <p key={i}>Line {i + 1}</p>)}
      </Dialog>
    </>
  );
}
export const ModalDialog: Story = { render: () => <Modal layout="dialog" /> };
export const ModalPage: Story = { render: () => <Modal layout="page" /> };
