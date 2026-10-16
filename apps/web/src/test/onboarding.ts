import { ONBOARDING_STORAGE_KEY } from "../services/onboarding-state";

/** This device as one whose first setup is finished: the room renders instead of the setup wizard. */
export function markSetUp() {
  localStorage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify({ version: 1, choice: "remote", agents_done: false, completed_at: 1, trials: {}, baseline_release: 2 }));
}
