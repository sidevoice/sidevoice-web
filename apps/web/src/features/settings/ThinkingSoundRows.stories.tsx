import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { ThinkingSoundRows } from "./ThinkingSoundRows";
import { Group } from "../../components/ui/Card";
import { THINKING_SOUNDS, THINKING_SOUND_GAIN } from "../../services/thinking-sounds";
import { translator } from "../../i18n/translator";
import "./settings.css";

/* Settings › Call, under "While the agent works": which thinking sound, how loud, and a try of it — three Rows of the
 * group, the parent's own "Play a sound" row above them (not shown). The volume is an offset in dB from the sound's own
 * level, read with its sign, and ↺ brings it back to 0 dB (disabled at 0 dB, as a shortcut's restore). With the sound off
 * ("No" above) the three stay in view, each Row `disabled`: its words in the disabled ink, its control disabled. Each
 * specimen keeps its own choice, as Settings keeps it: move the volume, pick another sound. The try plays the sound in
 * this page for about 15 s, with its progress and the seconds left: press Try in Playground to see it (and hear it). It
 * is not pressed for you, since that would play the sound whenever the story is opened. */

type Choice = { sound: string; gainDb: number };

/** The rows as Call holds them: the choice kept here, the sound off or on. */
function Rows({ initial, disabled }: { initial: Choice; disabled: boolean }) {
  const t = translator();
  const [choice, setChoice] = useState(initial);
  return (
    <Group title={t("settings.call.working")}>
      <ThinkingSoundRows t={t} sound={choice.sound} gainDb={choice.gainDb} disabled={disabled} active
        onChange={(patch) => setChoice((now) => ({ sound: patch.sound ?? now.sound, gainDb: patch.soundGainDb ?? now.gainDb }))} />
    </Group>
  );
}

type Args = { sound: string; gainDb: number; disabled: boolean };

const meta = {
  title: "Product/Settings/ThinkingSoundRows",
  args: { sound: THINKING_SOUNDS[0].id, gainDb: 0, disabled: false },
  argTypes: {
    sound: { control: "select", options: THINKING_SOUNDS.map((sound) => sound.id) },
    gainDb: { control: { type: "range", min: THINKING_SOUND_GAIN.min, max: THINKING_SOUND_GAIN.max, step: THINKING_SOUND_GAIN.step } },
    disabled: { control: "boolean", description: "The thinking sound is off (Play a sound: No)." },
  },
  decorators: [(Story) => <div style={{ maxWidth: 640 }}><Story /></div>],
  // A choice from the controls is the one kept from then on: the rows drawn again with it.
  render: ({ sound, gainDb, disabled }) => <Rows key={`${sound}|${gainDb}`} initial={{ sound, gainDb }} disabled={disabled} />,
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The rows to play with: press Try to hear the sound and see its progress and the seconds left. */
export const Playground: Story = {};

/** At rest (the soft heartbeat at 0 dB: ↺ disabled), the volume moved down and up (↺ enabled), and the sound off. */
export const States: Story = {
  render: () => (
    <div className="catalogue-stack">
      {([
        ["At rest · 0 dB", "↺ disabled: already the sound's own level", { sound: "soft-heartbeat", gainDb: 0 }, false],
        ["Quieter · −6 dB", "another sound, the volume moved: ↺ brings it back to 0 dB", { sound: "warm-pad-pulse", gainDb: -6 }, false],
        ["Louder · +4 dB", "read with its sign", { sound: "slow-breath", gainDb: 4 }, false],
        ["Off", "Play a sound: No — every Row disabled, its control disabled", { sound: "soft-heartbeat", gainDb: -6 }, true],
      ] as const).map(([name, note, initial, disabled]) => (
        <div key={name}>
          <p className="catalogue-label" style={{ margin: 0 }}>{name}</p>
          <span className="muted" style={{ display: "block", marginBottom: 6, fontSize: "var(--sv-font-xs)" }}>{note}</span>
          <Rows initial={initial} disabled={disabled} />
        </div>
      ))}
    </div>
  ),
};
