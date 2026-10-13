/* A phone's header row of conversations: as many avatars as its width has room for, in the room's order as this page
 * first saw it — nothing reorders them, not a selection, a state or what is unread — then "+" (a new conversation), then
 * the chevron to all of them. The conversation on the stage is marked where it is; chosen from the sheet while not in
 * the row, it takes the row's last slot (a guest) until another from outside is chosen, or it leaves. */

/** Whether the chevron shows when every conversation already fits in the row. Off (the operator's decision, 2026-10-12)
 *  it shows only when some do not; and while it does not, a phone has no way to the conversations' sheet, which alone
 *  holds each conversation's ⋯ (Close conversation), its state in words, the connection statistics (#stats-open) and,
 *  where the updates live in the sheet, the updates. On is the ux spec's recommendation: always there, its "+N" only
 *  when some are behind it. */
export const CHEVRON_ALWAYS = false;

/** A slot: a 34px avatar and its 2px padding, or "+"; 4px between slots; the chevron with "+NN" takes 60px with its
 *  gap. Measured on the row itself (`.header-conversations`), which is the header less its padding, the gear and the
 *  updates' button when it is there. */
const SLOT = 38;
const GAP = 4;
const CHEVRON = 60;
/** The row until it is laid out (a test's page, which lays nothing out): a 360px phone's. */
export const UNMEASURED_ROW = 284;

/** How many avatars the row has room for, beside "+", and whether the chevron shows: all of them with no chevron when
 *  they fit (unless it always shows), else as many as fit beside "+" and the chevron. */
export function rowCapacity(width: number, total: number, always = CHEVRON_ALWAYS): { avatars: number; chevron: boolean } {
  const withoutChevron = Math.floor((width + GAP) / (SLOT + GAP)) - 1;
  if (!always && total <= withoutChevron) return { avatars: total, chevron: false };
  const withChevron = Math.max(1, Math.floor((width - CHEVRON) / (SLOT + GAP)) - 1);
  return { avatars: Math.min(total, withChevron), chevron: true };
}

/** Which conversations the row shows, by id, in `order`: the first `avatars` of them, or, with the one on the stage (or
 *  the guest that stays) not among them, the first but one and it last. */
export function headerRow(order: string[], selected: string | null, guest: string | null, avatars: number): { row: string[]; guest: string | null } {
  const room = Math.max(1, avatars);
  const first = order.slice(0, room);
  const withGuest = (id: string) => [...order.filter((other) => other !== id).slice(0, room - 1), id];
  // A guest stays until it leaves, or until the row has room for it in its own place.
  let kept = guest && order.includes(guest) && !first.includes(guest) ? guest : null;
  let row = kept ? withGuest(kept) : first;
  // Chosen from outside the row: it takes the last slot, and the one there goes behind the chevron.
  if (selected && order.includes(selected) && !row.includes(selected)) {
    kept = selected;
    row = withGuest(selected);
  }
  return { row, guest: kept };
}
