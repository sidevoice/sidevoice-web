import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { ConnectYourAgent } from "./ConnectYourAgent";

/* What to tell an agent so it joins the room, in the interface's language: a conversation starts in the agent's own
 * session, never from the page. Centred: the title, a creature waiting (always the same one, at rest, drawn sharp where
 * WebGL is available, its fallback elsewhere), the line that says where to say it, the phrase to copy (AgentMessage) and,
 * where the person asked the page to start one (`why`), that it cannot yet, quietly and last. The New conversation panel
 * shows it with `why`; the setup's last step shows it `compact` (the creature beside the title and the line, to fit
 * unscrolled under the recap) with an h3 title. */

function Specimen({ name, width, children }: { name: string; width: number; children: ReactNode }) {
  return <div style={{ width, maxWidth: "100%" }}><p className="catalogue-label">{name}</p>{children}</div>;
}

const meta = {
  title: "Product/Room/ConnectYourAgent",
  component: ConnectYourAgent,
  args: { why: true, titleAs: "p", compact: false },
  argTypes: { titleAs: { control: "inline-radio", options: ["p", "h3"] } },
  decorators: [(Story) => <div style={{ maxWidth: 480 }}><Story /></div>],
} satisfies Meta<typeof ConnectYourAgent>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** As the New conversation panel shows it (with why), without the note, and compact as the setup's last step shows it. */
export const Variants: Story = {
  render: () => (
    <div className="catalogue-stack">
      <Specimen name="Full · why (New conversation panel)" width={440}><ConnectYourAgent why /></Specimen>
      <Specimen name="Full · no note" width={440}><ConnectYourAgent /></Specimen>
      <Specimen name="Compact · h3 (the setup's last step)" width={480}><ConnectYourAgent titleAs="h3" compact /></Specimen>
    </div>
  ),
};
