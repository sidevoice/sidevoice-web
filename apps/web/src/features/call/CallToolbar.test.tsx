import { expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { act } from "react";
import { CallToolbar } from "./CallToolbar";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";

vi.mock("../../services/room-session-controller.js", () => ({}));

function toolbar() {
  const store = createRoomStore();
  render(<RoomProvider store={store}><CallToolbar /></RoomProvider>);
  return store;
}

test("the call bar says what the session facts say, and asks the runtime to act", async () => {
  const store = toolbar();
  const toggleMic = vi.fn();
  const toggleCall = vi.fn().mockResolvedValue(undefined);
  window.sidevoiceActions = { toggleMic, toggleCall } as unknown as typeof window.sidevoiceActions;

  const mute = () => screen.getByRole("button", { name: /microphone$/i });
  expect(mute()).not.toBeDisabled(); // the preference is set before joining too
  expect(screen.getByRole("button", { name: "Join the call" })).toBeInTheDocument();

  // In a call with no conversation selected there is nobody to speak to: the microphone is off and says why.
  act(() => { store.patch({ ws: {}, micEnabled: true, roomBinding: null }); });
  expect(screen.getByRole("button", { name: "Choose a conversation to talk to" })).toBeDisabled();
  act(() => { store.patch({ ws: {}, micEnabled: false, callNode: "n", roomBinding: { thread_id: "a", binding_id: "b" } }); });
  expect(mute()).toHaveAttribute("aria-label", "Unmute microphone");
  expect(mute()).toHaveAttribute("aria-pressed", "true");
  expect(document.getElementById("mic-control")).toHaveAttribute("data-muted", "true");
  expect(screen.getByRole("button", { name: "Leave the call" })).toHaveClass("joined");


  mute().click();
  screen.getByRole("button", { name: "Leave the call" }).click();
  expect(toggleMic).toHaveBeenCalledTimes(1);
  expect(toggleCall).toHaveBeenCalledTimes(1);
});

test("a microphone the system or another app holds is said where the microphone is; the person's own mute is not that", () => {
  const store = toolbar();
  const silent = "Your microphone isn't sending sound — another app may be using it";
  act(() => store.patch({ ws: {}, sessionId: "s", micEnabled: true, voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "muted" } } as never));
  expect(screen.getByRole("status")).toHaveTextContent(silent);
  expect(document.getElementById("mute")).toHaveAttribute("title", silent);
  // Muted by the person: their own mute, nothing more to say.
  act(() => store.patch({ micEnabled: false } as never));
  expect(screen.queryByText(silent)).toBeNull();
  act(() => store.patch({ micEnabled: true, voiceState: { listening: "listening", recognising: 0, playback: "idle", microphone: "live" } } as never));
  expect(screen.queryByText(silent)).toBeNull();
});

test("call menu only offers connection statistics, including when output is unavailable", () => {
  const store = toolbar();
  const menu = document.getElementById("call-menu") as HTMLDetailsElement;
  menu.open = true;
  expect(screen.getByRole("button", { name: "Connection statistics" })).toBeInTheDocument();
  expect(menu.querySelectorAll("button")).toHaveLength(1);
  act(() => store.patch({ speechOutput: "agents_muted" }));
  expect(menu.querySelectorAll("button")).toHaveLength(1);
  act(() => store.patch({ speechOutput: "voice_off" }));
  expect(menu.querySelectorAll("button")).toHaveLength(1);
});
