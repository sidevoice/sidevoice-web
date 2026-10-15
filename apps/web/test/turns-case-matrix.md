# Conversation flow web boundary

The controller tests exercise core frames in producer order: the voice emits `turn.started` before `agent-interrupted`; core acknowledges a start before it accepts or refuses it. The room fixture exposes epochs through participants and start responses, not the presentation binding.

| Core case | Web boundary evidence |
| --- | --- |
| T01 | Played-zero interruption, empty terminal and words terminal, including queued receipts before the final frame. |
| T02a/b | Open-turn and delayed-ack gates; ack → refusal → cancelled → fresh reply. |
| T03 | Older reply discarded; higher epoch reply held for a second device's participant fact. |
| T04a/b | Same-epoch FIFO and Skip; multiple old replies retired, fresh new-epoch reply admitted. |
| T05 | Checkpoint cut with queued successors and manual replay retired before final words. |
| T06a/b/c | Output mute, output loss, voice off/on, written unheard reply; microphone independent. |
| T06d/e | Return and globally heard participant/history reconciliation; note rows omitted from the transcript. Core owns the five-second notice scheduling. |
| T07 | Delayed handle settlement after hang-up and new call; offline words on replacement session. |
| T08 | Typed context during playback and while a spoken turn and new reply are open. |
| T09/T10 | Voice package owns physical barge-in threshold and echo classification. Web tests the emitted events. |
| T11 | Captured focus, monotonic epoch, reversed history/participant responses, and in-flight receipt. |
| T12 | Explicit Skip, FIFO successor, and withdrawal race. |
| T13 | Microphone mute leaves an already captured turn to finish. |
| T14 | Scalar partial/unknown marks, skip extent, cross-device full-hearing clearance. |
| T15 | Working facts and the existing three-second display clock. |
| T16 | Connector/core own agent delivery; web renders the authoritative history and notices. |

T02c/d queue admission and notice construction belong to core. A Chromium test drives the candidate browser `createVoiceHost` through a spoken reply and verifies its scalar progress and one terminal outcome. The browser host wrapper test checks that device-loss notices cross `VoiceHost.onAudioDevices`; controller tests check the shared callback's report and mute behavior through a desktop-shaped host. Physical browser and native audio behavior remains a Turn Lab release gate.
