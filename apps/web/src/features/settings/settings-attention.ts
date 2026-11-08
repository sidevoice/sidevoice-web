import { useOnboardingIfAny } from "../onboarding/onboarding-context";
import { useVoiceModels } from "../call/VoiceModels";

/** Whether something in Settings needs the person (operator, 2026-10-16): the microphone not allowed, or a voice model in
 *  use that needs something (a download, a key). The gear wears the warning dot then, and says so in its name. A model
 *  only chosen in Settings, not in use yet, is not a problem. */
export function useSettingsAttention(): boolean {
  const microphoneReady = useOnboardingIfAny()?.microphone?.ready ?? true;
  const { attention } = useVoiceModels();
  return !microphoneReady || attention;
}
