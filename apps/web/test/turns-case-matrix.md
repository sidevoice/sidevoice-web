# Conversation flow web boundary

The controller tests exercise core frames in producer order: each conversation's call emits its own `turn.started` before the barge-in outcome of that call's say handle; core acknowledges a start before it accepts or refuses it. The room fixture exposes epochs through participants and start responses, not the presentation binding.

| Core case | Web boundary evidence |
| --- | --- |
| T01 | Played-zero interruption, empty terminal and words terminal. Nothing is retired at a turn start, and what waits in the page queue is held from the start until the room acknowledges the turn's end. A reply the voice holds over a turn resumes after a terminal with no words (empty, cancelled or merged), which goes at once with nothing reported of the pause; every later reply plays after it, in order, once the end is acknowledged. Words wait for the held reply's barge-in end; the room's withdrawal, which it sends ahead of acknowledging the words, is the only thing that drops a queued reply (sidevoice-core#248) |
| T02a/b | Open-turn, delayed-ack and unacknowledged-end gates; ack → refusal → cancelled → fresh reply |
| T03 | An older epoch alone plays; a reply the room withdrew is never handed to the voice; higher epoch reply held for a second device's participant fact |
| T04a/b | Same-epoch FIFO and Skip; several queued replies dropped by the room's withdrawal, fresh new-epoch reply admitted |
| T05 | Checkpoint cut ahead of the final words; the queued successor dropped by the room's withdrawal; a manual replay, which the room never withdraws by epoch, plays after them |
| T06a/b/c | Output mute, output loss, voice off/on, written unheard reply; microphone independent. Core-retained unheard rows survive both web history caps. A and B have separate calls: A's pending STT and merge hold finish on A at its normal end of turn while B takes new speech. Recorded inactive/disconnected admission reasons are explained. |
| T06d/e | Return and globally heard participant/history reconciliation; note rows omitted from the transcript. A manually heard text-only row loses its current not-played mark. Core owns the five-second notice scheduling. |
| T07 | Delayed handle settlement after hang-up and new call; offline words on replacement session. An older core-retained unheard row remains in the transcript and session cache. |
| T08 | Typed context during playback and while a spoken turn and new reply are open. |
| T09/T10 | Voice package owns physical barge-in threshold and echo classification. Web tests the emitted events. |
| T11 | The source call's captured thread and binding route A/B terminal words independently through web core frames, including a delayed A start after B is selected; monotonic epoch, reversed history/participant responses, and in-flight receipt. |
| T12 | Explicit Skip, FIFO successor, and withdrawal race. |
| T13 | Microphone mute (mirrored to every call) and focus-away (input routed to another call) both leave an already captured turn to finish normally. |
| T14 | Scalar partial/unknown marks, skip extent, cross-device full-hearing clearance, and manual full-hearing mark clearance without changing the historical text-only status. |
| T15 | Working facts and the existing three-second display clock. |
| T16 | Connector/core own agent delivery; web renders the authoritative history and notices. |

T02c/d queue admission and notice construction belong to core. A Chromium test drives the candidate browser `createVoiceHost` through a spoken reply and verifies its scalar progress and one terminal outcome. The browser host wrapper test checks that device-loss notices cross `VoiceHost.onAudioDevices`; controller tests check the shared callback's report and mute behavior through a desktop-shaped host. Physical browser and native audio behavior remains a Turn Lab release gate.
