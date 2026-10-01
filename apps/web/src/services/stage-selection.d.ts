import type { CheckProgress, CheckResult, CheckStep, Refusal } from './load-and-verify.js';
export type Stage = { place: string; model: string; options?: Record<string, unknown>; build?: { engine: string; accelerator: string } | null };
export type StageCheck =
  | { phase: 'consent'; stage: Stage; size: number }
  | { phase: 'running'; stage: Stage; progress: CheckProgress; recheck?: boolean }
  | { phase: 'slow'; stage: Stage; result: CheckResult }
  | { phase: 'failed'; stage: Stage; step: CheckStep; reason?: Refusal; result?: CheckResult; recheck?: boolean }
  | { phase: 'done'; stage: Stage; result: CheckResult; recheck?: boolean };
export interface StageSelection {
  select(task: 'stt' | 'tts', stage: Stage, options?: { recheck?: boolean }): Promise<void>;
  decide(task: 'stt' | 'tts', yes: boolean): void;
  cancel(task: 'stt' | 'tts'): void;
  dismiss(task: 'stt' | 'tts'): void;
  busy(task: 'stt' | 'tts'): boolean;
}
export function createStageSelection(hooks: {
  publish(task: 'stt' | 'tts', check: StageCheck | null): void;
  consent(task: 'stt' | 'tts', stage: Stage): Promise<{ size: number } | null>;
  verify(task: 'stt' | 'tts', stage: Stage, options: { signal: AbortSignal; onProgress(progress: CheckProgress): void }): Promise<CheckResult>;
  activate(task: 'stt' | 'tts', stage: Stage, result: CheckResult): Promise<void> | void;
  discard(task: 'stt' | 'tts', stage: Stage, result: CheckResult | null): void;
}): StageSelection;
