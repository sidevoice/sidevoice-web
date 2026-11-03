import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { expect, test } from "vitest";
import { createRoomStore, RoomStoreContext } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { useModelState } from "./ModelSetup";

/* Automatic follows the recommendation as it stands: the state, and the download offered, are that build's. */

const build = (id: string, installed: boolean) => ({ id, backend: "x", precision: "q8", downloadBytes: 5, memoryMb: 1, available: true, installed, reasons: [] });
const catalogue = (recommendedBuild: string) => [{ id: "local", name: null, status: { stale: false }, models: [{ id: "m", family: "m", capabilities: ["stt"], languages: [], voices: [], installed: true, recommendedBuild,
  builds: [build("m/sherpa", true), build("m/metal", false)] }] }];
const draft = { ...defaultVoiceSettings(), stt: { ...defaultVoiceSettings().stt, catalog: "local", model: "m" } };
const store = createRoomStore();
const publish = (recommendedBuild: string) => store.patch({ voiceCatalogue: { state: "ready", catalogs: catalogue(recommendedBuild) as never, error: "" } });
const wrapper = ({ children }: { children: ReactNode }) => createElement(RoomStoreContext.Provider, { value: store }, children);

test("a recommendation that changes after Automatic was first used is followed: its build, not downloaded, offered", () => {
  publish("m/sherpa");
  const view = renderHook(() => useModelState("stt", draft), { wrapper });
  expect(view.result.current.build?.id).toBe("m/sherpa");
  expect(view.result.current.status).toBe("ready");
  act(() => publish("m/metal"));
  expect(view.result.current.build?.id).toBe("m/metal");
  expect(view.result.current.status).toBe("absent");
  expect(view.result.current.ready).toBe(false);
  expect(view.result.current.buildChosen).toBe(false);
});
