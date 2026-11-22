import { useEffect, useRef, useState } from "react";
import { Row } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { RestoreIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import type { MessageKey, Translate } from "../../i18n/translator";
import { uiLocale } from "../../i18n/locale";
import { THINKING_SOUNDS, THINKING_SOUND_GAIN, THINKING_SOUND_INTERVAL_SCALES, scaledInterval, thinkingSound, thinkingSoundIntervalScale } from "../../services/thinking-sounds";
import { previewThinkingSound, type ThinkingSoundLoop } from "../../services/thinking-sound";

/* Settings → Call, under the thinking sound's when: which sound, how loud, how often, and a try of it. Off ("No"), the rows
 * stay in view, disabled. The volume is an offset from the sound's own level (0 dB: as it is), and the frequency a factor on
 * the sound's own gaps between plays (1: its own cadence), read as the gaps it makes for the sound chosen ("every 7–10 s");
 * each with ↺ to bring it back, as a shortcut's default is brought back. The try plays the sound for about TRY_SECONDS at
 * the volume and frequency set, in this page (services/thinking-sound.ts `previewThinkingSound`): another sound starts it
 * again from the beginning, another volume or frequency applies at once, and the sound turned off, the section left or
 * Settings closed stop it. */

export const TRY_SECONDS = 15;
/** How often the try's countdown moves: only while it runs. */
const TICK_MS = 250;

/** A sound's name in the interface's language. */
export function thinkingSoundName(t: Translate, id: string): string {
  return t(`settings.call.sound.${id}` as MessageKey);
}

/** The offset as it reads: "+3 dB", "−6 dB" (a minus sign, not a hyphen), "0 dB". */
export function gainText(t: Translate, db: number): string {
  return t("settings.call.volume.value", { value: db > 0 ? `+${db}` : db < 0 ? `−${-db}` : "0" });
}

/** The gaps between plays of `sound` at the frequency `scale`, as they read: "every 7–10 s", "every 8.8–12.5 s" (seconds to
 *  a tenth at most, in the interface's language). */
export function frequencyText(t: Translate, sound: string, scale: number): string {
  const number = new Intl.NumberFormat(uiLocale(), { maximumFractionDigits: 1 });
  const [min, max] = scaledInterval(thinkingSound(sound), scale);
  return t("settings.call.frequency.value", { min: number.format(min), max: number.format(max) });
}

/** The frequency's steps as the slider has them: further right is more often. */
const SCALES = THINKING_SOUND_INTERVAL_SCALES;

export interface ThinkingSoundRowsProps {
  t: Translate;
  sound: string;
  gainDb: number;
  /** The frequency: a factor on the sound's own gaps between plays (1: its own cadence). */
  intervalScale: number;
  /** The thinking sound is off: nothing to choose or try. */
  disabled: boolean;
  /** The section is shown: a try stops when it is not. */
  active: boolean;
  onChange(patch: { sound?: string; soundGainDb?: number; soundIntervalScale?: number }): void;
}

export function ThinkingSoundRows({ t, sound, gainDb, intervalScale, disabled, active, onChange }: ThinkingSoundRowsProps) {
  const restore = t("settings.call.volume.restore", { value: gainText(t, 0) });
  const scale = thinkingSoundIntervalScale(intervalScale);
  const frequency = frequencyText(t, sound, scale);
  const restoreFrequency = t("settings.call.frequency.restore", { value: frequencyText(t, sound, 1) });
  return <>
    <Row label={t("settings.call.sound")} description={t("settings.call.sound.hint")} htmlFor="thinking-sound" disabled={disabled}>
      <Select id="thinking-sound" value={sound} disabled={disabled} onValueChange={(next) => onChange({ sound: next })}
        options={THINKING_SOUNDS.map((each) => ({ value: each.id, label: thinkingSoundName(t, each.id) }))} />
    </Row>
    <Row label={t("settings.call.volume")} description={t("settings.call.volume.hint")} htmlFor="thinking-sound-volume" disabled={disabled}>
      <span className="thinking-sound-volume">
        <input id="thinking-sound-volume" type="range" min={THINKING_SOUND_GAIN.min} max={THINKING_SOUND_GAIN.max} step={THINKING_SOUND_GAIN.step}
          value={gainDb} disabled={disabled} aria-valuetext={gainText(t, gainDb)} onChange={(event) => onChange({ soundGainDb: Number(event.target.value) })} />
        <output htmlFor="thinking-sound-volume">{gainText(t, gainDb)}</output>
        <Tooltip action content={restore}>
          <button type="button" id="thinking-sound-restore" className="ui-shortcut-restore thinking-sound-restore" aria-label={restore}
            disabled={disabled || gainDb === 0} onClick={() => onChange({ soundGainDb: 0 })}><RestoreIcon size={12} /></button>
        </Tooltip>
      </span>
    </Row>
    <Row label={t("settings.call.frequency")} description={t("settings.call.frequency.hint")} htmlFor="thinking-sound-frequency" disabled={disabled}>
      <span className="thinking-sound-frequency">
        <input id="thinking-sound-frequency" type="range" min={0} max={SCALES.length - 1} step={1} value={SCALES.indexOf(scale)} disabled={disabled}
          aria-valuetext={frequency} onChange={(event) => onChange({ soundIntervalScale: SCALES[Number(event.target.value)] ?? 1 })} />
        <output htmlFor="thinking-sound-frequency">{frequency}</output>
        <Tooltip action content={restoreFrequency}>
          <button type="button" id="thinking-sound-frequency-restore" className="ui-shortcut-restore thinking-sound-restore" aria-label={restoreFrequency}
            disabled={disabled || scale === 1} onClick={() => onChange({ soundIntervalScale: 1 })}><RestoreIcon size={12} /></button>
        </Tooltip>
      </span>
    </Row>
    <ThinkingSoundTry t={t} sound={sound} gainDb={gainDb} intervalScale={scale} disabled={disabled} active={active} />
  </>;
}

function ThinkingSoundTry({ t, sound, gainDb, intervalScale, disabled, active }: Omit<ThinkingSoundRowsProps, "onChange">) {
  // When the try that plays began, and how far it has got; null while none plays.
  const [began, setBegan] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const loop = useRef<ThinkingSoundLoop | null>(null);
  const latest = useRef({ sound, gainDb, intervalScale });
  const end = () => { loop.current?.stop(); loop.current = null; setBegan(null); };
  // From the press itself: a browser starts a page's audio only in a gesture.
  const begin = (choice: { sound: string; gainDb: number; intervalScale: number }) => {
    loop.current?.stop();
    loop.current = previewThinkingSound(choice);
    const at = performance.now();
    setBegan(at);
    setNow(at);
  };
  useEffect(() => {
    latest.current.gainDb = gainDb;
    loop.current?.setGain(gainDb);
  }, [gainDb]);
  useEffect(() => {
    latest.current.intervalScale = intervalScale;
    loop.current?.setIntervalScale(intervalScale);
  }, [intervalScale]);
  // Another sound while it plays: that one, from the start (the page's audio already runs, from the press).
  useEffect(() => {
    if (latest.current.sound === sound) return;
    latest.current.sound = sound;
    if (loop.current) begin({ ...latest.current });
  }, [sound]);
  useEffect(() => { if ((disabled || !active) && loop.current) end(); }, [disabled, active]);
  useEffect(() => () => { loop.current?.stop(); loop.current = null; }, []);
  useEffect(() => {
    if (began === null) return;
    const tick = setInterval(() => {
      const at = performance.now();
      if (at - began >= TRY_SECONDS * 1000) end(); else setNow(at);
    }, TICK_MS);
    return () => clearInterval(tick);
  }, [began]);
  const elapsed = began === null ? 0 : Math.min(TRY_SECONDS * 1000, now - began);
  const left = Math.max(0, Math.ceil((TRY_SECONDS * 1000 - elapsed) / 1000));
  return <Row label={t("settings.call.soundTry")} description={t("settings.call.soundTry.hint", { seconds: TRY_SECONDS })} disabled={disabled}>
    <span className="thinking-sound-try">
      <Button id="thinking-sound-try" variant="secondary" size="sm" disabled={disabled} onClick={() => (began === null ? begin({ sound, gainDb, intervalScale }) : end())}>
        {t(began === null ? "settings.call.soundTry.start" : "settings.call.soundTry.stop")}
      </Button>
      {began !== null && <>
        <ProgressBar value={elapsed / (TRY_SECONDS * 1000)} label={t("settings.call.soundTry.progress")} />
        <span className="thinking-sound-left" aria-hidden>{t("settings.call.soundTry.left", { seconds: left })}</span>
      </>}
    </span>
  </Row>;
}
