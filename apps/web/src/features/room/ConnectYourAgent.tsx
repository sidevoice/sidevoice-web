import { translator } from "../../i18n/translator";
import { avatarFor } from "../avatar/avatar-spec";
import { stillAvatar } from "../avatar/avatar-state";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { AgentMessage } from "./AgentMessage";
import "./connect-agent.css";

/* What to tell an agent so it joins the room: a conversation starts in the agent's own session, never from the page, so
 * this says so and gives the phrase to say, in the interface's language, ready to copy (AgentMessage, the landing's
 * message for the agent). Centred: its title, a creature waiting, the line that says where to say it, the phrase and, where
 * the person asked the page to start one (`why`), that it cannot yet. The New conversation panel and the setup's last step
 * both show it (operator, 2026-11-08, sidevoice-web#463). `compact` (the setup's last step, which has a recap above it to
 * fit unscrolled): the creature beside the title and the line instead of between them. */
export function ConnectYourAgent({ why = false, titleAs: Title = "p", compact = false }: { why?: boolean; titleAs?: "p" | "h3"; compact?: boolean }) {
  const t = translator();
  return (
    <div className="connect-agent" data-compact={compact || undefined}>
      <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>
      <WaitingCreature />
      <p className="connect-agent-body">{t("connect.body")}</p>
      <AgentMessage text={t("connect.phrase")} label={t("sidebar.newCopy")} />
      {/* What the page cannot do yet, said last and quietly: the phrase is what the panel is for. */}
      {why && <p className="connect-agent-note">{t("connect.notYet")}</p>}
    </div>
  );
}

/** The agent to come, whole, before the line that says what to tell it: always the same one, at rest; a picture, not
 *  something to read. Drawn sharp (`liveFace`: the box's device pixels, once, as it holds still), not the 144px still face,
 *  which shows soft at this size on a 2x screen. Its seed: any would do (a conversation's creature is rolled from its key);
 *  this one rolls a purple one in headphones, the brand's colour and a listener's. */
const WAITING_SEED = "new";
const WAITING = stillAvatar("idle");
function WaitingCreature() {
  return <span className="connect-waiting-creature" aria-hidden="true">
    <CharacterAvatar spec={avatarFor(WAITING_SEED)} state={WAITING} size="small" mouth="still" liveFace />
  </span>;
}
