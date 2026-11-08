import type { ReactNode } from "react";
import { Quote } from "../../components/ui/Snippet";
import { translator } from "../../i18n/translator";
import { avatarFor } from "../avatar/avatar-spec";
import { stillAvatar } from "../avatar/avatar-state";
import { CharacterAvatar } from "../avatar/CharacterAvatar";
import { AgentMessage } from "./AgentMessage";
import "./connect-agent.css";

/* What to tell an agent so it joins the room: a conversation starts in the agent's own session, never from the page, so
 * this says so and quotes the phrase to say, in the interface's language, ready to copy — naming the tool literally
 * (voice_connect), so a weaker model finds it too. The New conversation panel and the setup's last step both show it.
 * `why`: also that the page cannot start one (where the person asked it to).
 *
 * How the New conversation panel draws it is an open decision (sidevoice-web#463): `current` is today's (a title, a line,
 * the phrase between guillemets); A, B and C put the phrase on one line (AgentMessage, the landing's message for the agent)
 * and differ in the rest — A the same few lines, shorter; B the landing's steps; C a creature waiting behind the phrase.
 * The panel's variant (NewConversation) says which; the setup's step is today's until one is chosen. Once one is, the
 * others and the prop go. */
export const PANEL_VARIANTS = ["current", "a", "b", "c"] as const;
export type PanelVariant = (typeof PANEL_VARIANTS)[number];

type Title = "p" | "h3";

export function ConnectYourAgent({ why = false, titleAs: Title = "p", variant = "current" }: { why?: boolean; titleAs?: Title; variant?: PanelVariant }) {
  const t = translator();
  if (variant === "current") return (
    <div className="connect-agent">
      <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>
      <p className="connect-agent-body">{t(why ? "sidebar.newBody" : "connect.body")}</p>
      <Quote text={t("sidebar.newPhrase")} label={t("sidebar.newCopy")} />
    </div>
  );
  const phrase = <AgentMessage text={t("sidebar.newPhrase")} label={t("sidebar.newCopy")} />;
  // What the page cannot do yet, said last and quietly: the phrase is what the panel is for.
  const notYet = why ? <p className="connect-agent-note">{t("connect.notYet")}</p> : null;
  const title = <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>;
  return (
    <div className="connect-agent" data-variant={variant}>
      {variant === "a" ? <>
        {title}
        <p className="connect-agent-body">{t("connect.body")}</p>
        {phrase}
        {notYet}
      </> : variant === "b" ? <>
        {title}
        <ol className="connect-steps">
          <Step n={1}>{t("connect.step.open")}</Step>
          <Step n={2}>{t("connect.step.say")}{phrase}</Step>
          <Step n={3}>{t("connect.step.talk")}</Step>
        </ol>
        {notYet}
      </> : <>
        {title}
        <p className="connect-agent-body">{t("connect.body")}</p>
        <div className="connect-waiting">
          <WaitingCreature />
          {phrase}
        </div>
        {notYet}
      </>}
    </div>
  );
}

/** One of B's steps: its number in the accent's disc (the landing's), and what to do. A list's own numbering is what a
 *  screen reader says; the disc is drawn for the eye. */
function Step({ n, children }: { n: number; children: ReactNode }) {
  return <li className="connect-step"><span className="connect-step-n" aria-hidden="true">{n}</span><div className="connect-step-body">{children}</div></li>;
}

/** C's creature: the agent to come, standing behind the phrase, its head over the line's top edge, as a conversation's
 *  creature comes out of its card. Always the same one, at rest; a picture, not something to read. */
/** Its seed: any would do (a conversation's creature is rolled from its key); this one rolls a purple one in headphones, the
 *  brand's colour and a listener's. */
const WAITING_SEED = "new";
const WAITING = stillAvatar("idle");
function WaitingCreature() {
  return <span className="connect-waiting-creature" aria-hidden="true">
    <CharacterAvatar spec={avatarFor(WAITING_SEED)} state={WAITING} size="small" mouth="still" pop />
  </span>;
}
