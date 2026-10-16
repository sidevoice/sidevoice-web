/* How the first-run setup frames the room (operator, 2026-10-16: mandatory but skippable). The room stays behind the
 * setup until it is done, and the setup opens again if closed; each step that needs something has its "Continue
 * without …"; Ready always enters, and the call area then says what is missing, one thing at a time. */

/** The voice's models as the call needs them: unknown until the catalogue is read (nothing is claimed, nothing flashes). */
export type VoiceReadiness = "ready" | "missing" | "unknown";

/** What the call area shows: no machine, the voice's models, nothing yet (not known), or the stage. The microphone
 *  not allowed keeps the stage and holds the call button back instead (operator, 2026-10-16). */
export type CallWaiting = "machine" | "voice" | "unknown" | null;

/** The room's frame for the setup as it stands: whether the room is kept behind the setup, what the call's own space
 *  waits on, and whether the conversations (and New) are held back. */
export function callArea(facts: { ready: boolean; done: boolean; noMachine: boolean; voice: VoiceReadiness }) {
  const { ready, done, noMachine, voice } = facts;
  // No machine, then the voice's models, one at a time; the conversations whenever a machine is there.
  // Not known yet, nothing is claimed: before the setup is done the space stays empty rather than flash the stage then the
  // card; once it is done the stage stays (its models were ready), and a card replaces it only once one is known missing.
  const waiting: CallWaiting = noMachine ? "machine" : voice === "missing" ? "voice" : voice === "unknown" && !done ? "unknown" : null;
  return { roomHidden: !ready || !done, waiting, blocked: noMachine };
}
