import { expect, test } from "vitest";
import type { ModelBuild } from "@sidevoice/engine";
import { translator } from "../../i18n/translator";
import { buildSizes, buildSummary, listedFacts, modelFacts } from "./model-facts";

/* What a model of this device takes and where it runs, from its build: each fact left out while it is not known. */

const t = translator("en");
const build = (extra: Partial<ModelBuild> = {}): ModelBuild => ({ id: "b", backend: "sherpa-onnx", precision: "int8", accelerator: "cpu", acceleratorClass: "cpu",
  downloadBytes: 145e6, memoryMb: 190, available: true, reasons: [], installed: false, ...extra });

test("before it is here: its download, its memory, what it runs on; once here, what it takes on this device", () => {
  expect(modelFacts(build(), false, t)).toBe("145 MB download · 190 MB in memory · processor");
  expect(modelFacts(build(), true, t)).toBe("145 MB on this device · 190 MB in memory · processor");
});

test("what the engine does not say is left out", () => {
  const unknown = build({ memoryMb: 0, acceleratorClass: undefined });
  expect(modelFacts(unknown, false, t)).toBe("145 MB");
  expect(modelFacts(unknown, true, t)).toBe("145 MB on this device");
  expect(buildSizes(build({ downloadBytes: 0 }), t)).toBe("190 MB in memory");
});

test("the Advanced line, as its panel says the build: how it runs, then its sizes", () => {
  expect(buildSummary(build(), t)).toBe("Sherpa-ONNX · int8 · processor · 145 MB download · 190 MB in memory");
  expect(buildSummary(build({ acceleratorClass: "gpu", accelerator: "webgpu", backend: "transformers-js" }), t))
    .toBe("Transformers.js · int8 · graphics card (WebGPU) · 145 MB download · 190 MB in memory");
});

test("a model of the list is said by its recommended build, else its first that runs here; on this device when installed", () => {
  const builds = [build({ id: "slow", available: false }), build({ id: "first", downloadBytes: 40e6 }), build({ id: "best", downloadBytes: 75e6 })];
  expect(listedFacts({ builds, recommendedBuild: "best" }, t)).toMatch(/^75 MB download/);
  expect(listedFacts({ builds }, t)).toMatch(/^40 MB download/);
  expect(listedFacts({ builds, recommendedBuild: "best", installed: true }, t)).toMatch(/^75 MB on this device/);
  expect(listedFacts({ builds: [] }, t)).toBe("");
});
