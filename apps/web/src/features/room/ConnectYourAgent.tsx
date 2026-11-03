import { useRef, type CSSProperties } from "react";
import { Button } from "../../components/ui/Button";
import { CheckIcon, CopyIcon, WarningIcon } from "../../components/ui/Icons";
import { CopyButton, Quote, useCopy } from "../../components/ui/Snippet";
import { translator } from "../../i18n/translator";
import { useVariant } from "../../lib/variants";
import { avatarFor } from "../avatar/avatar-spec";
import { avatarColor } from "../avatar/bicho-draw";
import { useAvatarState } from "../avatar/avatar-state";
import { CharacterAvatar, type AvatarSize } from "../avatar/CharacterAvatar";
import { StageBackdrop, useSceneScale } from "../avatar/StageScene";
import "./connect-agent.css";

/* What to tell an agent so it joins the room: a conversation starts in the agent's own session, never from the page, so
 * this says so and quotes the phrase to say, in the interface's language, ready to copy — naming the tool literally
 * (voice_connect), so a weaker model finds it too. The New conversation panel and the setup's last step both show it.
 * `why`: also that the page cannot start one (where the person asked it to).
 *
 * It is an open design decision (sidevoice-web#463, VARIANTS `connectAgent`): `current` is today's, the others are
 * ways to draw the same thing in the line of the creatures and the dark stage. The preview's panel picks one; a
 * `variant` prop (the design-system page's specimens) overrides it. Once one is chosen, the others and this switch go. */

export const CONNECT_VARIANTS = ["current", "creature", "chip", "steps", "minimal"] as const;
export type ConnectVariant = (typeof CONNECT_VARIANTS)[number];

type Words = ReturnType<typeof translator>;
type Title = "p" | "h3";

/** The phrase with the tool's name set as code, so the one literal word the agent needs stands out. The name is in
 *  every language's phrase (NewConversation.test); a phrase without it is shown whole. */
function Phrase({ text }: { text: string }) {
  const [before, ...rest] = text.split("voice_connect");
  if (!rest.length) return <>{text}</>;
  return <>{before}<code className="connect-tool">voice_connect</code>{rest.join("voice_connect")}</>;
}

/** The creature that waits for the agent: the same figure each time, idle, in its tone. */
function Creature({ size }: { size: AvatarSize }) {
  const spec = avatarFor("sidevoice-agent");
  const avatar = useAvatarState(spec, "idle");
  return <span className="connect-creature" data-size={size} style={{ "--cc-tone": avatarColor(spec) } as CSSProperties}>
    <CharacterAvatar spec={spec} state={avatar} size={size} />
  </span>;
}

function Current({ why, Title, t }: { why: boolean; Title: Title; t: Words }) {
  return <>
    <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>
    <p className="connect-agent-body">{t(why ? "sidebar.newBody" : "connect.body")}</p>
    <Quote text={t("sidebar.newPhrase")} label={t("sidebar.newCopy")} />
  </>;
}

/** A: the creature, waiting on the dark stage, a line, and one button that copies. */
function CreatureLed({ Title, t }: { Title: Title; t: Words }) {
  const phrase = useRef<HTMLParagraphElement>(null);
  const [feedback, copy] = useCopy(t("sidebar.newPhrase"), phrase);
  const said = feedback === "copied" ? t("ui.copied") : feedback === "failed" ? t("ui.copyFailed") : "";
  const scene = useSceneScale();
  const tone = avatarColor(avatarFor("sidevoice-agent"));
  return <>
    <div ref={scene} className="connect-hero" style={{ "--cc-tone": tone } as CSSProperties}>
      <div className="stage-scene"><StageBackdrop seed="sidevoice-agent" tone={tone} /></div>
      <Creature size="stage" />
    </div>
    <Title className="connect-agent-title connect-centered">{t("connect.waiting.title")}</Title>
    <p className="connect-agent-body connect-centered">{t("connect.waiting.body")}</p>
    <Button variant="primary" block onClick={() => void copy()} aria-label={t("sidebar.newCopy")}>
      {feedback === "copied" ? <CheckIcon /> : feedback === "failed" ? <WarningIcon /> : <CopyIcon />}
      {said || t("connect.copyCta")}
    </Button>
    <span className="sr-only" role="status">{said}</span>
    <p ref={phrase} className="connect-caption"><Phrase text={t("sidebar.newPhrase")} /></p>
  </>;
}

/** B: the phrase as a chip, one tap to copy it, the tool's name in code. */
function ChipCard({ why, Title, t }: { why: boolean; Title: Title; t: Words }) {
  const phrase = useRef<HTMLSpanElement>(null);
  const [feedback, copy] = useCopy(t("sidebar.newPhrase"), phrase);
  const said = feedback === "copied" ? t("ui.copied") : feedback === "failed" ? t("ui.copyFailed") : "";
  return <>
    <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>
    <p className="connect-agent-body">{t(why ? "sidebar.newBody" : "connect.body")}</p>
    <button type="button" className="connect-chip" data-state={feedback ?? undefined} aria-label={t("sidebar.newCopy")} title={said || t("sidebar.newCopy")} onClick={() => void copy()}>
      <span className="connect-chip-text" ref={phrase}><Phrase text={t("sidebar.newPhrase")} /></span>
      <span className="connect-chip-icon" aria-hidden>{feedback === "copied" ? <CheckIcon size={16} /> : feedback === "failed" ? <WarningIcon size={16} /> : <CopyIcon size={16} />}</span>
    </button>
    <span className="sr-only" role="status">{said}</span>
  </>;
}

/** C: three steps, the creature waiting beside the title and a pulse on the last one. */
function Steps({ Title, t }: { Title: Title; t: Words }) {
  return <>
    <div className="connect-steps-head">
      <Creature size="small" />
      <div className="connect-steps-title">
        <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>
        <p className="connect-waiting"><span className="connect-pulse" aria-hidden />{t("connect.waiting.title")}</p>
      </div>
    </div>
    <ol className="connect-steps">
      <li><span className="connect-step-n" aria-hidden>1</span><span className="connect-step-body">{t("connect.step.open")}</span></li>
      <li><span className="connect-step-n" aria-hidden>2</span><span className="connect-step-body">{t("connect.step.say")}<Quote text={t("sidebar.newPhrase")} label={t("sidebar.newCopy")} /></span></li>
      <li><span className="connect-step-n" aria-hidden>3</span><span className="connect-step-body">{t("connect.step.talk")}</span></li>
    </ol>
  </>;
}

/** D: a line and the phrase, nothing else. */
function Minimal({ why, t }: { why: boolean; t: Words }) {
  const phrase = useRef<HTMLSpanElement>(null);
  return <>
    <p className="connect-agent-body">{t(why ? "sidebar.newBody" : "connect.body")}</p>
    <div className="ui-copy connect-line">
      <span className="connect-line-text" ref={phrase}><Phrase text={t("sidebar.newPhrase")} /></span>
      <CopyButton text={t("sidebar.newPhrase")} label={t("sidebar.newCopy")} target={phrase} />
    </div>
  </>;
}

export function ConnectYourAgent({ why = false, titleAs: Title = "p", variant }: { why?: boolean; titleAs?: Title; variant?: ConnectVariant }) {
  const t = translator();
  const picked = useVariant("connectAgent", CONNECT_VARIANTS);
  const shown = variant ?? picked;
  return (
    <div className="connect-agent" data-variant={shown === "current" ? undefined : shown}>
      {shown === "creature" ? <CreatureLed Title={Title} t={t} />
        : shown === "chip" ? <ChipCard why={why} Title={Title} t={t} />
        : shown === "steps" ? <Steps Title={Title} t={t} />
        : shown === "minimal" ? <Minimal why={why} t={t} />
        : <Current why={why} Title={Title} t={t} />}
    </div>
  );
}
