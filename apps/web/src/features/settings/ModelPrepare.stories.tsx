import type { Meta, StoryObj } from "@storybook/react-vite";
import type { ReactNode } from "react";
import { fn } from "storybook/test";
import type { ModelBuild } from "@sidevoice/engine";
import { ModelPrepare, type PrepareStatus } from "./ModelPrepare";
import { voiceFailure } from "./error-message";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { Select } from "../../components/ui/Select";
import { translator } from "../../i18n/translator";

/* A chosen model made ready on this device, one block wherever a model is chosen (the first-run setup, Settings): the
 * pickers, then where it stands — to download, downloading, checked, loaded, ready (and its try), failed (and retry). Two
 * layouts: a provider's model, or one with no build that runs here, keeps a status row with its size ("Line"); a model of
 * this device with its build has a spec sheet ("Sheet": languages, hardware, sizes, state, and what to do at its foot).
 * The failure's sentence is the real one for a download that failed (voiceFailure). A download that shows no new bytes for
 * 15 s reads as stalled: wait on "Downloading" to see it. */

const STATUSES: PrepareStatus[] = ["absent", "downloading", "verifying", "loading", "ready", "failed"];

const BUILD: ModelBuild = { id: "whisper-small/int8", backend: "whisper-cpp", precision: "int8", accelerator: "metal", acceleratorClass: "gpu",
  downloadBytes: 466e6, memoryMb: 852, available: true, reasons: [], installed: false };

function Pickers({ locked }: { locked: boolean }) {
  const t = translator();
  return <>
    <Field label={t("voice.family")}><Select disabled={locked} defaultValue="whisper" options={[{ value: "whisper", label: "Whisper" }, { value: "parakeet", label: "Parakeet" }]} /></Field>
    <Field label={t("voice.model")}><Select disabled={locked} defaultValue="small" options={[{ value: "small", label: "whisper-small" }, { value: "base", label: "whisper-base" }]} /></Field>
  </>;
}

/** What each status is given, as Settings gives it. */
function stateProps(status: PrepareStatus) {
  const t = translator();
  const failure = voiceFailure({ code: "download-failed", message: "fetch failed: ECONNRESET" }, { what: "download" });
  return {
    status, fraction: status === "downloading" ? 0.42 : null,
    error: status === "failed" ? failure.text : undefined, errorDetails: status === "failed" ? failure.details : undefined,
    readyAction: <Button size="sm">{t("try.tryIt")}</Button>,
  };
}

function Specimen({ status, children }: { status: PrepareStatus; children: ReactNode }) {
  return <div><p className="catalogue-label">{status}</p>{children}</div>;
}

const meta = {
  title: "Product/Settings/ModelPrepare",
  component: ModelPrepare,
  args: { status: "absent", model: "whisper-small", size: 466e6, fraction: 0.42, onDownload: fn(), onCancel: fn(), onRetry: fn() },
  argTypes: {
    status: { control: "select", options: [...STATUSES, null] },
    fraction: { control: { type: "range", min: 0, max: 1, step: 0.01 } },
    pickers: { control: false }, runtime: { control: false }, readyAction: { control: false }, readyPanel: { control: false },
    languages: { control: false }, notice: { control: false }, meta: { control: false }, build: { control: false },
  },
  decorators: [(Story) => <div style={{ maxWidth: 520 }}><Story /></div>],
} satisfies Meta<typeof ModelPrepare>;
export default meta;
type Story = StoryObj<typeof meta>;

/** With the pickers (they lock while it downloads) and the try once ready. */
export const Playground: Story = {
  render: (args) => <ModelPrepare {...args} pickers={(locked) => <Pickers locked={locked} />} readyAction={<Button size="sm">{translator()("try.tryIt")}</Button>} />,
};

/** The status row (no build that runs here), in every status. */
export const Line: Story = {
  render: () => <div className="catalogue-stack">{STATUSES.map((status) => (
    <Specimen key={status} status={status}><ModelPrepare model="whisper-small" size={466e6} {...stateProps(status)} /></Specimen>
  ))}</div>,
};

/** The spec sheet (a model of this device, with its build: a GPU, Metal), in every status. */
export const Sheet: Story = {
  render: () => <div className="catalogue-stack">{STATUSES.map((status) => (
    <Specimen key={status} status={status}><ModelPrepare model="whisper-small" size={466e6} build={{ ...BUILD, installed: status === "ready" }} {...stateProps(status)} /></Specimen>
  ))}</div>,
};

/** Chosen in Settings before it is ready: the model in use stays until it is, and the block says so. */
export const Pending: Story = {
  render: () => {
    const t = translator();
    return <ModelPrepare model="whisper-small" size={466e6} pending={t("voice.prepare.willSwitch", { model: "whisper-base" })}
      pickers={(locked) => <Pickers locked={locked} />} {...stateProps("downloading")} />;
  },
};
