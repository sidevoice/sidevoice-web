/** Where the avatar's creature and what shows with it (the person's pill, the agent's balloon, the compact card) sit across its column:
 *  centred on the creature, as far as the window's room on each side allows. All lengths are CSS pixels. */
export interface VoiceRoom { left: number; right: number }

/** The widest the voice text can be where the creature stands: the creature and the room on each side of it (absent: no limit).
 *  Wider than this it could not be inside the work area however it slid, so it wraps to it. */
export function voiceMax(figure: number, room?: VoiceRoom | null): number | null {
  return room ? Math.max(0, figure) + Math.max(0, room.left) + Math.max(0, room.right) : null;
}

/** The column as laid out: how far from its left edge the creature starts, and each piece (in the order given). */
export interface AvatarColumn { figure: number; pieces: number[] }

/** The avatar's column, one piece over another, as wide as the widest: the creature `figure` wide and the `pieces` shown with it. The
 *  window is the column (and its shadow margin), and the app keeps the creature where it rests and moves the window in only where it
 *  reaches past the work area (sidevoice-desktop call_controls `window_at`), which moves the creature too. So the creature sits where
 *  the column reaches no further past it on a side than the `room` there: centred in the column while that fits, toward the edge where
 *  it does not (the column then grows only away from the edge). Each piece is centred on the creature, slid inward just enough to stay
 *  in the column: off-centre only at an edge. Without a `room` (a host that cannot tell), everything is centred. The creature's place
 *  is whole pixels, rounded up: the window the app is asked for is whole pixels too, and is never a pixel past the room. */
export function avatarColumn(figure: number, pieces: readonly number[], room?: VoiceRoom | null): AvatarColumn {
  const width = Math.max(figure, ...pieces), slack = width - figure;
  let at = slack / 2;
  if (room) {
    const least = slack - Math.max(0, room.right), most = Math.min(slack, Math.max(0, room.left));
    // Where the room is short on both sides (a work area narrower than the column) the left edge is kept.
    at = least > most ? most : Math.min(Math.max(at, least), most);
  }
  const x = Math.max(0, Math.ceil(at - 1e-6));
  const mid = x + figure / 2;
  return { figure: x, pieces: pieces.map((piece) => Math.min(Math.max(0, mid - piece / 2), Math.max(0, width - piece))) };
}
