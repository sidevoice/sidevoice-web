import { cn } from "../../lib/cn";
import { translator } from "../../i18n/translator";

/* A failure as a person reads it (AGENTS.md): a sentence in their language, never the raw text of what failed. What was
 * raw about it — its code, the engine's or the browser's own words — is kept, closed, behind "Details", for whoever has
 * to find out what happened; a provider's own words may follow the sentence, since that is the provider speaking. */

export interface ErrorMessage {
  /** The sentence, from a bundle: a known failure's own copy, or a generic line about what failed. */
  text: string;
  /** A provider's own words after it (why it refused a key, that it is out of credit), as it said them. */
  said?: string;
  /** What was raw about it, shown only behind "Details". */
  details?: string;
}

/** What was raw about a failure, closed behind "Details": never the headline, never translated. */
export function ErrorDetails({ details, className }: { details?: string; className?: string }) {
  if (!details) return null;
  const t = translator();
  return (
    <details className={cn("ui-error-details", className)}>
      <summary>{t("ui.details")}</summary>
      <pre translate="no">{details}</pre>
    </details>
  );
}

/** A failure where it happened: its sentence, a provider's words after it, then its Details. */
export function ErrorText({ message, className, id, role }: { message: ErrorMessage; className?: string; id?: string; role?: "alert" | "status" }) {
  return (
    <div className={cn("ui-error-text", className)} id={id} role={role}>
      <p>{message.text}{message.said && <span className="ui-error-said" translate="no"> {message.said}</span>}</p>
      <ErrorDetails details={message.details} />
    </div>
  );
}
