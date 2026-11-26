import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { CloseIcon, EditIcon, MoreIcon } from "./Icons";
import { DropdownMenu, DropdownMenuItem } from "./DropdownMenu";
import { ContextMenu, ContextMenuItem } from "./ContextMenu";
// The menus' CSS lives with the sidebar's rows, not with the primitive (web#530, DUPLICATES: `.ui-dropdown*` in room.css).
import "../../features/room/room.css";

const meta = {
  title: "Primitives/Menus",
  component: DropdownMenu,
  args: {
    label: "Options for release",
    trigger: <Button variant="ghost" tone="neutral" size="icon-sm" aria-label="Options for release"><MoreIcon /></Button>,
    children: <><DropdownMenuItem><EditIcon />Rename</DropdownMenuItem><DropdownMenuItem danger><CloseIcon />Remove from this device</DropdownMenuItem></>,
  },
  parameters: { layout: "centered" },
} satisfies Meta<typeof DropdownMenu>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Dropdown: Story = {};
export const Context: Story = {
  name: "Context menu (secondary click)",
  render: () => (
    <ContextMenu label="Options for release" items={<><ContextMenuItem><EditIcon />Rename</ContextMenuItem><ContextMenuItem danger><CloseIcon />Remove from this device</ContextMenuItem></>}>
      <div className="ui-card" style={{ padding: 24 }}>Right-click here</div>
    </ContextMenu>
  ),
};
