# Message delivery: what each hop guarantees

Requirement (web#534): everything the person says reaches the agent, **all of it, in the order said**, retried until it
arrives, and a newer message never overtakes an older undelivered one. Example: two messages said in a garage with no
signal arrive in order once the signal is back.

This is the state after web#552 and #555, sidevoice-core#238 and sidevoice-connector#332. Each hop is its own repository;
none of them is released by this document.

## The retry schedule: fast at first, then steady

Every hop that retries uses the same shape: **1 s, 2 s, 5 s, 10 s, then every 15 s** for as long as the message is
unacknowledged and the link is up. A new connection sends at once and starts the count again. One constant per hop:

| Hop | Constant | Where |
|---|---|---|
| page | `RESEND_BACKOFF_MS` (and `resendDelay`, also used by the text retry) | `apps/web/src/services/outbox.js` |
| core | `RETRY_SECONDS` | `rust/control/room/push.rs` |
| connector | none: the connector never retries by itself, it answers the core's offers | |

Load: one idempotent resend per waiting message every 15 s is trivial for the machine (a message of a conversation
waits behind the first, so a thread sends one at a time). No jitter is added; it could be (about 20%) without changing
any guarantee.

## The three hops

| Hop | Sender | Receiver | "Acknowledged" means | Who retries |
|---|---|---|---|---|
| 1. page to machine | the page's outbox (`outbox.js`) | core's call session over one WebSocket | `voice-ack` with the `client_msg_id`, sent after the message is applied and kept (or was already taken). "The room has it", not "the agent has it". | the page |
| 2. machine to agent session | core's journal (`push.rs`, `pull.rs`) | the connector, then the harness | push: the connector answers `accepted`. Pull: the agent fetched it (`delivered`) and acknowledged it (`read`). | core |
| 3. connector to harness | the connector (`daemon.rs`, `deliver`) | Claude, Codex, Cursor, HTTP | adapter-specific; `unknown` is "handed over, no acknowledgement". | the core's offers; the connector remembers what it handed over |

The person sees one mark per row, driven by core's receipts: pending, sending, delivered, read, unconfirmed, not sent.

## Hop 1: page to machine

- Every turn message and every report is an outbox entry keyed by `client_msg_id`, kept in IndexedDB per tab (memory
  only where there is none) and ordered by a single increasing `order`. The highest `order` is also kept in
  `localStorage`, so an entry made while the store loads has its final place at once and is stored as soon as the
  database is open.
- Nothing is sent before the outbox is back from the load, so a message said now never passes one kept before a reload.
- An unacknowledged entry is said again on the same socket on the schedule above, **from the oldest unacknowledged one on, in
  order**; a new socket sends the whole outbox at once. Core takes each `client_msg_id` once (it remembers 256 per
  device), so a resend is acknowledged, not applied twice.
- Texts (HTTP, one message id each) and turns (socket) share one order: a turn said after a text waits until the
  text is taken, and a text written after an unacknowledged turn waits for its acknowledgement. A text posted straight
  to the room counts as a text ahead meanwhile; one that hangs is aborted after 30 s and queued under the same id.
- Nothing is dropped to make room: past 2000 entries the **newest** is refused (a text shows `not_sent`; anything else is
  reported to the machine's client-error log). No older message is let go, so none can arrive after a later one.
- A hang-up, a refusal of the browser or a move lets go of what was never acknowledged, and the rows of the turns it
  lets go of are marked `not_sent` like a text's bubble. A network loss alone does not end the call: reconnection insists
  for as long as it takes (1 s, 2 s, then every 5 s).

## Hop 2: machine to agent session

- The journal holds the person's input per thread, oldest first. `pending_delivery` offers a conversation's **first
  unresolved message only** (failed and backing off, in flight, or waiting), so nothing later is offered while an earlier
  one waits; a pull does not claim past a message still being pushed.
- **No deadline.** Input no longer becomes `not_sent` after 10 s. A limit exists only if a deployment sets
  `VOICE_INPUT_TTL_SECONDS`. A message waits for its agent however long the harness is busy, closed or unreachable.
- Retries follow the schedule above (`RETRY_SECONDS`).
- **It survives a core restart.** The input still waiting (pending, sending, or pulled and not acknowledged), and the notes that
  wait in the same order, are written to `pending-input.json` in the private directory in the same step that changes them, and
  restored as pending, in order, with the conversation's epoch and the journal's sequence number, when the core starts.
  A record that cannot be written does not stop delivery; the pump rewrites it every 250 ms until it can.
- `unknown` from a harness is still final in the core (`unconfirmed`): re-offering would type the message again into a
  harness that never confirms.

## Hop 3: connector to harness

- One delivery at a time per conversation (the binding's `serial` lock), so order holds inside the connector.
- A message the connector already handed to a harness is remembered per thread (`delivered.json`: ids and a status, never
  the words), also across a restart: offered again, it is answered as before and not typed in again. A hand-over that failed
  (an unreachable harness) is not remembered, so the core's retry hands it over.
- An `unknown` answer waits 8 s for the transcript to show the message read (`input.read`); read in time it becomes
  `accepted`. Otherwise it stays `unknown`.

## Guarantees

1. **FIFO with head-of-line blocking per conversation, at every hop**: an undelivered message holds every later one of its
   conversation; time alone never turns it into "not sent".
2. **Idempotent ids end to end**: `client_msg_id` (page to core), `message_id` (core to connector and harness). A resend is
   acknowledged, never applied twice; the connector does not type a handed-over message again.
3. **A steady schedule, not only on reconnection**, at the page and at the core.
4. **Kept across restarts of each hop**: the page's outbox (IndexedDB), the core's waiting input (`pending-input.json`), the
   connector's handed-over ids (`delivered.json`).

## Known limits

- A crash between a hand-over and its record (connector), or between a message accepted by the agent and the core's next
  write of its record, offers that message once more: at-least-once, never zero.
- The core's `client_msg_id` memory is in memory: after a restart, a page's resend of something it never saw acknowledged is a
  new message.
- A turn's `started` that the room refused (`room.turns_full`) is said again as a new message and can be passed by a later
  turn's start; the relay's state for a held start is kept for 512 turns.
- Core writes its record under the room lock; a stalled disk stalls the room.
- A message the harness lost after an `unknown` answer is not retried by anyone.
- Several devices on one conversation have no cross-device "said" order; the journal orders by arrival.
