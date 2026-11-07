import type { Meta, StoryObj } from "@storybook/react-vite";
import { ErrorDetails, ErrorText } from "./ErrorText";

/* A failure in a person's words; what was raw about it closed behind "Details". */
const meta = {
  title: "Primitives/ErrorText",
  component: ErrorText,
  args: { message: { text: "The key was refused.", said: "Incorrect API key provided.", details: "401 invalid_api_key (api.openai.com)" } },
} satisfies Meta<typeof ErrorText>;
export default meta;
type Story = StoryObj<typeof meta>;

export const WithProviderWordsAndDetails: Story = {};
export const SentenceOnly: Story = { args: { message: { text: "The download stopped." } } };
export const DetailsAlone: Story = { render: () => <ErrorDetails details="ECONNRESET: socket hang up" /> };
