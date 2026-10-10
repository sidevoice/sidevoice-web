/* Keyed messages for the conversation — the transcript and a reply's karaoke (AGENTS.md) — through the room's one
 * translator (i18n/translator.ts). The call view, which shows these pieces, keeps its own words in its own bundle. */
import { createTranslator, type Translate } from "../../i18n/translator";
import { en, type ConversationMessageKey } from "./messages/en";
import { es } from "./messages/es";

export type ConversationTranslate = Translate<ConversationMessageKey>;

export const conversationTranslator = createTranslator(en, { es });
