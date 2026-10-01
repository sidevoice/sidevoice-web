import type { ComponentType } from "react";
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

export function LanguageSelect({ id, label, value, choices, disabled, onChange }: { id: string; label: string; value: string; choices: StageChoiceView[]; disabled?: boolean; onChange: (value: string) => void }) {
  return <label className="ui-field">{label}<NativeSelect id={id} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><Choices choices={choices} /></NativeSelect></label>;
}

export function TextField({ id, label, value, max, disabled, onChange }: { id: string; label: string; value: string; max: number; disabled?: boolean; onChange: (value: string) => void }) {
  return <label className="ui-field">{label}<textarea id={id} className="ui-text-field" rows={2} maxLength={max} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} /></label>;
}

export function RangeField({ id, label, value, min, max, step, disabled, onChange }: { id: string; label: string; value: number; min: number; max: number; step: number; disabled?: boolean; onChange: (value: number) => void }) {
  return (
    <label className="ui-field">
      {label} <output htmlFor={id}>{value.toFixed(2)}×</output>
      <input id={id} type="range" min={min} max={max} step={step} value={value} disabled={disabled} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

/** A voice per speech language, each with its preview. */
export function VoicePicker({ id, option, disabled, onChange, onPreview, previewing }: {
  id: string; option: Extract<StageOptionView, { kind: "voice" }>; disabled?: boolean; onChange: Change; onPreview?: (language: string) => void; previewing?: string | null;
}) {
  if (!option.perLanguage) {
    return <label className="ui-field">{option.label}<NativeSelect id={id} value={option.value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><Choices choices={option.choices} /></NativeSelect></label>;
  }
  return (
    <div className="voice-picker" id={id}>
      <span className="ui-field-label">{option.label}</span>
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
          case "language": return <LanguageSelect key={option.id} id={id} label={option.label} value={option.value} choices={option.choices} disabled={disabled} onChange={change} />;
          case "text": return <TextField key={option.id} id={id} label={option.label} value={option.value} max={option.max} disabled={disabled} onChange={change} />;
          case "range": return <RangeField key={option.id} id={id} label={option.label} value={option.value} min={option.min} max={option.max} step={option.step} disabled={disabled} onChange={change} />;
          case "voice": return <VoicePicker key={option.id} id={id} option={option} disabled={disabled} onChange={change} onPreview={onPreview} previewing={previewing} />;
          default: return null;
        }
      })}
    </div>
  );
}
