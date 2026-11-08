import { Quote } from "../../components/ui/Snippet";
import { translator } from "../../i18n/translator";
import "./connect-agent.css";

/* What to tell an agent so it joins the room: a conversation starts in the agent's own session, never from the page, so
 * this says so and quotes the phrase to say, in the interface's language, ready to copy — naming the tool literally
 * (voice_connect), so a weaker model finds it too. The New conversation panel and the setup's last step both show it.
 * `why`: also that the page cannot start one (where the person asked it to). */
export function ConnectYourAgent({ why = false, titleAs: Title = "p" }: { why?: boolean; titleAs?: "p" | "h3" }) {
  const t = translator();
  return (
    <div className="connect-agent">
      <Title className="connect-agent-title">{t("sidebar.newTitle")}</Title>
      <p className="connect-agent-body">{t(why ? "sidebar.newBody" : "connect.body")}</p>
      <Quote text={t("sidebar.newPhrase")} label={t("sidebar.newCopy")} />
    </div>
  );
}
