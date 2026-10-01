import { useState, type ComponentType, type ReactNode } from "react";
import { useT } from "../../i18n";
import { OverlayPortalProvider, Tooltip, TooltipProvider } from "../ui/Tooltip";
import type { StageChoiceView, StageOptionView, StageTask } from "../../state/room-types";
import { Button } from "../ui/Button";
import { NativeSelect } from "../ui/NativeSelect";

/* The design-system fields a model family's options are drawn with. The schema comes from the model
 * catalogue; nothing here names a model or a family. */

type Change = (value: unknown, language?: string) => void;

function Choices({ choices }: { choices: StageChoiceView[] }) {
  const own = choices.filter((choice) => !choice.other);
  const other = choices.filter((choice) => choice.other);
  return (
    <>
      {own.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}
      {!!other.length && <optgroup label="Otros idiomas">{other.map((choice) => <option key={choice.value} value={choice.value}>{choice.label}</option>)}</optgroup>}
    </>
  );
}

/** What an option is for, when its name does not say it (operator, 2026-10-02): a «?» beside the label, its words in
 *  a tooltip and as its accessible name. Only options with a text in the bundles («option.help.<id>») have one. */
export function FieldHelp({ id }: { id: string }) {
  const t = useT();
  const key = "option.help." + id;
  const text = t(key);
  const [host, setHost] = useState<HTMLElement | null>(null);
  if (text === key) return null;
  // Its own provider: an option field may render where no tooltip provider is around (a test, an embed). Shown inside
  // the dialog it is in: a modal dialog sits above anything outside it.
  return (
    <TooltipProvider>
      <OverlayPortalProvider container={host}>
        <Tooltip content={text}>
          <button type="button" className="field-help" aria-label={text} onClick={(event) => event.preventDefault()}
            ref={(node) => { const dialog = node?.closest("dialog") ?? null; if (dialog !== host) setHost(dialog); }}>?</button>
        </Tooltip>
      </OverlayPortalProvider>
    </TooltipProvider>
  );
}

export function LanguageSelect({ id, label, value, choices, disabled, onChange, help }: { id: string; label: string; value: string; choices: StageChoiceView[]; disabled?: boolean; onChange: (value: string) => void; help?: ReactNode }) {
  return <label className="ui-field"><span className="field-label-row">{label}{help}</span><NativeSelect id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><Choices choices={choices} /></NativeSelect></label>;
}

export function TextField({ id, label, value, max, disabled, onChange, help }: { id: string; label: string; value: string; max: number; disabled?: boolean; onChange: (value: string) => void; help?: ReactNode }) {
  return <label className="ui-field"><span className="field-label-row">{label}{help}</span><textarea id={id} className="ui-text-field" rows={2} maxLength={max} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function RangeField({ id, label, value, min, max, step, disabled, onChange, help }: { id: string; label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void; help?: ReactNode }) {
  return (
    <label className="ui-field">
      <span className="field-label-row">{label} <output htmlFor={id}>{value.toFixed(2)}×</output>{help}</span>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/** A voice per speech language, each with its preview. */
export function VoicePicker({ id, option, disabled, onChange, onPreview, previewing, help }: {
  id: string; option: Extract<StageOptionView, { kind: "voice" }>; disabled?: boolean; onChange: Change; onPreview?: (language: string) => void; previewing?: string | null; help?: ReactNode;
}) {
  if (!option.perLanguage) {
    return <label className="ui-field">{option.label}<NativeSelect id={id} value={option.value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><Choices choices={option.choices} /></NativeSelect></label>;
  }
  return (
    <div className="voice-picker" id={id}>
      <span className="ui-field-label field-label-row">{option.label}{help}</span>
      {option.loading && <p className="muted" role="status">Cargando voces…</p>}
      {option.rows.map((row) => (
        <div className="voice-row" key={row.language}>
          <label className="voice-language" htmlFor={`${id}-${row.language}`}>{row.label}</label>
          <NativeSelect id={`${id}-${row.language}`} aria-label={`${option.label} · ${row.label}`} value={row.value} disabled={disabled} onChange={(event) => onChange(event.target.value, row.language)}>
            <Choices choices={row.choices} />
          </NativeSelect>
          {onPreview && <Button variant="ghost" size="icon" aria-label={`Probar voz · ${row.label}`} title={`Probar voz · ${row.label}`} onClick={() => onPreview(row.language)}>{previewing === row.language ? "■" : "▶"}</Button>}
        </div>
      ))}
    </div>
  );
}

/** A family that needs a field of its own registers it here, by option kind; none does yet. */
export const OPTION_COMPONENTS: Record<string, ComponentType<{ task: StageTask; option: StageOptionView; disabled?: boolean; onChange: Change }>> = {};

/** Every option of a stage's schema, each with the field its kind asks for. An option of a kind this build does
 *  not know is left out: a newer host may offer it, and the rest still renders. */
export function OptionsForm({ task, options, disabled, onChange, onPreview, previewing }: {
  task: StageTask; options: StageOptionView[]; disabled?: boolean; onChange: (id: string, value: unknown, language?: string) => void;
  onPreview?: (language: string) => void; previewing?: string | null;
}) {
  return (
    <div className="stage-options">
      {options.map((option) => {
        const id = `${task}-option-${option.id}`, change: Change = (value, language) => onChange(option.id, value, language);
        const Custom = OPTION_COMPONENTS[option.kind];
        if (Custom) return <Custom key={option.id} task={task} option={option} disabled={disabled} onChange={change} />;
        switch (option.kind) {
          case "language": return <LanguageSelect key={option.id} id={id} label={option.label} value={option.value} choices={option.choices} disabled={disabled} onChange={change} help={<FieldHelp id={option.id} />} />;
          case "text": return <TextField key={option.id} id={id} label={option.label} value={option.value} max={option.max} disabled={disabled} onChange={change} help={<FieldHelp id={option.id} />} />;
          case "range": return <RangeField key={option.id} id={id} label={option.label} value={option.value} min={option.min} max={option.max} step={option.step} disabled={disabled} onChange={change} help={<FieldHelp id={option.id} />} />;
          case "voice": return <VoicePicker key={option.id} id={id} option={option} disabled={disabled} onChange={change} onPreview={onPreview} previewing={previewing} help={<FieldHelp id={option.id} />} />;
          default: return null;
        }
      })}
    </div>
  );
}
