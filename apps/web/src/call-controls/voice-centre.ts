/** Where the avatar's voice text (the person's pill, the agent's balloon) sits against the creature: centred on it, as far as the
 *  window's room on each side allows. All lengths are CSS pixels. */
export interface VoiceRoom { left: number; right: number }

/** The widest the voice text can be where the creature stands: the creature and the room on each side of it (absent: no limit).
 *  Wider than this it could not be inside the work area however it slid, so it wraps to it. */
export function voiceMax(figure: number, room?: VoiceRoom | null): number | null {
  return room ? Math.max(0, figure) + Math.max(0, room.left) + Math.max(0, room.right) : null;
}

/** How far to move the voice text sideways from the creature's centre (positive: to the right). The text overhangs the creature by
 *  `(voice - figure) / 2` a side when centred; `room` is the space the creature has to the work area's left and right edges (absent:
 *  unlimited, so always centred). Where the overhang does not fit on a side, the text slides toward the other until it does; where it
 *  fits on neither, it takes the middle of what there is. */
export function voiceShift(voice: number, figure: number, room?: VoiceRoom | null): number {
  const over = (voice - figure) / 2;
  if (!room || over <= 0) return 0;
  const least = over - Math.max(0, room.left);
  const most = Math.max(0, room.right) - over;
  if (least <= 0 && most >= 0) return 0;
  return Math.round(least > most ? (least + most) / 2 : Math.min(Math.max(0, least), most));
}
