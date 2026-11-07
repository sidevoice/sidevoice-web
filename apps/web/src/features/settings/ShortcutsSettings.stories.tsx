import type { Meta, StoryObj } from "@storybook/react-vite";
import { ShortcutsSettings } from "./ShortcutsSettings";
import { translator } from "../../i18n/translator";
import "./settings.css";

/* Settings › Shortcuts as a browser with a keyboard shows it: the keys inside Sidevoice, each recorded in the same field
 * (ShortcutField), its keycaps written as this keyboard's layout writes them, a clash warned and never blocked. The desktop
 * app's groups (shortcuts anywhere on the computer, the headset's buttons) come from its host and are not shown here.
 * What is recorded here is kept in this browser, as the app keeps it (`sidevoice.shortcuts`): Restore puts the default back. */

const meta = {
  title: "Product/Settings/ShortcutsSettings",
  component: ShortcutsSettings,
  args: { t: translator() },
  argTypes: { t: { control: false } },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}><Story /></div>],
} satisfies Meta<typeof ShortcutsSettings>;
export default meta;
type Story = StoryObj<typeof meta>;

export const InABrowser: Story = {
  // The language switch re-renders the story: the words are read as it draws.
  render: () => <ShortcutsSettings t={translator()} />,
};
