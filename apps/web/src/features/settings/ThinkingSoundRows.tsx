import { useEffect, useRef, useState } from "react";
import { Row } from "../../components/ui/Card";
import { Select } from "../../components/ui/Select";
import { Button } from "../../components/ui/Button";
import { ProgressBar } from "../../components/ui/ProgressBar";
import { RestoreIcon } from "../../components/ui/Icons";
import { Tooltip } from "../../components/ui/Tooltip";
import type { MessageKey, Translate } from "../../i18n/translator";
import { THINKING_SOUNDS, THINKING_SOUND_GAIN } from "../../services/thinking-sounds";
import { previewThinkingSound, type ThinkingSoundLoop } from "../../services/thinking-sound";

/* Settings → Call, under the thinking sound's when: which sound, how loud, and a try of it. Off ("No"), the rows stay in
 * view, disabled. The volume is an offset from the sound's own level (0 dB: as it is), with ↺ to bring it back, as a
 * shortcut's default is brought back. The try plays the sound for about TRY_SECONDS at its own cadence and the volume set,
 * in this page (services/thinking-sound.ts `previewThinkingSound`): another sound starts it again from the beginning,
 * another volume applies at once, and the sound turned off, the section left or Settings closed stop it. */

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

export interface ThinkingSoundRowsProps {
  t: Translate;
  sound: string;
  gainDb: number;
  /** The thinking sound is off: nothing to choose or try. */
  disabled: boolean;
  /** The section is shown: a try stops when it is not. */
  active: boolean;
  onChange(patch: { sound?: string; soundGainDb?: number }): void;
}

export function ThinkingSoundRows({ t, sound, gainDb, disabled, active, onChange }: ThinkingSoundRowsProps) {
  const restore = t("settings.call.volume.restore", { value: gainText(t, 0) });
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
    <ThinkingSoundTry t={t} sound={sound} gainDb={gainDb} disabled={disabled} active={active} />
  </>;
}

function ThinkingSoundTry({ t, sound, gainDb, disabled, active }: Omit<ThinkingSoundRowsProps, "onChange">) {
  // When the try that plays began, and how far it has got; null while none plays.
  const [began, setBegan] = useState<number | null>(null);
  const [now, setNow] = useState(0);
  const loop = useRef<ThinkingSoundLoop | null>(null);
  const latest = useRef({ sound, gainDb });
  const end = () => { loop.current?.stop(); loop.current = null; setBegan(null); };
  // From the press itself: a browser starts a page's audio only in a gesture.
  const begin = (choice: { sound: string; gainDb: number }) => {
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
  // Another sound while it plays: that one, from the start (the page's audio already runs, from the press).
  useEffect(() => {
    if (latest.current.sound === sound) return;
    latest.current.sound = sound;
    if (loop.current) begin({ sound, gainDb: latest.current.gainDb });
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
      <Button id="thinking-sound-try" variant="secondary" size="sm" disabled={disabled} onClick={() => (began === null ? begin({ sound, gainDb }) : end())}>
        {t(began === null ? "settings.call.soundTry.start" : "settings.call.soundTry.stop")}
      </Button>
      {began !== null && <>
        <ProgressBar value={elapsed / (TRY_SECONDS * 1000)} label={t("settings.call.soundTry.progress")} />
        <span className="thinking-sound-left" aria-hidden>{t("settings.call.soundTry.left", { seconds: left })}</span>
      </>}
    </span>
  </Row>;
}
