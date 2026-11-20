import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState, type ReactNode } from "react";
import { NewConversation } from "./NewConversation";
import { ConnectYourAgent } from "./ConnectYourAgent";
import { OverlayPortalProvider } from "../../components/ui/Tooltip";
import "./new-conversation.css";

/* A new conversation, from the foot of the conversations: the sidebar's button, or a "+" in its rail (a phone's header
 * has a third trigger, a dashed circle in the avatars' row, styled only at a phone's width: not shown). The page cannot
 * start one yet, so its panel says what to tell the agent (ConnectYourAgent with `why`), wider than a popover (30rem) so
 * the phrase to copy has room. "Panel" draws it as its popover does (`.ui-popover.connect-popover`) but in the page, so it
 * shows open in both themes: an open popover closes when another takes the focus. "Triggers" are the real ones: press one
 * to open the real panel beside it. */

/** Overlays opened inside drawn in this box, so they wear its theme (each theme's column is its own). */
function Overlays({ children }: { children: ReactNode }) {
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  return <div ref={setBox}><OverlayPortalProvider container={box}>{children}</OverlayPortalProvider></div>;
}

const meta = {
  title: "Product/Room/NewConversation",
  component: NewConversation,
  args: { rail: false, header: false },
  argTypes: { header: { control: false, description: "A phone's header trigger: styled only at a phone's width." } },
} satisfies Meta<typeof NewConversation>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The panel, open: the popover's frame (raised surface, its border and shadow, 30rem) around what to tell the agent. */
export const Panel: Story = {
  render: () => <div className="ui-popover connect-popover" style={{ position: "static" }}><ConnectYourAgent why /></div>,
};

/** The sidebar's button (secondary, the column's width) and the rail's "+" (ghost icon): each opens the panel, above the
 *  button and to the right of the "+". */
export const Triggers: Story = {
  parameters: { layout: "fullscreen" },
  render: () => (
    <Overlays>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 48, minHeight: 560, padding: 24 }}>
        <div style={{ width: 240 }}><p className="catalogue-label">Sidebar</p><NewConversation /></div>
        <div><p className="catalogue-label">Rail</p><NewConversation rail /></div>
      </div>
    </Overlays>
  ),
};
