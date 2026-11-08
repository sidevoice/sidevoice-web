import { Command } from "cmdk";
import { Check, ChevronDown, Languages, Search } from "lucide-react";
import { useState } from "react";
import { translator } from "../../i18n/translator";
import { cn } from "../../lib/cn";
import { Popover } from "./Popover";
import "./language-picker.css";

export interface LanguageOption { value: string; label: string }

interface LanguagePickerProps {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  options: LanguageOption[];
  label: string;
  showLanguageIcon?: boolean;
  size?: "sm" | "md";
  className?: string;
}

const fold = (text: string) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase();

/** Searchable language choices, shared by interface, transcription and voice filtering. */
export function LanguagePicker({ id, value, onValueChange, options, label, showLanguageIcon = false, size = "md", className }: LanguagePickerProps) {
  const t = translator();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const chosen = options.find((option) => option.value === value);
  const shown = options.filter((option) => !query || fold(`${option.label} ${option.value}`).includes(fold(query)));
  const changeOpen = (next: boolean) => { setOpen(next); if (!next) setQuery(""); };
  const choose = (next: string) => { onValueChange(next); changeOpen(false); };

  return <Popover label={label} side="bottom" align="start" open={open} onOpenChange={changeOpen} className="language-picker-popover"
    trigger={<button id={id} type="button" className={cn("language-picker-trigger", size === "sm" && "language-picker-trigger--sm", className)}
      data-value={value} aria-label={`${label}: ${chosen?.label ?? ""}`}>
      {showLanguageIcon && <Languages size={18} aria-hidden="true" />}
      <span className="language-picker-value">{chosen?.label ?? t("languagePicker.search")}</span>
      <ChevronDown size={16} aria-hidden="true" className="language-picker-chevron" />
    </button>}>
    <Command className="language-picker-command" shouldFilter={false} loop label={t("languagePicker.search")}>
      <div className="language-picker-search"><Search size={18} aria-hidden="true" />
        <Command.Input autoFocus value={query} onValueChange={setQuery} aria-label={t("languagePicker.search")}
          placeholder={t("languagePicker.search")} />
      </div>
      <Command.List className="language-picker-list">
        {shown.map((option) => <Command.Item key={option.value} value={`${option.label} ${option.value}`} onSelect={() => choose(option.value)}
          className="language-picker-option" data-current={option.value === value || undefined}>
          <span>{option.label}</span>{option.value === value && <Check size={17} aria-hidden="true" />}
        </Command.Item>)}
        {shown.length === 0 && <Command.Empty className="language-picker-empty">{t("languagePicker.noResults")}</Command.Empty>}
      </Command.List>
    </Command>
  </Popover>;
}
