import { Fragment } from "react";
import { Popover } from "../../components/ui/Popover";
import { WarningIcon } from "../../components/ui/Icons";
import { pluralKey, translator } from "../../i18n/translator";
import { useUiLanguage } from "../../i18n/use-ui-language";
import { languageName, languagePrimary, languageSupported, orderLanguages } from "./model-languages";

/* Which languages the chosen model supports, in its spec sheet or on the line under its pickers (ModelPrepare): the
 * interface's and the chosen one first, then in the engine's order; four named, the rest behind "+N more", which opens
 * all of them in a popover (sidevoice-web#339). The language in use — the chosen one, else the interface's — is bold, on
 * the line and in the popover. */

/** How many are named on the line before "+N more". */
const SHOWN = 4;

const name = (tag: string, bold: string) => languagePrimary(tag) === languagePrimary(bold) ? <strong>{languageName(tag)}</strong> : languageName(tag);

/** The languages line: `languages` as the engine lists them, `chosen` the one set in Transcription (none: automatic). */
export function ModelLanguages({ languages, chosen }: { languages: readonly string[]; chosen: string | null }) {
  const ui = useUiLanguage();
  const t = translator();
  const ordered = orderLanguages(languages, [ui, chosen]);
  const inUse = chosen ?? ui;
  const n = ordered.length - SHOWN;
  const title = t("voice.languages.title", { n: ordered.length });
  return <>
    {ordered.slice(0, SHOWN).map((tag, index) => <Fragment key={index}>{index > 0 && ", "}{name(tag, inUse)}</Fragment>)}
    {n > 0 && <>{" "}
      {/* A link in the text that opens all of them; its name holds the words it shows (WCAG 2.5.3), and says what they are. */}
      <Popover side="bottom" align="start" label={title} className="model-languages-popover"
        trigger={<button type="button" className="model-languages-more" aria-label={t(pluralKey("voice.languages.moreLabel", n), { n })}>{t(pluralKey("voice.languages.more", n), { n })}</button>}>
        <p className="ui-popover-title">{title}</p>
        <ul className="model-languages-list">{ordered.map((tag, index) => <li key={index}>{name(tag, inUse)}</li>)}</ul>
      </Popover>
    </>}
  </>;
}

/** Under the line: that the language in use — the chosen one, else the interface's — is not one of the model's. Its
 *  region is always there, empty while there is nothing to say, so choosing a model says it. A model that lists no
 *  languages says nothing. */
export function ModelLanguageNotice({ languages, chosen }: { languages: readonly string[]; chosen: string | null }) {
  const ui = useUiLanguage();
  const t = translator();
  const inUse = chosen ?? ui;
  const text = languageSupported(languages, inUse) ? "" : t("voice.languages.unsupported", { language: languageName(inUse) });
  // The language's name may start the sentence, and some languages write it in lower case ("español").
  return <div className="model-prepare-notice" aria-live="polite">
    {text && <><WarningIcon size={16} /><span>{text.charAt(0).toLocaleUpperCase(ui) + text.slice(1)}</span></>}
  </div>;
}
