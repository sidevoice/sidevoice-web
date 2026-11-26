import type { Meta, StoryObj } from "@storybook/react-vite";
import { Badge } from "./Badge";
import { MachinesIcon, ProviderLogo } from "./Icons";
import { Select, type SelectItems } from "./Select";

const MODELS: SelectItems = [
  { label: "Whisper", options: [
    { value: "whisper-base", label: "whisper-base", description: "74 MB · fast, good accuracy", badge: <Badge tone="positive" dot>Downloaded</Badge> },
    { value: "whisper-small", label: "whisper-small", description: "466 MB · better accuracy", badge: <Badge tone="accent">Recommended</Badge> },
    { value: "whisper-large", label: "whisper-large", description: "3 GB · the best accuracy", disabled: true, reason: "Does not fit in this device's memory." },
  ] },
  { label: "Moonshine", options: [{ value: "moonshine-tiny", label: "moonshine-tiny", description: "English only · the fastest" }] },
];
const SOURCES: SelectItems = [
  { value: "local", label: "On this device", icon: <MachinesIcon />, description: "Private and free; a one-time download." },
  { value: "openai", label: "OpenAI", icon: <ProviderLogo provider="openai" size={16} />, badge: <Badge tone="warning" dot>Needs a key</Badge> },
  { value: "elevenlabs", label: "ElevenLabs", icon: <ProviderLogo provider="elevenlabs" size={16} /> },
];

/* Radix select with groups, descriptions, badges, icons, and options disabled with a reason. */
const meta = {
  title: "Primitives/Select",
  component: Select,
  args: { "aria-label": "Model", defaultValue: "whisper-small", options: MODELS },
  argTypes: { size: { control: "inline-radio", options: ["sm", "md"] } },
  decorators: [(Story) => <div style={{ maxWidth: 360 }}><Story /></div>],
} satisfies Meta<typeof Select>;
export default meta;
type Story = StoryObj<typeof meta>;

export const GroupsBadgesReasons: Story = {};
export const WithIcons: Story = { args: { "aria-label": "Source", defaultValue: "local", options: SOURCES } };
export const Small: Story = { args: { size: "sm" } };
export const Invalid: Story = { args: { invalid: true } };
export const Disabled: Story = { args: { disabled: true } };
export const Placeholder: Story = { args: { defaultValue: undefined, placeholder: "Choose a model" } };
