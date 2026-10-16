/** A chosen device that went away is forgotten, so the system's default is used; the call keeps speaking. */
export function withoutLost(kept: Record<string, unknown>, lost?: {input?: string; output?: string} | null) {
  const next = {...kept};
  if (lost?.input) delete next.input;
  if (lost?.output) delete next.output;
  return next;
}
