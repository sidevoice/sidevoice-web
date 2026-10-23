import { expect, test } from "vitest";
import { createElement, Fragment, type ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import type { ModelBuild } from "@sidevoice/engine";
import { translator } from "../../i18n/translator";
import { buildSizes, describeBuild, hardwareLabel, hardwareName, listedFacts, sizeFacts } from "./model-facts";

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

test("a model of the list is said by its recommended build, else its first that runs here: its size and hardware alone", () => {
  const builds = [build({ id: "slow", available: false }), build({ id: "first", downloadBytes: 40e6 }), build({ id: "best", downloadBytes: 75e6 })];
  expect(said(listedFacts({ builds, recommendedBuild: "best" }, t, "both"))).toBe("75 MB · CPU");
  expect(said(listedFacts({ builds }, t, "both"))).toBe("40 MB · CPU");
  // Installed or not, the same: whether it is here, and its memory, are the spec sheet's.
  expect(said(listedFacts({ builds, recommendedBuild: "best", installed: true }, t, "both"))).toBe("75 MB · CPU");
  // What is not known is left out; with neither, nothing.
  expect(said(listedFacts({ builds: [build({ acceleratorClass: undefined })] }, t, "both"))).toBe("145 MB");
  expect(said(listedFacts({ builds: [build({ downloadBytes: 0 })] }, t, "both"))).toBe("CPU");
  expect(listedFacts({ builds: [build({ downloadBytes: 0, acceleratorClass: undefined })] }, t, "both")).toBeNull();
  expect(listedFacts({ builds: [] }, t, "both")).toBeNull();
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

test("the hardware as each label names it: the plain class, its technical name, or both; the technical part only where it says more", () => {
  const metal = build({ acceleratorClass: "gpu", accelerator: "metal" });
  const npu = build({ acceleratorClass: "neural-engine", accelerator: "coreml" });
  const cpu = build({ accelerator: "wasm" });
  expect([metal, npu, cpu].map((each) => hardwareLabel(each, t, "class"))).toEqual([
    { main: "GPU", name: "", hint: "Metal" }, { main: "NPU", name: "", hint: "Neural Engine" }, { main: "CPU", name: "", hint: "" }]);
  expect([metal, npu, cpu].map((each) => hardwareLabel(each, t, "technical"))).toEqual([
    { main: "Metal", name: "", hint: "" }, { main: "Neural Engine", name: "", hint: "" }, { main: "CPU", name: "", hint: "" }]);
  expect([metal, npu, cpu].map((each) => hardwareLabel(each, t, "both"))).toEqual([
    { main: "GPU", name: "Metal", hint: "" }, { main: "NPU", name: "Neural Engine", hint: "" }, { main: "CPU", name: "", hint: "" }]);
});

test("a graphics card with no API is a GPU for the class labels, and nothing for the technical one; no class, or not here, is nothing", () => {
  const noApi = build({ acceleratorClass: "gpu", accelerator: undefined });
  expect(hardwareLabel(noApi, t, "class")).toEqual({ main: "GPU", name: "", hint: "" });
  expect(hardwareLabel(noApi, t, "both")).toEqual({ main: "GPU", name: "", hint: "" });
  expect(hardwareLabel(noApi, t, "technical")).toBeNull();
  for (const mode of ["class", "technical", "both"] as const) {
    expect(hardwareLabel(build({ acceleratorClass: undefined }), t, mode)).toBeNull();
    expect(hardwareLabel(build({ acceleratorClass: "gpu", accelerator: "metal", available: false }), t, mode)).toBeNull();
  }
});
