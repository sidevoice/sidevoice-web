import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { GeneralIcon, ShortcutsIcon, VoicesIcon } from "./Icons";
import { Segmented, Tabs } from "./Tabs";

/* Tabs switch which panel shows (no product use yet: an open question in web#530); Segmented picks one of a few. */
const meta = {
  title: "Primitives/Tabs",
  component: Segmented,
  args: { label: "Appearance", value: "system", onChange: () => {}, items: [{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }] },
} satisfies Meta<typeof Segmented>;
export default meta;
type Story = StoryObj<typeof meta>;

function TabsDemo() {
  const [tab, setTab] = useState<"general" | "voice" | "keys">("general");
  return (
    <div className="catalogue-stack">
      <Tabs label="Settings sections" idPrefix="ds-tabs" value={tab} onChange={setTab}
        items={[{ value: "general", label: "General", icon: <GeneralIcon /> }, { value: "voice", label: "Voice", icon: <VoicesIcon /> }, { value: "keys", label: "Shortcuts", icon: <ShortcutsIcon />, disabled: true }]} />
      <div id={`ds-tabs-panel-${tab}`} role="tabpanel">Panel: {tab}</div>
    </div>
  );
}
export const TabsPanels: Story = { name: "Tabs", render: () => <TabsDemo /> };

function SegmentedDemo({ size }: { size: "sm" | "md" }) {
  const [theme, setTheme] = useState("system");
  return <Segmented size={size} label="Appearance" value={theme} onChange={setTheme} items={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />;
}
export const SegmentedMedium: Story = { name: "Segmented", render: () => <SegmentedDemo size="md" /> };
export const SegmentedSmall: Story = { name: "Segmented, small", render: () => <SegmentedDemo size="sm" /> };
