import { useMemo, useState } from "react";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { Popover } from "../../components/ui/Popover";
import { LanguagePicker } from "../../components/ui/LanguagePicker";
import { translator } from "../../i18n/translator";
import "./voice-picker.css";

export type VoiceChoice = { id: string; name: string | null; languages: string[]; gender?: string | null };
const AUTOMATIC_VALUE = "__sidevoice_automatic_voice__";

type Props = {
  id: string;
  value: string;
  automatic: string;
  voices: VoiceChoice[];
  onValueChange: (value: string) => void;
};

function languageName(tag: string) {
  try { return new Intl.DisplayNames([document.documentElement.lang || "en"], { type: "language" }).of(tag) ?? tag; }
  catch { return tag; }
}

export function VoicePicker({ id, value, automatic, voices, onValueChange }: Props) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const languages = useMemo(() => [...new Set(voices.flatMap((voice) => voice.languages))]
    .sort((a, b) => languageName(a).localeCompare(languageName(b))), [voices]);
  const normalized = query.trim().toLocaleLowerCase();
  const shown = voices.filter((voice) => (!language || voice.languages.includes(language)) &&
    (!normalized || [voice.name, voice.id].some((part) => part?.toLocaleLowerCase().includes(normalized))));
  const automaticShown = !language && (!normalized || automatic.toLocaleLowerCase().includes(normalized));
  const chosen = voices.find((voice) => voice.id === value);
  const select = (next: string) => { onValueChange(next); setOpen(false); };
  const changeOpen = (next: boolean) => { setOpen(next); if (!next) { setQuery(""); setLanguage(""); } };

  return <Popover label={t("voice.voice")} side="bottom" align="start" open={open} onOpenChange={changeOpen} className="voice-picker"
    trigger={<button id={id} type="button" className="ui-select voice-picker-trigger" aria-haspopup="dialog" aria-expanded={open} data-value={value}>
      <span className="ui-select-value-text">{(chosen?.name ?? chosen?.id ?? value) || automatic}</span><ChevronDown size={16} aria-hidden="true" />
    </button>}>
    <Command className="voice-picker-command" shouldFilter={false} loop label={t("voice.picker.search")}>
      <div className="voice-picker-tools">
        <div className="voice-picker-search"><Search size={17} aria-hidden="true" />
          <Command.Input autoFocus value={query} onValueChange={setQuery} aria-label={t("voice.picker.search")} placeholder={t("voice.picker.search")} />
          {languages.length > 0 && <LanguagePicker id="voice-picker-language" size="sm" showLanguageIcon value={language} onValueChange={setLanguage} label={t("voice.picker.language")}
            options={[{ value: "", label: t("voice.picker.allLanguages") }, ...languages.map((tag) => ({ value: tag, label: languageName(tag) }))]} />}
        </div>
      </div>
      <Command.List className="voice-picker-list">
        {automaticShown && <Command.Item value={AUTOMATIC_VALUE} onSelect={() => select("")} className="voice-picker-item" data-current={value === "" || undefined}>
          <span className="voice-picker-item-main"><span className="voice-picker-name">{automatic}</span></span>
          {value === "" && <Check size={16} aria-hidden="true" />}
        </Command.Item>}
        {shown.map((voice) => <Command.Item key={voice.id} value={voice.id} onSelect={() => select(voice.id)} className="voice-picker-item" data-current={value === voice.id || undefined}>
          <span className="voice-picker-item-main"><span className="voice-picker-name">{voice.name ?? voice.id}</span>
            {voice.languages.length > 0 && <span className="voice-picker-meta">{voice.languages.map(languageName).join(", ")}</span>}
          </span>
          {value === voice.id && <Check size={16} aria-hidden="true" />}
        </Command.Item>)}
        {!automaticShown && shown.length === 0 && <Command.Empty className="voice-picker-empty">{t("voice.picker.noResults")}</Command.Empty>}
      </Command.List>
    </Command>
  </Popover>;
}
