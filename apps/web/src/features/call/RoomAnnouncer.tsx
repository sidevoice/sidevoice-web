import { useContext, useEffect, useState } from "react";
import { RoomStoreContext } from "../../state/room-store";
import { callTranslator } from "./call-i18n";
import { watchAnnouncements } from "./announcer";

/** Call model B's one polite, visually hidden region (`#room-announcer`, §4): what announcer.ts says. Several things
 *  said at once are said together; the region is emptied first, so the same words said again are heard again. */
export function RoomAnnouncer() {
  const store = useContext(RoomStoreContext);
  const [text, setText] = useState("");
  useEffect(() => {
    if (!store) return;
    let queue: string[] = [];
    let timer: ReturnType<typeof setTimeout> | null = null;
    const say = (words: string) => {
      queue.push(words);
      if (timer) return;
      setText("");
      timer = setTimeout(() => { timer = null; setText(queue.join(" ")); queue = []; }, 100);
    };
    const stop = watchAnnouncements(store, say, callTranslator());
    return () => { stop(); if (timer) clearTimeout(timer); };
  }, [store]);
  return <div id="room-announcer" className="sr-only" role="status" aria-live="polite">{text}</div>;
}
