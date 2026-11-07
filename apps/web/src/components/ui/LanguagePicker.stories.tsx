import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { LanguagePicker } from "./LanguagePicker";
import { UI_LANGUAGES, languageName } from "../../i18n/translator";

const OPTIONS = UI_LANGUAGES.map((value) => ({ value, label: languageName(value) }));

function Picker({ size = "md", showLanguageIcon = false }: { size?: "sm" | "md"; showLanguageIcon?: boolean }) {
  const [value, setValue] = useState("en");
  return <div style={{ maxWidth: 320 }}><LanguagePicker id={`ds-lang-${size}`} label="Interface language" value={value} onValueChange={setValue} options={OPTIONS} size={size} showLanguageIcon={showLanguageIcon} /></div>;
}

/* Searchable language list in a popover: the interface's, the transcription's and the voices' filter. */
const meta = {
  title: "Primitives/LanguagePicker",
  component: LanguagePicker,
  args: { id: "ds-lang", label: "Interface language", value: "en", onValueChange: () => {}, options: OPTIONS },
} satisfies Meta<typeof LanguagePicker>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = { render: () => <Picker /> };
export const WithIcon: Story = { render: () => <Picker showLanguageIcon /> };
export const Small: Story = { render: () => <Picker size="sm" /> };
