import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ModelBuild } from "@sidevoice/engine";
import { HardwareChip, ModelSheet } from "./model-facts";
import { Badge } from "../../components/ui/Badge";
import { translator } from "../../i18n/translator";
import "./model-prepare.css";

/* What a model of this device runs on, as the engine picked it for this device: a Badge (accent) with the plain class and,
 * lighter, its technical name where that says more ("GPU · Metal"). Nothing when the engine does not say, or the build does
 * not run here. It sits in the model's spec sheet (ModelSheet), shown last with each build. */

const build = (extra: Partial<ModelBuild>): ModelBuild => ({ id: "whisper-small/int8", backend: "whisper-cpp", precision: "int8", downloadBytes: 466e6, memoryMb: 852,
  available: true, reasons: [], installed: false, ...extra });

const BUILDS: [string, ModelBuild][] = [
  ["GPU · Metal", build({ acceleratorClass: "gpu", accelerator: "metal" })],
  ["GPU · CUDA", build({ acceleratorClass: "gpu", accelerator: "cuda" })],
  ["GPU · WebGPU", build({ acceleratorClass: "gpu", accelerator: "webgpu" })],
  ["GPU, another API", build({ acceleratorClass: "gpu", accelerator: "vulkan" })],
  ["GPU, no API said", build({ acceleratorClass: "gpu" })],
  ["Neural Engine", build({ acceleratorClass: "neural-engine", accelerator: "coreml" })],
  ["CPU", build({ acceleratorClass: "cpu", accelerator: "cpu" })],
  ["Does not run here (none)", build({ acceleratorClass: "gpu", accelerator: "metal", available: false })],
  ["No class (none)", build({})],
];

const meta = {
  title: "Product/Settings/HardwareChip",
  component: HardwareChip,
  args: { build: BUILDS[0][1], t: translator() },
  argTypes: { build: { control: false }, t: { control: false } },
} satisfies Meta<typeof HardwareChip>;
export default meta;
type Story = StoryObj<typeof meta>;

export const Builds: Story = {
  render: () => {
    const t = translator();
    return <div style={{ display: "grid", gridTemplateColumns: "max-content max-content", gap: "10px 24px", alignItems: "center" }}>
      {BUILDS.map(([name, value]) => <div key={name} style={{ display: "contents" }}><p className="catalogue-label" style={{ margin: 0 }}>{name}</p><span><HardwareChip build={value} t={t} /></span></div>)}
    </div>;
  },
};

/** In the spec sheet it belongs to: before the download and once the model is here. */
export const InTheSheet: Story = {
  render: () => {
    const t = translator();
    return <div className="catalogue-stack" style={{ maxWidth: 520 }}>
      <ModelSheet build={BUILDS[0][1]} installed={false} state={<Badge>{t("voice.prepare.badge.absent")}</Badge>} t={t} />
      <ModelSheet build={{ ...BUILDS[5][1], installed: true }} installed state={<Badge tone="positive" dot>{t("voice.prepare.badge.ready")}</Badge>} t={t} />
    </div>;
  },
};
