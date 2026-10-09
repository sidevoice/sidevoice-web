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

  const mute = () => screen.getByRole("button", { name: /micrófono$/i });
  expect(mute()).not.toBeDisabled(); // the preference is set before joining too
  expect(screen.getByRole("button", { name: "Entrar en la sala" })).toBeInTheDocument();

  // In a call with no conversation selected there is nobody to speak to: the microphone is off and says why.
  act(() => { store.patch({ ws: {}, micEnabled: true, roomBinding: null }); });
  expect(screen.getByRole("button", { name: "Elige una conversación para hablar" })).toBeDisabled();
  act(() => { store.patch({ ws: {}, micEnabled: false, roomBinding: { thread_id: "a", binding_id: "b" } }); });
  expect(mute()).toHaveAttribute("aria-label", "Activar micrófono");
  expect(mute()).toHaveAttribute("aria-pressed", "true");
  expect(document.getElementById("mic-control")).toHaveAttribute("data-muted", "true");
  expect(screen.getByRole("button", { name: "Salir de la sala" })).toHaveClass("joined");

  // What the room thinks of the screen is said by the lights at the edge of the bar, not in prose.
  act(() => { store.patch({ screenLock: { state: "off", note: "No se pudo mantener la pantalla encendida" } }); });
  expect(document.getElementById("screen-note")).toBeNull();
  expect(document.getElementById("capability-column")).toHaveTextContent("Pantalla");

  mute().click();
  screen.getByRole("button", { name: "Salir de la sala" }).click();
  expect(toggleMic).toHaveBeenCalledTimes(1);
  expect(toggleCall).toHaveBeenCalledTimes(1);
});
