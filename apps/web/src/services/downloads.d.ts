export interface DownloadItem {
  id: string; label: string; task: 'stt' | 'tts'; kind: 'page' | 'native';
  state: 'running' | 'done' | 'failed' | 'cancelled'; done: number; total: number | null;
  bytes_per_s: number | null; eta_s: number | null; error: string; started: number; ended: number | null;
}
export function byteCounter(expected?: number): (event: Record<string, unknown>) => { done: number; total: number | null; bytes_per_s: number | null } | null;
export function createDownloads(options: {
  publish(items: DownloadItem[]): void; now?(): number; keepMs?: number; schedule?(fn: () => void, ms: number): unknown;
}): {
  start(item: { id: string; label: string; task: 'stt' | 'tts'; kind: 'page' | 'native'; total?: number | null; cancel?: (() => void) | null }): void;
  update(id: string, progress: { done?: number; total?: number | null; bytes_per_s?: number | null }): void;
  end(id: string, state: 'done' | 'failed' | 'cancelled', error?: string): void;
  cancel(id: string): boolean;
  running(id: string): boolean;
};
