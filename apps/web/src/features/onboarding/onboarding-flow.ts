import { useVariant } from "../../lib/variants";

/* How the first-run setup behaves, as the `onboardingFlow` variant the operator compares in the playground preview
 * (2026-10-16). This file is the one place that decides it: the setup's provider, the wizard and the room read these
 * rules and never the variant's letter.
 *
 * - b, readiness-driven (default): "Later" closes the setup for good; the setup is done as soon as a machine answers
 *   and the voice's models are ready, whatever route got there; the call area says what is missing, one at a time.
 * - a, mandatory: no "Later"; every step answered, resumed where it stood; the room only once it is finished.
 * - c, today's: "Later" leaves a "setup pending" card in the call area until the setup is finished.
 * - d, mandatory but skippable: no "Later", but each step that needs something has its "Continue without …"; Ready
 *   always enters, and the call area then says what is missing, as b's does. */

export const ONBOARDING_FLOWS = ["b", "a", "c", "d"] as const;
export type OnboardingFlow = (typeof ONBOARDING_FLOWS)[number];

export interface FlowRules {
  /** "Later" (and Escape) put the setup off. */
  canDefer: boolean;
  /** Put off, the setup writes the release it was put off on, so What's new does not list everything. */
  deferBaseline: boolean;
  /** Done as soon as the readiness facts hold (a machine answers, the required models are ready), by any route. */
  autoComplete: boolean;
  /** Resume counts the machine and models as they are now, set up in Settings or not. */
  liveResume: boolean;
  /** The room stays behind the setup until it is done; the setup opens again if closed. */
  mandatory: boolean;
  /** The steps offer "Continue without …", kept in the record; Ready completes the setup on arrival and always enters. */
  skips: boolean;
  /** The call area waits on what is missing (no machine, then the voice's models), not on the setup itself. */
  readiness: boolean;
  /** The call area's waiting cards offer "Continue setup" while the setup is not done. */
  continueLink: boolean;
  /** A setup put off leaves its "setup pending" card in the call area. */
  pendingCard: boolean;
}

export const FLOW_RULES: Record<OnboardingFlow, FlowRules> = {
  a: { canDefer: false, deferBaseline: false, autoComplete: false, liveResume: false, mandatory: true, skips: false, readiness: false, continueLink: false, pendingCard: false },
  b: { canDefer: true, deferBaseline: true, autoComplete: true, liveResume: true, mandatory: false, skips: false, readiness: true, continueLink: true, pendingCard: false },
  c: { canDefer: true, deferBaseline: false, autoComplete: false, liveResume: false, mandatory: false, skips: false, readiness: false, continueLink: false, pendingCard: true },
  d: { canDefer: false, deferBaseline: false, autoComplete: false, liveResume: false, mandatory: true, skips: true, readiness: true, continueLink: false, pendingCard: false },
};

export function useOnboardingFlow(): { flow: OnboardingFlow; rules: FlowRules } {
  const flow = useVariant("onboardingFlow", ONBOARDING_FLOWS);
  return { flow, rules: FLOW_RULES[flow] };
}

/** The voice's models as the call needs them: unknown until the catalogue is read (nothing is claimed, nothing flashes). */
export type VoiceReadiness = "ready" | "missing" | "unknown";

/** What the call area shows: the setup put off (c), no machine, the voice's models, nothing yet (not known), or the stage. */
export type CallWaiting = "pending" | "machine" | "voice" | "unknown" | null;

/** The room's frame for the setup as it stands: whether the room is kept behind the setup, what the call's own space
 *  waits on, and whether the conversations (and New) are held back. */
export function callArea(rules: FlowRules, facts: { ready: boolean; open: boolean; done: boolean; noMachine: boolean; voice: VoiceReadiness }) {
  const { ready, open, done, noMachine, voice } = facts;
  if (rules.mandatory && !rules.readiness) return { roomHidden: !ready || !done, waiting: (noMachine ? "machine" : null) as CallWaiting, blocked: noMachine };
  if (rules.pendingCard) {
    const pending = !ready || !done;
    const waiting: CallWaiting = pending && ready ? "pending" : noMachine ? "machine" : null;
    return { roomHidden: !ready || (pending && open), waiting, blocked: (pending && ready) || noMachine };
  }
  // Readiness: no machine, then the voice's models, one at a time; the conversations whenever a machine is there.
  // Not known yet, nothing is claimed: before the setup is done the space stays empty rather than flash the stage then the
  // card; once it is done the stage stays (its models were ready), and a card replaces it only once one is known missing.
  const waiting: CallWaiting = noMachine ? "machine" : voice === "missing" ? "voice" : voice === "unknown" && !done ? "unknown" : null;
  const roomHidden = !ready || (rules.mandatory ? !done : !done && open);
  return { roomHidden, waiting, blocked: noMachine };
}
