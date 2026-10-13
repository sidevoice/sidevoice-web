import { afterEach, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { SettingsDialog } from "./SettingsDialog";
import { hostTranslator } from "./host-i18n";
import { en } from "./messages/en";
import { RoomProvider } from "../../app/RoomProvider";
import { createRoomStore } from "../../state/room-store";
import { defaultVoiceSettings } from "../../services/voice-settings.js";
import { UI_LANGUAGE_NAMES, UI_LANGUAGES } from "../../services/system-language.js";
import type { SidevoiceActions } from "../../state/room-types";

vi.mock("../../services/room-session-controller.js", () => ({}));
afterEach(() => { cleanup(); localStorage.removeItem("sidevoice.settings"); });

/* Every interface language, smoke-tested where most of its words are: Settings, section by section. A key with no text
 * would show as the key itself; the bundles' own test holds every language to every key. */
const keys = new Set(Object.keys(en));
const said = () => [
  ...[...document.querySelectorAll("#language-settings *")].flatMap((element) => [...element.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent!.trim())),
  ...[...document.querySelectorAll("#language-settings [aria-label], #language-settings [title], #language-settings [placeholder]")]
    .flatMap((element) => ["aria-label", "title", "placeholder"].map((name) => element.getAttribute(name) ?? "")),
].filter(Boolean);

test.each(UI_LANGUAGES)("Settings in %s: every section renders in it, with no key or English fallback showing", (language) => {
  localStorage.setItem("sidevoice.settings", JSON.stringify({ ui_language: language }));
  const store = createRoomStore();
  const settings = defaultVoiceSettings();
  act(() => store.patch({ voiceSettings: settings, voiceDraft: settings, voiceCatalogue: { state: "ready", catalogs: [], error: "" }, settingsSection: "general", uiLanguage: language }));
  window.sidevoiceActions = { editVoice: vi.fn(), installVoiceModel: vi.fn(), loadVoiceCatalogue: vi.fn() } as unknown as SidevoiceActions;
  render(<RoomProvider store={store}><SettingsDialog /></RoomProvider>);
  document.getElementById("language-settings")!.setAttribute("open", "");
  const t = hostTranslator(language);
  const own = new Set<string>(Object.keys(en).map((key) => t(key as keyof typeof en)));
  const english = new Set<string>(Object.values(en).filter((text) => !/\{\w+\}/.test(text)));
  expect(document.getElementById("ui-language")).toHaveTextContent(UI_LANGUAGE_NAMES[language]);
  const sections = [...document.querySelectorAll<HTMLButtonElement>(".settings-nav > button")];
  expect(sections.length).toBeGreaterThan(3);
  for (const section of sections) {
    fireEvent.click(section);
    // Neither a key, nor the English of a text this language says otherwise.
    const leaked = said().filter((text) => keys.has(text) || (english.has(text) && !own.has(text)));
    expect(leaked, section.id).toEqual([]);
  }
  expect(sections[0]).toHaveTextContent(t("settings.section.general"));
});
