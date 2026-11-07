import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Button } from "./Button";
import { Card, ChoiceCard, Group, Row, Section } from "./Card";
import { Switch } from "./Switch";

/* The settings' building blocks: a Section holds Groups, a Group holds Rows. Card is a bordered surface (no product use
 * yet: the class is written raw, web#530); ChoiceCard is a whole card that is one radio choice. */
const meta = {
  title: "Primitives/Card",
  component: Card,
  args: { children: "A bordered surface." },
} satisfies Meta<typeof Card>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Plain: Story = {};
export const Unpadded: Story = { args: { padded: false, children: <div style={{ padding: 4 }}>No padding of its own.</div> } };

function Choices() {
  const [chosen, setChosen] = useState("here");
  return (
    <div className="catalogue-row" role="radiogroup" aria-label="Where you use your agents" style={{ alignItems: "stretch" }}>
      <ChoiceCard selected={chosen === "here"} onSelect={() => setChosen("here")}><strong>This computer</strong><br />The agents run here.</ChoiceCard>
      <ChoiceCard selected={chosen === "other"} onSelect={() => setChosen("other")}><strong>Another machine</strong><br />Pair it with a code.</ChoiceCard>
    </div>
  );
}
export const ChoiceCards: Story = { render: () => <Choices /> };

function SettingsBlock() {
  const [on, setOn] = useState(true);
  return (
    <div style={{ maxWidth: 620 }}>
      <Section title="Call" description="How a call sounds and behaves." actions={<Button size="sm" variant="ghost">Reset</Button>}>
        <Group title="The thinking sound" note="Plays while the agent works, so silence never reads as a dropped call.">
          <Row label="Thinking sound" description="A soft loop while the agent works." htmlFor="thinking"><Switch id="thinking" checked={on} onChange={setOn} /></Row>
          <Row label="Keep the screen on"><Switch checked={false} onChange={() => {}} /></Row>
          <Row label="A block row" description="Its control goes under the label." block><Button size="sm">Choose</Button></Row>
        </Group>
      </Section>
    </div>
  );
}
export const SectionGroupRow: Story = { name: "Section, Group, Row", render: () => <SettingsBlock /> };
