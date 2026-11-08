import { expect, test } from "@playwright/test";
import { installHarness } from "./harness.mjs";

/* A device paired with two machines talks to both at once (sidevoice-web#83): each is asked with its own token, and
 * the conversations of both are in the one list, under the machine each runs on — the same thread name on two machines
 * being two conversations. Settings lists both machines, neither "in use", and offers no "Use this machine". */

const conversation = (thread_id, title) => ({ thread_id, title, available: true, reach: { state: "listening" }, harness: "claude-code" });

test("two paired machines: both conversations listed by machine, each machine asked with its own token", async ({ page }) => {
  const fake = await installHarness(page, { secondMachine: true, participants: { first: [conversation("t", "Here")], second: [conversation("t", "There")] } });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/voice/");
  const list = page.locator("#participants");
  await expect(list.getByRole("region", { name: "E2E Host" }).getByText("Here")).toBeVisible();
  await expect(list.getByRole("region", { name: "Second Host" }).getByText("There")).toBeVisible();
  const asked = (machine) => fake.presentation.filter((request) => request.machine === machine);
  expect(asked("first").length).toBeGreaterThan(0);
  expect(asked("second").length).toBeGreaterThan(0);
  expect(asked("first").every((request) => request.authorization === "Bearer e2e-device-token")).toBe(true);
  expect(asked("second").every((request) => request.authorization === "Bearer e2e-second-token")).toBe(true);
  await expect(page.getByRole("button", { name: /Use this machine|Usar esta máquina/ })).toHaveCount(0);
});
