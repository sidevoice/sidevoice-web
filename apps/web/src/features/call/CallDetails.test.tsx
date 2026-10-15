import { afterEach, expect, test } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { TooltipProvider } from "../../components/ui/Tooltip";
import type { ParticipantView } from "../../state/room-types";
import type { StageConversation } from "./stage-view";
import type { VoiceModelRow } from "./VoiceModels";
import { StageHeading, type TitleDetail } from "./CallDetails";

afterEach(() => cleanup());

/* The stage's title opens what the call runs on (CallDetails), as a popover or a sheet (variant titleDetail); it wears a
 * dot while a voice model needs something. */

const row = { threadId: "t-1", title: "Fix the slow login", machine: "Laptop", harness: "claude", model: "claude-opus-5-5", effort: "xhigh",
  available: true, reach: { state: "listening" }, unread: 0 } as unknown as ParticipantView;
const stage = { threadId: "t-1", row, title: "Fix the slow login", isTarget: true, inCall: true, canHear: true, speaking: false, working: false, unread: 0, mood: "idle" } as StageConversation;
const slot = (task: "stt" | "tts", attention: boolean) => ({ slot: { id: task === "stt" ? "whisper-base" : "eleven_flash_v2_5", where: "on this device", state: attention ? "needs a key" : "ready",
  attention, task, status: attention ? "needsKey" : "ready", catalog: "local" }, label: task === "stt" ? "Speech to text" : "Text to speech", icon: null }) as VoiceModelRow;

function heading(detail: TitleDetail, attention = false) {
  const rows = [slot("stt", false), slot("tts", attention)];
  render(<RoomProvider store={createRoomStore()}><TooltipProvider><StageHeading stage={stage} detail={detail} voice={{ rows, attention }} /></TooltipProvider></RoomProvider>);
  return screen.getByRole("button", { name: /Fix the slow login/ });
}

test("the title is one button: the name over its machine, saying it opens the call's details; a dot only while a model needs something", () => {
  const button = heading("popover");
  expect(button).toHaveAccessibleName(/Laptop.*Call details/);
  expect(button.querySelector(".stage-attention")).toBeNull();
  cleanup();
  const needs = heading("popover", true);
  expect(needs.querySelector(".stage-attention")).not.toBeNull();
  expect(needs).toHaveAccessibleName(/Your voice needs attention/);
});

for (const detail of ["popover", "sheet"] as const) {
  test(`as a ${detail}: the machine, the agent's harness, model and effort, and each voice model with what to do when it needs something`, () => {
    fireEvent.click(heading(detail, true));
    const details = screen.getByRole("dialog");
    expect(within(details).getByRole("heading", { name: "Machine" })).toBeInTheDocument();
    expect(details.querySelector(".call-details-machine")).toHaveTextContent("Laptop");
    expect([...details.querySelectorAll(".call-details-agent dd")].map((dd) => dd.textContent?.trim())).toEqual(["Claude Code", "claude-opus-5-5", "xhigh"]);
    expect(details.querySelectorAll(".voice-model")).toHaveLength(2);
    expect(within(details).getByRole("button", { name: "Add the key" })).toBeInTheDocument();
  });
}
