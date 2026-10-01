/* The first-run wizard's path and where it resumes (ONBOARDING_AND_HOSTS.md §5.1, F1, F2).
 *
 * Two paths: agents on this computer (W1 → W2 → W3 → W4 → W5 → W6) and a remote host (W1 → W2′ → W4 → W5 → W6).
 * Closing is «Lo haré luego»; resuming starts at the first step whose outcome is not durable — the local host
 * paired, the agents step done, stages set for the host, the test passed. Pure. */
import type { OnboardingState } from "../../services/desktop-host";

export type Step = "W1" | "W2" | "W2r" | "W3" | "W4" | "W5" | "W6";
export type Path = "agents" | "remote";

export interface ResumeFacts {
  onboarding: OnboardingState | null;
  /** The local host is paired and running (W2's outcome). */
  localReady: boolean;
  /** A remote host is paired (W2′'s outcome). */
  remoteReady: boolean;
  /** Both stages have a choice for the host in use. */
  stagesSet: boolean;
  /** This platform can host agents (§1 O2); elsewhere W1 is skipped onto the remote path. */
  canHostAgents: boolean;
}

export function pathOf(facts: Pick<ResumeFacts, "onboarding" | "canHostAgents">): Path | null {
  if (!facts.canHostAgents) return "remote";
  return facts.onboarding?.choice === "agents" ? "agents" : facts.onboarding?.choice === "remote" ? "remote" : null;
}

export function resumeStep(facts: ResumeFacts): Step {
  const path = pathOf(facts);
  const o = facts.onboarding ?? {};
  if (!path) return facts.localReady ? "W3" : "W1"; // an `npx` core already running: straight to its agents (F1)
  if (path === "agents") {
    if (!facts.localReady) return "W2";
    if (!o.agents_done) return "W3";
  } else if (!facts.remoteReady) return "W2r";
  if (!facts.stagesSet) return "W4";
  if (!o.test_passed) return "W5";
  return "W6";
}

/** The indicator's groups, in order, with the steps each one covers: the same four on both paths (operator,
 *  2026-10-01), so going back always lands on the same places. On the remote path «Agentes» is connecting to the machine
 *  where the agents are. */
export function stepGroups(_path: Path | null): { key: string; steps: Step[] }[] {
  return [
    { key: "wizard.group.where", steps: ["W1", "W2"] },
    { key: "wizard.group.agents", steps: ["W3", "W2r"] },
    { key: "wizard.group.voice", steps: ["W4"] },
    { key: "wizard.group.test", steps: ["W5", "W6"] },
  ];
}

/** Whether the app opens the wizard by itself: first run (no onboarding record) on a computer with no host yet. A
 *  deferred or finished onboarding never reopens it; the no-machine screen offers «Continuar la configuración». */
export function opensByItself(onboarding: OnboardingState | null, inApp: boolean, hasHost: boolean, localReady: boolean): boolean {
  if (!inApp || onboarding?.deferred_at || onboarding?.completed_at) return false;
  return !onboarding && (!hasHost || localReady);
}

export function previousStep(step: Step, path: Path | null): Step | null {
  const order: Step[] = path === "remote" ? ["W1", "W2r", "W4", "W5", "W6"] : ["W1", "W2", "W3", "W4", "W5", "W6"];
  const at = order.indexOf(step);
  // W2 is an action, not a choice: «Atrás» from the agents step goes to the question, not to the install.
  if (step === "W3") return "W1";
  return at > 0 ? order[at - 1] : null;
}
