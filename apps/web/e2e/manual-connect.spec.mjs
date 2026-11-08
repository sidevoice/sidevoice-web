import { expect, test } from "@playwright/test";
import { installHarness, listing } from "./harness.mjs";

/* Settings › a machine's Agents › "Don't see yours? Connect it by hand", in real browsers: it says to add Sidevoice to
 * the agent's list of MCP servers and offers only Sidevoice's entry to paste there, the one the connector registers
 * (its command, arguments and environment). The entry spans several lines, and any part of it can be selected. */

const command = "/home/ana/.local/share/sidevoice/bin/sidevoice-connector";
const entry = { command, args: ["mcp"], env: { SIDEVOICE_DATA_DIR: "/home/ana/.local/share/sidevoice", XDG_DATA_HOME: "/home/ana/.local/share" } };
// As the connector sends it (agents.rs `custom`): the command line, and the whole mcpServers configuration.
const custom = { command: `${command} mcp`, snippet: JSON.stringify({ mcpServers: { sidevoice: entry } }, null, 2), version: "0.9.0" };

test("connecting an agent by hand: add Sidevoice to its MCP servers, with Sidevoice's entry alone to copy, selectable in part", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await installHarness(page);
  await page.route("**/api/host/agents**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ...listing(), custom }) }));
  await page.goto("/voice/");
  await page.waitForFunction(() => !!window.sidevoiceActions);
  await page.locator("#settings-open:visible, .sidebar-settings:visible").first().click();
  await page.locator("#settings-machines").click();
  await page.locator("#language-settings").getByRole("button", { name: /E2E Host/ }).first().click();
  await page.getByRole("button", { name: "Don’t see yours? Connect it by hand" }).click();
  const howto = page.locator("#host-agent-other-howto");
  await expect(howto).toContainText("Add Sidevoice to your agent’s list of MCP servers");
  await expect(howto.locator(".ui-snippet")).toHaveCount(1);
  const code = howto.locator(".ui-snippet-text");
  const text = await code.innerText();
  // Exactly the member to paste into a list of servers: Sidevoice's entry, nothing around it.
  expect(JSON.parse(`{${text}}`)).toEqual({ sidevoice: entry });
  await expect(howto.getByRole("button", { name: "Copy the Sidevoice entry" })).toBeVisible();
  // Dragging across part of a line selects that part, not the whole snippet.
  await code.scrollIntoViewIfNeeded();
  const box = await code.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 30, { steps: 6 });
  await page.mouse.up();
  const selected = await page.evaluate(() => String(window.getSelection()));
  expect(selected.length).toBeGreaterThan(0);
  expect(selected.length).toBeLessThan(text.length / 2);
});
