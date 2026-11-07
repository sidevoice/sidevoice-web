import type { Meta, StoryObj } from "@storybook/react-vite";
import { fn } from "storybook/test";
import { PermissionsList } from "./PermissionsList";
import { MicrophoneBadge, microphoneView } from "./permission-view";
import type { MicrophoneSnapshot } from "../../services/microphone-access";
import { translator } from "../../i18n/translator";

/* What Sidevoice needs allowed, one look wherever it is asked (the setup's permissions step and Settings › Permissions):
 * the microphone hero, then a row per permission. The microphone's state is a snapshot (MicrophoneSnapshot) handed in, as
 * the screens hand in what this browser's microphone access reads; blocked, how to allow it is worded by the host (here the
 * browser's own words; an app overlays its own). Not shown: the rows for lowering other apps' media in a call
 * (MediaPermissionRows), which only the desktop app's host offers. Pressing Allow asks nothing here (onRequest is a mock). */

type State = MicrophoneSnapshot["state"];
const snapshot = (state: State, extra: Partial<MicrophoneSnapshot> = {}): MicrophoneSnapshot =>
  ({ state, asker: "page", known: true, dismissed: false, unchanged: false, from: null, ...extra });

const meta = {
  title: "Product/Permissions/PermissionsList",
  component: PermissionsList,
  args: { microphone: snapshot("prompt"), openSettings: null, onRequest: fn(), t: translator() },
  argTypes: { microphone: { control: false }, openSettings: { control: false }, t: { control: false } },
  decorators: [(Story) => <div style={{ maxWidth: 560 }}><Story /></div>],
  // Its words are read as it draws, so the language switch reaches it (an arg would keep the language it was made in).
  render: (args) => <PermissionsList {...args} t={translator()} />,
} satisfies Meta<typeof PermissionsList>;
export default meta;
type Story = StoryObj<typeof meta>;

/** Not asked yet: Allow. */
export const NotAsked: Story = {};
/** Asked and closed without an answer. */
export const Dismissed: Story = { args: { microphone: snapshot("prompt", { dismissed: true }) } };
/** Being asked: the browser's prompt is up. */
export const Requesting: Story = { args: { microphone: snapshot("requesting") } };
/** Allowed: the green badge in the action's place. */
export const Allowed: Story = { args: { microphone: snapshot("granted") } };
/** Blocked: Check again, and how to allow it where this page runs. */
export const Blocked: Story = { args: { microphone: snapshot("denied") } };
/** No microphone found. */
export const NoneFound: Story = { args: { microphone: snapshot("missing") } };
/** Reading the state. */
export const Checking: Story = { args: { microphone: snapshot("checking") } };
/** The desktop app asks the system rather than the page: its own line. */
export const AskedByTheApp: Story = { args: { microphone: snapshot("prompt", { asker: "app" }) } };

/** The microphone's state as its badge says it, in each state that has one. */
export const Badges: Story = {
  render: () => {
    const t = translator();
    return <div className="catalogue-row">{(["prompt", "checking", "requesting", "granted", "denied", "missing", "none"] as State[]).map((state) => (
      <div key={state}><p className="catalogue-label">{state}</p><MicrophoneBadge view={microphoneView(snapshot(state))} t={t} /></div>
    ))}</div>;
  },
};
