# Message delivery: what each hop guarantees

Requirement (web#534): everything the person says reaches the agent, **all of it, in the order said**, with retries spaced by
**exponential backoff**, and a newer message never overtakes an older undelivered one. Example: two messages said in a garage
with no signal arrive in order once the signal is back.

Line numbers refer to `sidevoice-web`, `sidevoice-core` and `sidevoice-connector` at the `main` of 2026-11-07.

## The three hops

| Hop | Sender | Receiver | "Acknowledged" means | Who retries |
|---|---|---|---|---|
| 1. page to machine | the page's outbox (`outbox.js`) | core's call session over one WebSocket | `voice-ack` carrying the `client_msg_id` (`session.rs:311`). Sent after the message is applied, or when it was already taken (`once`, `client_frames.rs:42`). It says "the room has it", not "the agent has it". | the page |
| 2. machine to agent session | core's room journal (`push.rs`, `pull.rs`) | the connector, then the harness | push: the connector answers `accepted` (`settle_delivery`, `push.rs:85`). Pull: the agent fetched it with `get_messages` (state `delivered`), and acked it with `ack_ids` (state `read`). | core |
| 3. connector to harness | the connector (`daemon.rs:884`) | Claude, Codex, Cursor, HTTP | adapter-specific. A Claude inbox that keeps the connection open gives no answer in 1.5 s, which is `unknown` (`claude.rs:326`) and later `unconfirmed`. | nobody |

The person sees one mark per row, driven by core's receipts: pending, sending, delivered, read, unconfirmed, not sent
(`room-session-state.js:329`).

## Hop 1: page to machine

**Today.** Every turn message and every report on a reply is an entry in the outbox, keyed by `client_msg_id`: kept in
IndexedDB per tab (in memory only where there is none, a private window say, and then not across a reload), ordered by (created, order),
bounded at 200 (past it the **oldest entry is deleted**, `outbox.js:29`), never expired by time. Core remembers the last 256 ids per
device (`resume.rs:23`), so a resend is acknowledged and not applied twice. Texts take a different path (HTTP POST to
`/api/presentation/text`, one at a time, stopping at the first failure, `flushTexts`).

**When it retries.** Only when the socket changes: `flushOutbox` skips an entry already `sentOn` the current socket
(`room-session-controller.js:672`), and sends the outbox again on each new socket (`:2094`, `:2503`); the pass skips texts, and lets go of entries for another machine or
for a session the room no longer has. Reconnection
itself retries at 1 s, 2 s, then every 5 s (`RECONNECT_DELAYS_MS`, `:2414`), each attempt with a 35 s deadline. So an entry
sent on a socket that is half-dead (no close event yet), or one whose ack was lost, waits for the socket to be declared dead.
There is no timer on the entry.

**Where the order can break.**
- The page pipelines the non-text outbox on one socket and trusts TCP order; a resend after a new socket is also in order.
  Not safe across a reload: sending is not gated on `outbox.ready` (`:654`, `:660`), so a message said while IndexedDB is still
  loading can go before an older one the store is about to give back, and with a timestamp tie it can sort before it.
- A turn's `started` belongs to the session that sent it. If the room replaced the session, the stale start is dropped
  and the turn's words go as "words said while away" (`turn-relay.js`, `offline` rows). Those rows are created in the
  journal when they **arrive**, not when they were said (`input.rs:110`), so they sort by arrival. With the FIFO outbox
  that equals the order said, but another device's message can slot between.
- A start refused with `room.turns_full` is held, and its words wait. It is said again as a **new** message after another
  turn ends, so a later turn's start can overtake the held one (`turn-relay.js` header; `flushOutbox` `route.hold`). The relay keeps only the
  last 64 of each of `sent`, `starts`, `held` and `ends` (`turn-relay.js:16`, `:23`): past that a held turn is evicted and its
  start and words can no longer be said again.
- Texts and turns are two queues with no order between them. A text queued while offline can go before or after a turn said
  earlier.
- `disconnect()` calls `outbox.clear()` (`:2213`), without marking the rows of the cleared turns not sent (only queued texts get that mark
  in `failTexts`), so a voice turn's row can stay pending for ever: a hang-up, a refusal of the browser, or a move of the call drops what was never
  acknowledged. A network loss alone does not end the call: reconnection insists for as long as it takes. Moving the conversation to another machine drains for a short time and then drops the rest (`drainOutbox`).
  A reload keeps the outbox, but it is sent only once a call reaches a session again.

## Hop 2: machine to agent session

**Today.** Core's journal holds the input per thread. `pending_delivery` (`push.rs:46`) goes oldest first and inserts each
thread into `blocked` on its first unresolved row, so a thread's later rows never go before its first one, whether that
one is waiting for its retry time, in flight, or on a busy binding: head-of-line blocking per thread. Failed pushes retry
after 2, 5, 15, then 60 s (`RETRY_SECONDS`, `push.rs:15`), and a push answer has a 60 s timeout (`ACK_TIMEOUT`).
Pull (`pull.rs`) returns the thread's rows in journal order, 32 to a page, claimed until acknowledged.

**Where it breaks.**
- **Expiry at 10 s.** A pending row is marked `not_sent` once it has waited `DELIVERY_DEADLINE_SECS = 10`
  (`journal.rs:14`, `:84`, `:252`; both push and pull apply it). So the 15 s and 60 s retries never happen, and a message
  for a closed or busy harness is **given up**, while the later messages of the thread, queued a few seconds after, are
  still delivered. The older message is lost and the newer one arrives: the exact failure the requirement forbids.
  Arriving later at an agent that has missed a turn, the room notes `abandoned_since`, but the words are gone.
- `cancel_unsent` (`journal.rs:264`) withdraws a thread's unsent input when its channel closes.
- Push or pull is per binding: a binding that is `busy` (a turn in flight) is skipped, and so the thread waits. That is the
  right behaviour, but the wait counts against the 10 s.
- A status the connector gives as `unsupported` is final (`not_sent`), `unknown` is final (`unconfirmed`, never resent, so no
  duplication risk).

## Hop 3: connector to harness

**Today.** `deliver` takes the binding's `serial` lock (`daemon.rs:894`), so one delivery at a time per binding: order
holds inside the connector. It keeps the last 64 pending ids (`:916`). The adapter returns `accepted`, `unknown`,
`unsupported`, `failed` or an error; core treats a failure as "try again", an unknown as a final unconfirmed.

**Where it breaks.**
- A Claude Code inbox that keeps the connection open gives no answer within 1.5 s, so delivery is `unknown` and then `unconfirmed`: the row shows a check,
  yet the agent may not have it, and nothing resends. The transcript read is meant to confirm it, with no follow-up when it
  does not.
- A closed harness is `failed` (a refused connection) and is retried by core, until the 10 s expiry.
- A connector that restarts forgets `pending` and the remembered inputs; a redelivered row is delivered again, so a
  duplicate in the agent's conversation is possible (it carries the same `message_id`).

## Guarantees after the change

1. **FIFO with head-of-line blocking per conversation, at every hop.** An undelivered message holds every later one of the
   same conversation, and nothing but delivery or an explicit person's cancel resolves it. Time alone never turns it into
   "not sent".
2. **Idempotent ids end to end:** `client_msg_id` on hop 1, `message_id` on hops 2 and 3. A resend is acknowledged, never
   applied twice.
3. **Backoff on a timer, not only on reconnection**, at every hop that retries: 5 s, 10 s, 20 s, 40 s, capped at 60 s, for
   as long as it takes. A new socket resets the schedule and sends at once.
4. **What the UI shows,** consistent with today's marks: pending (the page has it, the machine has not acknowledged it),
   delivered to the machine (acknowledged by hop 1, shown as sending), delivered to the agent (`delivered`), read
   (`read`), and not sent only when the person gave up. Today a hang-up leaves voice-turn rows pending (gap 3); the change must mark them.

## Gaps, ranked

As of `main` before #538, which closes gaps 3, 4 and 6 (backoff timer, the outbox gated on its reload, one order for texts and turns).

1. **core: input expires at 10 s** (`journal.rs:14`, `:84`, `:252`, `pull.rs:fetch_pull`). The older message is dropped while later ones go. Replace the clock by head-of-line blocking
   with the backoff, and keep an explicit bound only by count of the journal and by the person's own cancel. Highest: it loses messages and reorders.
2. **web: the outbox bound of 200 deletes the oldest pending entry** (`outbox.js:29`), so a later message can arrive after one that was
   silently dropped. A bound must refuse the newest (and say so) instead of dropping the oldest, or stop at a far larger count.
   Ranked high: it breaks never-overtake without any failure showing.
3. **web: no timer on an unacknowledged entry** (`room-session-controller.js:672`, `flushOutbox`). Add the backoff
   resend on the same socket. This is the web change in phase 2 of the night shift.
4. **web: sending is not gated on `outbox.ready`** (`:654`, `:660`): after a reload a new message can pass the restored older ones.
5. **web: `disconnect()` drops the outbox** (`:2213`), on a hang-up, a refusal or a move (`drainOutbox` gives it a short
   grace). A person who hangs up with messages pending loses them, with only the not-sent mark left. Keep them
   across the hang-up (or ask) instead.
6. **web: texts and turns are two queues** (`flushTexts` and `flushOutbox`): no order between them.
7. **core + web: a start held for `room.turns_full` is said again as a new message,** which can be overtaken, and the relay's 64-entry
   caps (`turn-relay.js:16`, `:23`) evict held turns.
8. **connector: `unknown` is final** (`claude.rs:326`, `push.rs:115`): the agent may not have the message and nothing resends.
9. **core: offline rows take the journal position of their arrival,** not of the words (`input.rs:110`).
10. **connector: pending list of 64 and no memory across restarts** (`daemon.rs:916`).
11. **several devices on one conversation:** each device has its own outbox and ordering, and the journal orders by arrival;
   there is no cross-device "said" order. Out of scope here.
