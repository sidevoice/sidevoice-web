import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import type { ParticipantView } from "../../state/room-types";
import { setAnimatedThumbnails } from "../../lib/animated-thumbnails";
import { MOTION_KEY, startMotion } from "../../lib/motion";
import { ConversationAvatar } from "./ConversationAvatar";

const motion = (how: "gpu" | "still") => { localStorage.setItem(MOTION_KEY, how); act(() => startMotion()); };
afterEach(() => { cleanup(); motion("still"); localStorage.clear(); });

const row: ParticipantView = { threadId: "one", title: "project-1", selected: false, available: true, switching: false, unread: 0, reach: "listening", working: false };
const draw = () => render(<RoomProvider store={createRoomStore()}><ConversationAvatar row={row} /></RoomProvider>);
const creature = (container: HTMLElement) => container.querySelector<HTMLElement>(".sv-avatar")!;

test("a conversation's thumbnail keeps its mouth still", () => {
  const { container } = draw();
  expect(creature(container)).toHaveAttribute("data-mouth", "still");
});

test("with the developer option on, the thumbnail lip-syncs like the stage's agent, and follows the switch", () => {
  motion("gpu");
  const { container } = draw();
  act(() => setAnimatedThumbnails(true));
  expect(creature(container)).toHaveAttribute("data-mouth", "playback");
  act(() => setAnimatedThumbnails(false));
  expect(creature(container)).toHaveAttribute("data-mouth", "still");
});

/* Choosing a conversation (a click, a double click, a drag across the list) must not select or highlight the creature,
 * and it must not be draggable, copied or offered iOS's image menu on a long press. Its drawing is a canvas (an SVG while
 * it loads), not an img, so this is the stylesheet's to say. */
test("the creature and its halo are not selectable, draggable or long-pressable", () => {
  const css = readFileSync(join(import.meta.dirname, "../room/room.css"), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const rule = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)].find(([, selectors]) => selectors.split(",").map((selector) => selector.trim()).includes(".conversation-avatar *"));
  expect(rule, "a rule for the avatar and everything in it").toBeDefined();
  expect(rule![1].split(",").map((selector) => selector.trim())).toContain(".conversation-avatar");
  for (const declaration of ["-webkit-user-select: none", "user-select: none", "-webkit-touch-callout: none", "-webkit-user-drag: none"]) {
    expect(rule![2].split(";").map((part) => part.trim()), declaration).toContain(declaration);
  }
});
