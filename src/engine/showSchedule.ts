import type { SongPlan, Tier } from "./songPlan";

/**
 * The show's scene schedule: while the picture follows the songs, a slice
 * of a song (a part of its plan) with a scene the user picked plays that
 * scene (see songPlan.ts). Any other slice plays the scene of the slice
 * before it; the first slice of a song with no pick plays the scene after
 * the last one of the song before it, in tab order (after the last scene,
 * the first), so each song brings in a scene of its own. A pick never
 * moves when the scenes or the songs change order. A song with no plan yet
 * counts as one slice.
 */

export interface ScheduledSlice {
  start: number;
  /** The slice's level, or null for a song with no plan yet. */
  tier: Tier | null;
  /** The tab index of the slice's scene. */
  scene: number;
  /** True when the slice brings in a scene: the first slice of a song, or a scene other than the one of the slice before it. */
  change: boolean;
  /** True when the user picked the slice's scene. */
  picked: boolean;
  /** True when a drop starts the slice: its scene comes in with a cut. */
  drop: boolean;
  /** The start of the slice that brought in this slice's scene (this slice's own start when it changes). */
  runStart: number;
}

/** Each song's slices with their scenes, for the songs in playlist order (null: no plan yet). */
export function scheduleShow(plans: readonly (SongPlan | null)[], sceneCount: number): ScheduledSlice[][] {
  const count = Math.max(1, sceneCount);
  let before = -1;
  return plans.map((plan) => {
    const parts: readonly { start: number; tier: Tier | null; scene?: number }[] = plan?.parts ?? [{ start: 0, tier: null }];
    const drops = new Set(plan?.drops.map((drop) => drop.time) ?? []);
    let runStart = 0;
    return parts.map((part, index) => {
      const picked = part.scene !== undefined && part.scene >= 0 && part.scene < count;
      const scene = picked ? part.scene! : index > 0 ? before : (before + 1) % count;
      const change = index === 0 || scene !== before;
      if (change) runStart = part.start;
      before = scene;
      return { start: part.start, tier: part.tier, scene, change, picked, drop: index > 0 && drops.has(part.start), runStart };
    });
  });
}

/** The scheduled slice that plays at this time of a song, or undefined with no slices. */
export function sliceAt(slices: readonly ScheduledSlice[], time: number): ScheduledSlice | undefined {
  let found = slices[0];
  for (const slice of slices) {
    if (slice.start > time) break;
    found = slice;
  }
  return found;
}
