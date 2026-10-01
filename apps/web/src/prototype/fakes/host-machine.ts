/* PROTOTYPE ONLY — what a paired machine (the NUC) says it can run when it is the place a stage runs at
 * (sidevoice/sidevoice-core#21, D7: the host computes its own offers and sends them). A Linux box with an NVIDIA card:
 * its own engines, its own downloads, nothing to do with this device's. */
export const HOST_OFFERS = [
  { model: "whisper-large-v3-turbo", task: "stt", engine: "faster-whisper", accelerator: "cuda", download_size: 1_620_000_000, reason: "faster-whisper (cuda): the host's GPU", alternatives: [] },
  { model: "whisper-small", task: "stt", engine: "faster-whisper", accelerator: "cuda", download_size: 484_000_000, reason: "faster-whisper (cuda): the host's GPU", alternatives: [] },
  { model: "kokoro-82m-v1.0", task: "tts", engine: "kokoro", accelerator: "cuda", download_size: 327_000_000, reason: "kokoro (cuda): the host's GPU", alternatives: [] },
];

/** What the machine already has on disk (model ids). */
export function createHostDisk(seed: string[] = []) { return new Set(seed); }
