export const OUTBOX_LIMIT: number;
export interface OutboxEntry {
  id: string; kind: 'user-turn' | 'playback'; session_id: string | null; node: string | null;
  payload: unknown; created: number; order: number;
}
export interface Outbox {
  ready: Promise<void>;
  add(entry: { id: string; kind: OutboxEntry['kind']; session_id?: string | null; node?: string | null; payload: unknown }): OutboxEntry;
  remove(id: string): boolean;
  get(id: string): OutboxEntry | null;
  list(): OutboxEntry[];
  clear(which?: (entry: OutboxEntry) => boolean): void;
  readonly size: number;
}
export function createOutbox(options?: {
  scope?: string; indexedDB?: IDBFactory | null; now?(): number; limit?: number;
}): Outbox;
