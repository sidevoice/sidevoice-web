import { memo } from "react";
import { Avatar } from "../../components/ui/Avatar";
import { avatarFor } from "../avatar/avatar-spec";
import { stillAvatar } from "../avatar/avatar-state";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { creatureFromSeed } from "../avatar/creature/catalogue";
import { translator } from "../../i18n/translator";
import { speakerName } from "./group-messages";
import { DraftBubble, TurnPill, WorkingRow } from "./LiveRows";
import { MessageBubble, type BubblePosition } from "./MessageBubble";
import { UnheardMark } from "./UnheardMark";
import { hearingOf } from "./UnheardReply";
import type { LiveRow, RunView } from "./transcript-blocks";

/** The agent's face in the transcript ('overflow', T37, T41): its whole creature, 44px, no frame, a soft drop shadow,
 *  floating over the foot left corner of its run's last message and taking no room. Drawn from its own render (the rig's
 *  still face, creature/host.ts drawFace), never cropped from the stage, and never blank (T40): asked for at once, its
 *  outline standing in until it is painted (CharacterAvatar immediate). A run from no known conversation keeps its
 *  initials. */
function RunFace({ name, thread }: { name: string; thread: string | null }) {
  return <span className="chat-face" aria-hidden="true">
    {thread ? <CharacterAvatar spec={avatarFor(thread)} state={stillAvatar("present")} size="small" immediate /> : <Avatar name={name} decorative />}
  </span>;
}

function LiveRowView({ row, position, accent }: { row: LiveRow; position: BubblePosition; accent?: string }) {
  if (row.kind === "working") return <WorkingRow position={position} accent={accent} />;
  if (row.kind === "turn") return <TurnPill phase={row.phase} cancellable={row.cancellable} />;
  return <DraftBubble text={row.text} cancellable={row.cancellable} />;
}

/* A run of one side's messages, as a chat app draws it (2026-10-11): the agent's at the left, every message of the run at
 * one edge and its face once, over the run's foot; the person's at the right. The run's last message is tucked toward
 * its speaker, whatever it is (a reply never played, the working row). Drawn again only when what it shows changed
 * (`sig`, transcript-blocks.ts): the live turn moving on never draws the runs above it again, and the face stays put as
 * its run grows. */
export const MessageGroup = memo(function MessageGroup({ run }: { run: RunView; sig: string }) {
  const t = translator();
  const total = run.messages.length + run.live.length;
  const position = (index: number): BubblePosition => total === 1 ? "only" : index === 0 ? "first" : index === total - 1 ? "last" : "middle";
  const accent = run.role === "assistant" && run.thread ? creatureFromSeed(run.thread).accent : undefined;
  return (
    <section className="message-group" data-role={run.role} aria-label={t("messages.group", { name: speakerName(run, t) })}>
      {run.messages.map((message, index) => (
        <div className="chat-message-row" key={message.segment || `${message.time}-${index}`}>
          {hearingOf(message).kind === "never" ? <UnheardMark message={message} position={position(index)} /> : <MessageBubble message={message} position={position(index)} />}
        </div>
      ))}
      {run.live.map((row, index) => (
        <div className="chat-message-row" key={"live-" + row.kind}><LiveRowView row={row} position={position(run.messages.length + index)} accent={accent} /></div>
      ))}
      {run.role === "assistant" && <RunFace name={speakerName(run, t)} thread={run.thread} />}
    </section>
  );
}, (before, after) => before.sig === after.sig);
