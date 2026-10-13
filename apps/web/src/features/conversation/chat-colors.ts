import { useVariant } from "../../lib/variants";

/* The chat's palette (VARIANTS `chat-colors`): today's, the agent in lila and the person in crema; "soft", the person in
 * a tint of the brand's lila and the agent in a plain grey; "filled", the person in the lila itself with white text,
 * the agent grey. The call's <main> wears it (theme.css), so the transcript's bubbles and the person's bubble on the
 * stage change together. */
export const CHAT_COLORS = ["today", "soft", "filled"] as const;
export type ChatColors = (typeof CHAT_COLORS)[number];

/** The palette picked, for the call's <main>: `data-chat-colors`, none for today's. */
export function useChatColors(): ChatColors | undefined {
  const colors = useVariant("chat-colors", CHAT_COLORS);
  return colors === "today" ? undefined : colors;
}
