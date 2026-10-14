import type { RoomViewState } from "../../state/room-store";
import type { MessageKey } from "../../i18n/translator";

/* What a release added that needs the person — not every change, only what they would set up or want to know — each
 * with the release it came in, where it is set up, and whether this device has it already (read live, as the setup
 * reads what is done). A device set up on an earlier release is shown what came after (WhatsNew). */

/** This release, counted: raise it with each release that adds an entry below. */
export const RELEASE = 2;

export interface Feature {
  id: string;
  introducedIn: number;
  title: MessageKey;
  line: MessageKey;
  /** The Settings section that sets it up, and the control there (its id) to bring into view and point at. */
  section: string;
  control: string;
  achieved(room: RoomViewState): boolean;
}

export const FEATURES: Feature[] = [
  { id: "end-of-turn-smart", introducedIn: 2, title: "whatsNew.endOfTurn.title", line: "whatsNew.endOfTurn.line", section: "call", control: "voice-end-of-turn",
    achieved: (room) => room.facts.voiceSettings?.end_of_turn === "smart-turn" },
  { id: "speech-language", introducedIn: 2, title: "whatsNew.speechLanguage.title", line: "whatsNew.speechLanguage.line", section: "transcription", control: "stt-language",
    achieved: (room) => !!room.facts.voiceSettings?.stt.language },
];
