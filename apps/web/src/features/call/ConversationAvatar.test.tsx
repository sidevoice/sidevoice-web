import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { setAnimatedThumbnails } from "../../lib/animated-thumbnails";
import { ConversationAvatar } from "./ConversationAvatar";

afterEach(() => { cleanup(); localStorage.clear(); });

const row: ParticipantView = { threadId: "one", title: "project-1", selected: false, available: true, switching: false, unread: 0, reach: "listening", working: false };
const draw = () => render(<RoomProvider store={createRoomStore()}><ConversationAvatar row={row} /></RoomProvider>);
const creature = (container: HTMLElement) => container.querySelector<HTMLElement>(".sv-avatar")!;

test("a conversation's thumbnail keeps its mouth still", () => {
  const { container } = draw();
  expect(creature(container)).toHaveAttribute("data-mouth", "still");
});

test("with the developer option on, the thumbnail lip-syncs like the stage's agent, and follows the switch", () => {
  const { container } = draw();
  act(() => setAnimatedThumbnails(true));
  expect(creature(container)).toHaveAttribute("data-mouth", "playback");
  act(() => setAnimatedThumbnails(false));
  expect(creature(container)).toHaveAttribute("data-mouth", "still");
});
