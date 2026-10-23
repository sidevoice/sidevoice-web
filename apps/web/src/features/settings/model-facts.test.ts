import { expect, test } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import type { ModelBuild } from "@sidevoice/engine";
import { translator } from "../../i18n/translator";
import { buildSizes, describeBuild, hardwareLabel, hardwareName, listedOption, sizeFacts } from "./model-facts";

/* What a model of this device takes and where it runs, from its build: each fact left out while it is not known. */

const t = translator("en");
const build = (extra: Partial<ModelBuild> = {}): ModelBuild => ({ id: "b", backend: "sherpa-onnx", precision: "int8", accelerator: "cpu", acceleratorClass: "cpu",
  downloadBytes: 145e6, memoryMb: 190, available: true, reasons: [], installed: false, ...extra });

/** What a node says, read as text (what is hidden for screen readers included). */
function said(node: ReactNode) {
  const { container } = render(createElement(Fragment, null, node));
  const text = container.textContent;
  cleanup();
  return text;
}

test("what the engine does not say is left out of the sizes", () => {
  expect(sizeFacts(build({ memoryMb: 0 }), false, t)).toBe("145 MB");
  expect(sizeFacts(build({ memoryMb: 0 }), true, t)).toBe("145 MB on this device");
  expect(buildSizes(build({ downloadBytes: 0 }), t)).toBe("190 MB in memory");
});

test("the builds list says a build by its engine, precision and what it runs on, in words", () => {
  expect(describeBuild(build(), t)).toBe("Sherpa-ONNX · int8 · processor");
  expect(describeBuild(build({ acceleratorClass: "gpu", accelerator: "webgpu", backend: "transformers-js" }), t)).toBe("Transformers.js · int8 · graphics card (WebGPU)");
});

test("a model of the list: its size at the end of its name's line, its hardware under it, said in full to screen readers", () => {
  const builds = [build({ id: "slow", available: false }), build({ id: "first", downloadBytes: 40e6 }), build({ id: "best", downloadBytes: 75e6, acceleratorClass: "gpu", accelerator: "metal" })];
  const shown = (model: Parameters<typeof listedOption>[0]) => { const option = listedOption(model, t); return [said(option.badge), said(option.description)]; };
  // By its recommended build, else its first that runs here; installed or not, the same.
  expect(shown({ builds, recommendedBuild: "best" })).toEqual(["75 MB", "75 MB · GPU · Metal"]);
  expect(shown({ builds })).toEqual(["40 MB", "40 MB · CPU"]);
  expect(shown({ builds, recommendedBuild: "best", installed: true })).toEqual(["75 MB", "75 MB · GPU · Metal"]);
  // What is not known is left out: no hardware, the size alone under the name; no size, the hardware alone; neither, nothing.
  expect(listedOption({ builds: [build({ acceleratorClass: undefined })] }, t)).toEqual({ description: "145 MB" });
  expect(shown({ builds: [build({ downloadBytes: 0 })] })).toEqual(["", "CPU"]);
  expect(listedOption({ builds: [build({ downloadBytes: 0, acceleratorClass: undefined })] }, t)).toEqual({});
  expect(listedOption({ builds: [] }, t)).toEqual({});
});

test("the hardware as a chip names it only when the engine says it, for a build that runs here", () => {
  expect(hardwareName(build({ acceleratorClass: "gpu", accelerator: "metal" }), t)).toBe("Metal");
  expect(hardwareName(build({ acceleratorClass: "gpu", accelerator: "vulkan" }), t)).toBe("vulkan");
  expect(hardwareName(build({ acceleratorClass: "neural-engine", accelerator: "coreml" }), t)).toBe("Neural Engine");
  expect(hardwareName(build(), t)).toBe("CPU");
  // A graphics card with no API, no class, or a build that does not run here: nothing is said.
  expect(hardwareName(build({ acceleratorClass: "gpu", accelerator: undefined }), t)).toBe("");
  expect(hardwareName(build({ acceleratorClass: undefined }), t)).toBe("");
  expect(hardwareName(build({ available: false }), t)).toBe("");
});

test("its sizes, as the spec sheet says them", () => {
  expect(sizeFacts(build(), false, t)).toBe("145 MB download · 190 MB in memory");
  expect(sizeFacts(build(), true, t)).toBe("145 MB on this device · 190 MB in memory");
  expect(sizeFacts(build({ memoryMb: 0 }), true, t)).toBe("145 MB on this device");
});

test("the hardware as the class, then its technical name where it says more; a GPU with no API is a GPU; no class, or not here, is nothing", () => {
  expect(hardwareLabel(build({ acceleratorClass: "gpu", accelerator: "metal" }), t)).toEqual({ main: "GPU", name: "Metal" });
  expect(hardwareLabel(build({ acceleratorClass: "neural-engine", accelerator: "coreml" }), t)).toEqual({ main: "NPU", name: "Neural Engine" });
  expect(hardwareLabel(build({ accelerator: "wasm" }), t)).toEqual({ main: "CPU", name: "" });
  expect(hardwareLabel(build({ acceleratorClass: "gpu", accelerator: undefined }), t)).toEqual({ main: "GPU", name: "" });
  expect(hardwareLabel(build({ acceleratorClass: undefined }), t)).toBeNull();
  expect(hardwareLabel(build({ acceleratorClass: "gpu", accelerator: "metal", available: false }), t)).toBeNull();
});
