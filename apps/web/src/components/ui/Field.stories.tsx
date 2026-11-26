import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Field } from "./Field";
import { Input, Textarea } from "./Input";
import { Select } from "./Select";

/* Label, control, error and hint, with the ids and aria-describedby wired. */
const meta = {
  title: "Primitives/Field",
  component: Field,
  args: { label: "Machine name", hint: "How this machine shows in the room.", children: <Input defaultValue="Office iMac" /> },
} satisfies Meta<typeof Field>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};
export const WithError: Story = { args: { label: "Room address", error: "That does not look like an address.", hint: "Copy it from the room's pairing screen.", children: <Input defaultValue="sidevoice:/room" invalid /> } };
export const WithAside: Story = { args: { label: "Interface language", aside: "(optional)", hint: undefined, children: <Select defaultValue="en" options={[{ value: "en", label: "English" }, { value: "es", label: "Español" }]} /> } };

function Inputs() {
  const [text, setText] = useState("Three rows to start with.\nIt grows as you type, up to ten, then scrolls.");
  return (
    <div className="catalogue-stack">
      <Field label="Medium input"><Input placeholder="Placeholder" /></Field>
      <Field label="Small input"><Input size="sm" placeholder="Small" /></Field>
      <Field label="Invalid"><Input invalid defaultValue="Not valid" /></Field>
      <Field label="Disabled"><Input disabled defaultValue="Can't edit" /></Field>
      <Field label="Textarea (grows from 3 to 10 rows)"><Textarea value={text} onChange={(event) => setText(event.target.value)} /></Field>
      <Field label="Invalid textarea"><Textarea invalid defaultValue="Too short" minRows={2} /></Field>
    </div>
  );
}
export const InputsAndTextarea: Story = { name: "Input and Textarea", render: () => <Inputs /> };
