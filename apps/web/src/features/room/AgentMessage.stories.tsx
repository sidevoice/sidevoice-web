import type { Meta, StoryObj } from "@storybook/react-vite";
import { AgentMessage } from "./AgentMessage";
import { translator } from "../../i18n/translator";

/* The phrase to say to an agent, as a command palette's line (the landing's message for the agent): the Sidevoice mark at
 * its start, the phrase a step above the body in the text colour, in a raised box with a lila edge and its soft ring, and
 * its copy button at the end, vertically centred. About 480px at most: one line where it fits, balanced over two where it
 * does not. The copy button is quiet (no fill, its icon in the strong border colour) until the pointer is over the line
 * or the keyboard is on the button — point at it to see — and always in its own look on a touch screen. It copies as a
 * Quote does (CopyButton): the ✓ and the failure are pinned with `feedback` (Playground), since pressing it here writes
 * to the clipboard. Shown by ConnectYourAgent: the New conversation panel and the setup's last step. */

type Args = { text: string; label: string; feedback?: "copied" | "failed" };

const meta = {
  title: "Product/Room/AgentMessage",
  args: { text: "", label: "", feedback: undefined },
  argTypes: {
    text: { control: "text", description: "Empty: the interface's phrase (connect.phrase), as ConnectYourAgent gives it." },
    label: { control: "text", description: "The copy button's name. Empty: the interface's (sidebar.newCopy)." },
    feedback: { control: "inline-radio", options: [undefined, "copied", "failed"], description: "Pins the copy button in a feedback state." },
  },
  render: ({ text, label, feedback }) => {
    const t = translator();
    return <AgentMessage text={text || t("connect.phrase")} label={label || t("sidebar.newCopy")} feedback={feedback} />;
  },
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

/** Where it has room (one line), where it does not (balanced over two: a phone, a long language), and the copy button's
 *  feedback once pressed (pinned). */
export const Specimens: Story = {
  render: () => {
    const t = translator();
    const phrase = t("connect.phrase"), label = t("sidebar.newCopy");
    return (
      <div className="catalogue-stack">
        <div><p className="catalogue-label">One line (up to 32rem)</p><AgentMessage text={phrase} label={label} /></div>
        <div style={{ width: 240 }}><p className="catalogue-label">Narrow: balanced over two lines</p><AgentMessage text={phrase} label={label} /></div>
        <div><p className="catalogue-label">Copied (pinned)</p><AgentMessage text={phrase} label={label} feedback="copied" /></div>
        <div><p className="catalogue-label">Copy failed (pinned)</p><AgentMessage text={phrase} label={label} feedback="failed" /></div>
      </div>
    );
  },
};
