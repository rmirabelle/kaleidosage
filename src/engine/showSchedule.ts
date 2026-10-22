import type { SongPlan, Tier } from "./songPlan";

/**
 * The show's scene schedule: while the picture follows the songs, the
 * scenes come in one after the other, in tab order, across the whole
 * playlist. Each slice of a song (a part of its plan) brings in the next
 * scene, unless it keeps the scene (see songPlan.ts); the first slice of
 * each song after the first brings in the next scene too, so a new song
 * goes on with the order. After the last scene the order goes round to
 * the first. A song with no plan yet counts as one slice.
 */

export interface ScheduledSlice {
  start: number;
  /** The slice's level, or null for a song with no plan yet. */
  tier: Tier | null;
  /** The tab index of the slice's scene. */
  scene: number;
  /** True when the slice brings in a scene (it does not keep the one before it). */
  change: boolean;
  /** True when a drop starts the slice: its scene comes in with a cut. */
  drop: boolean;
  /** The start of the slice that brought in this slice's scene (this slice's own start when it changes). */
  runStart: number;
}

/** Each song's slices with their scenes, for the songs in playlist order (null: no plan yet). */
export function scheduleShow(plans: readonly (SongPlan | null)[], sceneCount: number): ScheduledSlice[][] {
  const count = Math.max(1, sceneCount);
  let step = -1;
  return plans.map((plan) => {
    const parts = plan?.parts ?? [{ start: 0, tier: null }];
    const drops = new Set(plan?.drops.map((drop) => drop.time) ?? []);
    let runStart = 0;
    return parts.map((part, index) => {
      const change = index === 0 || !("keepScene" in part && part.keepScene);
      if (change) {
        step++;
        runStart = part.start;
      }
      return { start: part.start, tier: part.tier, scene: step % count, change, drop: index > 0 && drops.has(part.start), runStart };
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
