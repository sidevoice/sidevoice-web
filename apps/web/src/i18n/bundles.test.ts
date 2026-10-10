import { expect, test } from "vitest";
import { en as callEn } from "../features/call/messages/en";
import { es as callEs } from "../features/call/messages/es";
import { en as conversationEn } from "../features/conversation/messages/en";
import { es as conversationEs } from "../features/conversation/messages/es";
import { en as settingsEn } from "../features/settings/messages/en";
import { es as settingsEs } from "../features/settings/messages/es";

/* AGENTS.md: English has every key (each translator's type holds its callers to it); another language may lag, but what
 * it says must take the same placeholders. */
test.each([["call", callEn, callEs], ["conversation", conversationEn, conversationEs], ["settings", settingsEn, settingsEs]] as const)(
  "the %s bundle: Spanish keeps to English keys and placeholders, and no English text is empty", (_, en, es) => {
    const english: Record<string, string> = en;
    const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    for (const [key, text] of Object.entries(es)) {
      expect(english, key).toHaveProperty([key]);
      expect(placeholders(text!), key).toEqual(placeholders(english[key]));
    }
    for (const [key, text] of Object.entries(english)) expect(text.trim(), key).not.toBe("");
  });
