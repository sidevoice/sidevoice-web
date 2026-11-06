import { afterEach, expect, test } from "vitest";
import { act, render } from "@testing-library/react";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { MuteButton, SkipButton } from "./CallIndicators";
import { shortcutTip } from "../../components/ui/Keycaps";
import { resetBinding, setBinding } from "../../state/shortcuts";

/* The keys the person set show wherever the app names a key: the tooltip's caps and aria-keyshortcuts, at once. */
afterEach(() => { resetBinding("mute"); resetBinding("skip"); resetBinding("holdToTalk"); });

const caps = (node: HTMLElement) => [...node.querySelectorAll(".shortcut-key")].map((key) => key.textContent);

test("a tooltip names the keys now set, and none for a cleared shortcut", () => {
  const view = render(<div id="tip">{shortcutTip("Mute", "mute")}</div>);
  const tip = view.container.querySelector("#tip") as HTMLElement;
  expect(caps(tip)).toEqual(["Ctrl", "D"]);
  act(() => setBinding("mute", { code: "KeyM", key: "M", ctrl: true, alt: true }));
  expect(caps(tip)).toEqual(["Ctrl", "Alt", "M"]);
  act(() => setBinding("mute", null));
  expect(caps(tip)).toEqual([]);
  expect(tip.textContent).toBe("Mute");
});

test("the call buttons' aria-keyshortcuts follow the table", () => {
  const view = render(<RoomProvider store={createRoomStore()}><SkipButton /><MuteButton /></RoomProvider>);
  const skip = view.container.querySelector("#skip-reply")!;
  expect(skip.getAttribute("aria-keyshortcuts")).toBe("Meta+S Control+S");
  act(() => setBinding("skip", { code: "KeyK", key: "K", mod: true }));
  expect(skip.getAttribute("aria-keyshortcuts")).toBe("Meta+K Control+K");
  act(() => setBinding("skip", null));
  expect(skip.hasAttribute("aria-keyshortcuts")).toBe(false);
  act(() => setBinding("mute", { code: "KeyM", key: "M", shift: true, mod: true }));
  expect(view.container.querySelector("#mute")!.getAttribute("aria-keyshortcuts")).toBe("Meta+Shift+M Control+Shift+M Space");
});

test("the mute button exposes the configured hold key too, while the hold is offered, and none once it is cleared", () => {
  const store = createRoomStore();
  const view = render(<RoomProvider store={store}><MuteButton /></RoomProvider>);
  const mute = () => view.container.querySelector("#mute")!;
  expect(mute().getAttribute("aria-keyshortcuts")).toBe("Meta+D Control+D Space");
  act(() => setBinding("holdToTalk", { code: "KeyT", key: "T" }));
  expect(mute().getAttribute("aria-keyshortcuts")).toBe("Meta+D Control+D T");
  act(() => setBinding("holdToTalk", null));
  expect(mute().getAttribute("aria-keyshortcuts")).toBe("Meta+D Control+D");
});
