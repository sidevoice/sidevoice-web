import type { Meta, StoryObj } from "@storybook/react-vite";
import { Button } from "./Button";
import { CloseIcon, TurnMicIcon } from "./Icons";
import { Pill } from "./Pill";

/* A rounded surface with three slots (lead, label, action); TurnPill is built on it (web#537). Its fill is the caller's:
 * here the catalogue gives it the soft accent. */
const meta = {
  title: "Primitives/Pill",
  component: Pill,
  args: { lead: <TurnMicIcon />, label: "Listening", size: "inline", style: { background: "var(--sv-accent-soft)" } },
  argTypes: { size: { control: "inline-radio", options: ["inline", "stage"] } },
} satisfies Meta<typeof Pill>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {};
/** "stage" is a step of the stage's own type (`--fs`, set from the tile's size: 16px on the smallest, up to about 28px);
 *  without a stage around it, it falls back to 16px, so it reads a little smaller than "inline" (13px). */
export const Stage: Story = { args: { size: "stage", style: { background: "var(--sv-accent-soft)", "--fs": "22px" } as never } };
export const WithAction: Story = {
  args: { action: <Button size="icon-sm" variant="ghost" tone="neutral" aria-label="Cancel"><CloseIcon /></Button> },
};
/** inline is fixed at 13px (the transcript, a row of text); stage follows the stage's type, shown at three tile sizes. */
export const Sizes: Story = {
  render: (args) => (
    <div className="catalogue-stack">
      {([["inline (13px)", "inline", undefined], ["stage, smallest tile (--fs 16px)", "stage", "16px"], ["stage, medium tile (--fs 22px)", "stage", "22px"], ["stage, large tile (--fs 28px)", "stage", "28px"]] as const).map(([name, size, fs]) => (
        <div key={name}><p className="catalogue-label">{name}</p><Pill {...args} size={size} style={{ ...args.style, ...(fs ? { "--fs": fs } : {}) } as never} /></div>
      ))}
    </div>
  ),
};
