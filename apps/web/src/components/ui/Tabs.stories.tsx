import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { GeneralIcon, OtherMachineIcon, ShortcutsIcon, ThisComputerIcon, VoicesIcon } from "./Icons";
import { Segmented, Tabs } from "./Tabs";

/* Tabs switch which panel shows (the logs' devices, in Settings › Crash reports, is their first product use: a machine's mark in each tab, and a row that scrolls sideways when the machines do not fit); Segmented picks one of a few. */
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

/** More machines than the row holds: it scrolls sideways (no scrollbar), as the logs' devices do. */
function ScrollingDemo() {
  const names = ["This device", "NUC", "Workstation", "Old laptop", "Office desktop", "Build server"];
  const [tab, setTab] = useState(names[0]);
  return (
    <div style={{ width: 340 }}>
      <Tabs label="Devices" idPrefix="ds-tabs-scroll" value={tab} onChange={setTab}
        items={names.map((name, index) => ({ value: name, label: name, icon: index === 0 ? <ThisComputerIcon size={16} /> : <OtherMachineIcon size={16} /> }))} />
      <div id={`ds-tabs-scroll-panel-${tab}`} role="tabpanel" style={{ paddingTop: 12 }}>Panel: {tab}</div>
    </div>
  );
}
export const TabsScrolling: Story = { name: "Tabs, scrolling", render: () => <ScrollingDemo /> };

function SegmentedDemo({ size }: { size: "sm" | "md" }) {
  const [theme, setTheme] = useState("system");
  return <Segmented size={size} label="Appearance" value={theme} onChange={setTheme} items={[{ value: "system", label: "System" }, { value: "light", label: "Light" }, { value: "dark", label: "Dark" }]} />;
}
export const SegmentedMedium: Story = { name: "Segmented", render: () => <SegmentedDemo size="md" /> };
export const SegmentedSmall: Story = { name: "Segmented, small", render: () => <SegmentedDemo size="sm" /> };
