import { Fragment, useId, useState, type ReactNode } from "react";
import { Popover } from "../../components/ui/Popover";
import { Tooltip } from "../../components/ui/Tooltip";
import { ChevronIcon, WarningIcon } from "../../components/ui/Icons";
import { pluralKey, translator } from "../../i18n/translator";
import { useUiLanguage } from "../../i18n/use-ui-language";
import { useVariant } from "../../lib/variants";
import { cn } from "../../lib/cn";
import { languageAmong, languageName, languageSupported, orderLanguages } from "./model-languages";

/* Which languages the chosen model supports, on the line under its pickers (ModelPrepare's `meta`), after its note: the
 * interface's and the chosen one first, then in the engine's order; four named, the rest behind "+N more". How the rest
 * is revealed, and which names are bold, is still being compared (sidevoice-web#339):
 * - "popover": a click opens all of them in a popover; bold, the language in use (the chosen one, else the interface's).
 * - "inline": the line goes on with the rest, and folds back; bold, the interface's and the chosen one.
 * - "tooltip": hover, keyboard focus or a tap shows all of them; bold, the chosen one only. */
export const MODEL_LANGUAGES = ["popover", "inline", "tooltip"] as const;

/** How many are named on the line before "+N more". */
const SHOWN = 4;

type Languages = { ordered: string[]; bold: (string | null)[]; note?: string };

const name = (tag: string, bold: (string | null)[]) => languageAmong(tag, bold) ? <strong>{languageName(tag)}</strong> : languageName(tag);

/** Names, comma separated. */
function Names({ tags, bold }: { tags: string[]; bold: (string | null)[] }) {
  return <>{tags.map((tag, index) => <Fragment key={index}>{index > 0 && ", "}{name(tag, bold)}</Fragment>)}</>;
}

/** All of them, one per line, in columns: the popover's and the tooltip's. */
function NameList({ tags, bold, className }: { tags: string[]; bold: (string | null)[]; className?: string }) {
  return <ul className={cn("model-languages-list", className)}>{tags.map((tag, index) => <li key={index}>{name(tag, bold)}</li>)}</ul>;
}

/** The line: the note, the first names, then (with more than those) what reveals the rest. */
function Line({ ordered, bold, note, more }: Languages & { more: ReactNode }) {
  return <>{note}{note && ordered.length > 0 && " · "}<Names tags={ordered.slice(0, SHOWN)} bold={bold} />{ordered.length > SHOWN && more}</>;
}

/** "+N more", a link in the text that opens something; its name holds the words it shows (WCAG 2.5.3), and says what
 *  they are. An element, so a popover or a tooltip can take it as its trigger. */
function moreButton(n: number) {
  const t = translator();
  return <button type="button" className="model-languages-more" aria-label={t(pluralKey("voice.languages.moreLabel", n), { n })}>{t(pluralKey("voice.languages.more", n), { n })}</button>;
}

function PopoverLanguages(props: Languages) {
  const t = translator();
  const title = t("voice.languages.title", { n: props.ordered.length });
  return <Line {...props} more={<>{" "}
    <Popover side="bottom" align="start" label={title} className="model-languages-popover" trigger={moreButton(props.ordered.length - SHOWN)}>
      <p className="ui-popover-title">{title}</p>
      <NameList tags={props.ordered} bold={props.bold} />
    </Popover>
  </>} />;
}

function InlineLanguages(props: Languages) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const rest = useId();
  const n = props.ordered.length - SHOWN;
  return <Line {...props} more={<>
    <span id={rest} hidden={!open}>, <Names tags={props.ordered.slice(SHOWN)} bold={props.bold} /></span>{" "}
    {/* Open, what it shows is its name. */}
    <button type="button" className="model-languages-more" aria-expanded={open} aria-controls={rest} onClick={() => setOpen(!open)}
      aria-label={open ? undefined : t(pluralKey("voice.languages.moreLabel", n), { n })}>
      {open ? t("voice.languages.fewer") : t(pluralKey("voice.languages.more", n), { n })}<ChevronIcon size={12} className={open ? "model-languages-chevron-open" : undefined} />
    </button>
  </>} />;
}

function TooltipLanguages(props: Languages) {
  return <Line {...props} more={<>{" "}
    <Tooltip content={<NameList tags={props.ordered} bold={props.bold} className="model-languages-tip" />}>{moreButton(props.ordered.length - SHOWN)}</Tooltip>
  </>} />;
}

/** The languages line: `languages` as the engine lists them, `chosen` the one set in Transcription (none: automatic),
 *  `note` what the pane says about the model, before them. */
export function ModelLanguages({ languages, chosen, note }: { languages: readonly string[]; chosen: string | null; note?: string }) {
  const variant = useVariant("modelLanguages", MODEL_LANGUAGES);
  const ui = useUiLanguage();
  const ordered = orderLanguages(languages, [ui, chosen]);
  if (variant === "inline") return <InlineLanguages ordered={ordered} bold={[ui, chosen]} note={note} />;
  if (variant === "tooltip") return <TooltipLanguages ordered={ordered} bold={[chosen]} note={note} />;
  return <PopoverLanguages ordered={ordered} bold={[chosen ?? ui]} note={note} />;
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
