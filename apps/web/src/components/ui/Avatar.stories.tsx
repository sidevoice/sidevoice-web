import type { Meta, StoryObj } from "@storybook/react-vite";
import { Avatar } from "./Avatar";

/* Initials in a circle. The product's real avatars are the creatures (Product/ConversationAvatar); this one is used once,
 * in the transcript's message groups. */
const meta = {
  title: "Primitives/Avatar",
  component: Avatar,
  args: { name: "Claude Code" },
} satisfies Meta<typeof Avatar>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const Names: Story = {
  render: () => <div className="catalogue-row"><Avatar name="Claude Code" /><Avatar name="codex" /><Avatar name="Sidevoice web" /><Avatar name="" /></div>,
};
