import type { Meta, StoryObj } from "@storybook/react-vite";
import { useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CallCard } from "./CallCard";
import type { CallControlsHost, CallControlsState } from "./host";
import cardSheet from "./call-card.css?inline";
import { cardSnapshot, row } from "../test/call-card";
import { createRoomStore, RoomStoreContext } from "../state/room-store";
import { CallLayoutContext, createCallLayoutStore } from "../state/call-layout";
import { FLOATING_CARD_KEY, setFloatingCard, type CardSize } from "../state/floating-card";
import { translator } from "../i18n/translator";

/* The desktop app's floating call card in its avatar format: the agent's creature on nothing, the compact card coming out
 * under it only when pointed at. While you are muted, a mic crossed out sits centred at the creature's feet (white on the
 * solid muted colour, a white ring; 20 / 24 / 28 px for S / M / L), over the creature and out of the window's flow, the
 * creature not dimmed; for the eye only (the compact card's mute button says it). It is the real card (CallCard) on a
 * host that relays a call and carries nothing back. The card is its own page: its stylesheet (call-card.css) holds that
 * page's root, body and window rules, so it is applied here inside each specimen alone (a CSS scope), the page's rules
 * on the specimen's box, which wears its column's theme; the catalogue does not load it otherwise. The format and size
 * are the page's preference (Settings › Floating card), one for the whole page: one size per story, put back after. */

/** The card page's stylesheet, in a scope: its page's root, body and window rules on the specimen's box; the typeface (the
 *  room's sheets declare it) left out, and the keyframes, which a scope can't hold, outside it. */
const KEYFRAMES = /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
const CARD_WINDOW = (cardSheet.match(KEYFRAMES) ?? []).join("\n") + `\n@scope (.catalogue-card-window) {\n${cardSheet
  .replace(KEYFRAMES, "")
  .replace(/@font-face\s*\{[^}]*\}/g, "")
  .replace(/\bhtml,\s*body\b|:root\b|#root\b/g, ":scope")
  .replace(/(^|[\s,}])body(?=\s*[{,])/g, "$1:scope")}\n}`;

/** The card's window: the card page's sheet applies inside it, its root wearing the theme of the column it is in. */
function CardWindow({ children }: { children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [theme, setTheme] = useState<string | null>(null);
  useLayoutEffect(() => setTheme(box.current?.parentElement?.closest("[data-theme]")?.getAttribute("data-theme") ?? "light"), []);
  return <div ref={box} className="catalogue-card-window" data-theme={theme ?? undefined}><style>{CARD_WINDOW}</style>{theme && children}</div>;
}

/** A call with one conversation, you muted or not: the host relays it once and carries nothing back. */
function Card({ muted }: { muted: boolean }) {
  const [store] = useState(createRoomStore);
  const [layout] = useState(() => createCallLayoutStore(null));
  const host = useMemo<CallControlsHost>(() => {
    const state: CallControlsState = {
      call: cardSnapshot({ micEnabled: !muted, participants: [row("t-web", { title: "sidevoice-web", selected: true })] }),
      level: 0, pointerInside: false, alwaysExpanded: false, muteShortcut: "⌃⌥M",
    };
    return { subscribe: (listener) => { listener(state); return () => {}; }, run: () => {}, layout: () => {}, drag: () => {} };
  }, [muted]);
  return (
    <RoomStoreContext.Provider value={store}>
      <CallLayoutContext.Provider value={layout}><CardWindow><CallCard host={host} t={translator()} /></CardWindow></CallLayoutContext.Provider>
    </RoomStoreContext.Provider>
  );
}

/** The page's card preference at `size` (the format is set before the story, and put back after it). */
function Sized({ size, children }: { size: CardSize; children: ReactNode }) {
  const [set, setSet] = useState(false);
  useLayoutEffect(() => { setFloatingCard({ format: "avatar", size }); setSet(true); }, [size]);
  return set ? children : null;
}

type Args = { size: CardSize };

const meta = {
  title: "Product/Call/CallCard",
  args: { size: "m" },
  argTypes: { size: { control: "inline-radio", options: ["s", "m", "l"], description: "The card's size (Settings › Floating card): one for the page." } },
  beforeEach: () => {
    const before = localStorage.getItem(FLOATING_CARD_KEY);
    setFloatingCard({ format: "avatar" });
    return () => { if (before === null) localStorage.removeItem(FLOATING_CARD_KEY); else localStorage.setItem(FLOATING_CARD_KEY, before); };
  },
  render: ({ size }) => (
    <Sized size={size}>
      <div className="catalogue-row" style={{ alignItems: "flex-start", gap: 32 }}>
        {[false, true].map((muted) => (
          <div key={String(muted)}><p className="catalogue-label">{muted ? "Muted" : "Microphone on"}</p><Card muted={muted} /></div>
        ))}
      </div>
    </Sized>
  ),
} satisfies Meta<Args>;
export default meta;
type Story = StoryObj<typeof meta>;

/** The avatar format at M: the mic on (nothing at the creature's feet), and muted (24px mark). */
export const AvatarFormat: Story = {};
/** At S: a 20px mark. */
export const AvatarFormatSmall: Story = { args: { size: "s" } };
/** At L: a 28px mark. */
export const AvatarFormatLarge: Story = { args: { size: "l" } };
