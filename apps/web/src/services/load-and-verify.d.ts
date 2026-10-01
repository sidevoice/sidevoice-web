export type CheckStep = 'download' | 'load' | 'check' | 'key' | 'host' | 'apply' | 'done';
export interface Refusal { key: string; message: string; [param: string]: unknown }
export interface CheckProgress { step: CheckStep; done?: number; total?: number | null; pass?: number; passes?: number }
export interface CheckPass { latency_ms?: number; text?: string; first_audio_ms?: number; total_ms?: number; audio_seconds?: number; realtime?: number | null }
/** A worker of the engines' message protocol (stt-worker.js, worker.js, native-worker.js). */
export interface ProtocolWorker {
  postMessage(message: unknown, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: any }) => void) | null;
  onerror: ((event: { message?: string }) => void) | null;
}
export interface CheckResult {
  ok: boolean; step: CheckStep; reason?: Refusal; cancelled?: boolean; passes: CheckPass[];
  worker?: ProtocolWorker; runtime?: Record<string, unknown>; loaded?: boolean; load_ms?: number | null;
  latency_ms?: number; slow?: boolean; language?: string; voice?: string;
}
export interface DeviceBuild { model: string; engine: string; accelerator: string; native: boolean; fallback?: string }
export function verifyDevice(options: {
  task: 'stt' | 'tts'; build: DeviceBuild; open(native: boolean): ProtocolWorker; fetchClip(url: string): Promise<ArrayBuffer>;
  language?: string; voice?: string; speed?: number; expected?: number; download?: boolean; onProgress?(progress: CheckProgress): void; signal?: AbortSignal;
}): Promise<CheckResult>;
export function verifyProvider(options: {
  task: 'stt' | 'tts'; stage: { place: string; model: string; options?: Record<string, unknown> }; language?: string;
  request(path: string, init: RequestInit): Promise<Response>; signal?: AbortSignal;
}): Promise<CheckResult>;
