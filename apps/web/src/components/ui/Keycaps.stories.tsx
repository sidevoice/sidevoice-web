import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { Keys, ShortcutKeys } from "./Keycaps";
import { ShortcutField } from "./ShortcutField";
import { translator } from "../../i18n/translator";
// Keys and ShortcutField are primitives whose CSS lives in Settings' stylesheet (web#530).
import "../../features/settings/settings.css";

const meta = {
  title: "Primitives/Keys and ShortcutField",
  component: Keys,
  args: { combo: "⌃⌥M" },
} satisfies Meta<typeof Keys>;
export default meta;
type Story = StoryObj<typeof meta>;

export const KeyCaps: Story = {
  name: "Keys",
  render: () => (
    <div className="catalogue-row">
      <Keys combo="⌃⌥M" /><Keys combo="Ctrl+Shift+M" /><Keys combo="Right ⌥" how="hold" /><Keys combo="Space" /><ShortcutKeys id="mute" />
    </div>
  ),
};

function Field({ initial, error, disabled }: { initial: string | null; error?: string; disabled?: boolean }) {
  const t = translator();
  const [recording, setRecording] = useState(false);
  const [combo, setCombo] = useState(initial);
  return (
    <ShortcutField label={t("settings.shortcuts.mute")} combo={combo} recording={recording} recordingText={t("settings.shortcuts.recordingInApp")}
      placeholder={t("settings.shortcuts.record")} escLabel={t("settings.shortcuts.escape")} onToggle={() => setRecording(!recording)}
      clearLabel={t("settings.shortcuts.clear")} onClear={combo ? () => setCombo(null) : undefined}
      onRestore={combo !== "⌃⌥M" ? () => setCombo("⌃⌥M") : undefined} restoreLabel={t("settings.shortcuts.restore", { keys: "⌃⌥M" })}
      error={error} errorId="ds-shortcut-error" disabled={disabled} />
  );
}

export const ShortcutFields: Story = {
  name: "ShortcutField",
  render: () => (
    <div className="catalogue-stack" style={{ maxWidth: 320 }}>
      <Field initial="⌃⌥M" />
      <Field initial="⌘K" />
      <Field initial={null} />
      <Field initial="M" error="A single letter would type into every text box." />
      <Field initial="⌃⌥M" disabled />
    </div>
  ),
};
