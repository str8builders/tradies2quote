/**
 * The walk through the house, as numbers. HouseWalk uses it to fade the
 * rooms and play their clips; the floating 3D phone uses the same numbers
 * to know which room it is in and where on the screen to float. Pure
 * functions, so both always agree and the walk is tested.
 */

/** Screens of scroll each room holds for (its section is this + 1 screen tall; see jobsite.css). */
export const ROOM_HOLD = 1.3;
/** The next room fades in over the last part of the previous room's hold. */
export const FADE_FROM = 0.72;

const smooth = (x: number) => {
  const u = x < 0 ? 0 : x > 1 ? 1 : x;
  return u * u * (3 - 2 * u);
};

export type Walk = {
  /** How far each room has come in, 0 → 1 (its opacity). */
  enter: number[];
  /** The room you're in: the last one more than half in, or -1 before the first. */
  active: number;
};

/** Each room's top edge (px from the top of the screen) → the walk. */
export function walkAt(tops: readonly number[], vh: number): Walk {
  // How far through its hold each room is (0 → 1 while it's pinned).
  const through = tops.map((top) => -top / (vh * ROOM_HOLD));
  let active = -1;
  const enter = tops.map((top, i) => {
    // The first room slides up over the flash; each later one fades in over
    // the end of the room before it.
    const e = i === 0 ? smooth(1 - top / vh) : smooth((through[i - 1] - FADE_FROM) / (1 - FADE_FROM));
    if (e > 0.5) active = i;
    return e;
  });
  return { enter, active };
}

export type Box = { left: number; top: number; width: number; height: number };

/**
 * Where the phone floats: each room's phone slot, blended by how far that
 * room has faded in over the one before. The slots line up while the rooms
 * are pinned, so the phone stays put from room to room, rides up with the
 * first room and away with the last, and never jumps at a hand-over.
 */
export function blendSlots(slots: readonly Box[], enter: readonly number[]): Box | null {
  if (slots.length === 0) return null;
  let { left, top, width, height } = slots[0];
  for (let i = 1; i < slots.length; i++) {
    const k = enter[i] ?? 0;
    if (k <= 0) continue;
    const s = slots[i];
    left += (s.left - left) * k;
    top += (s.top - top) * k;
    width += (s.width - width) * k;
    height += (s.height - height) * k;
  }
  return { left, top, width, height };
}

/**
 * The biggest box of `aspect` (width / height) that fits in `box`, centred
 * across it and, by default, centred down it. The phone sits at the bottom
 * of its slot instead, on its caption, so it stays put from room to room
 * however long each room's words are.
 */
export function containIn(box: Box, aspect: number, align: "centre" | "bottom" = "centre"): Box {
  const height = Math.max(0, Math.min(box.height, box.width / aspect));
  const width = height * aspect;
  return {
    left: box.left + (box.width - width) / 2,
    top: align === "bottom" ? box.top + box.height - height : box.top + (box.height - height) / 2,
    width,
    height,
  };
}
