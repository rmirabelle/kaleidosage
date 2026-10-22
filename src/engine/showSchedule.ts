import type { SongPlan, Tier } from "./songPlan";

/**
 * The show's scene schedule: while the picture follows the songs, a slice
 * of a song (a part of its plan) with a scene the user picked brings in
 * that scene (see songPlan.ts), as a cue. A slice with no pick changes
 * nothing: the scene that shows stays, whatever brought it in (a pick
 * before it, or a click in the scene list). For a jump into such a slice,
 * each slice also knows the last pick before it in its song. A pick never
 * moves when the scenes or the songs change order. A song with no plan yet
 * counts as one slice with no pick.
 */

export interface ScheduledSlice {
  start: number;
  /** The slice's level, or null for a song with no plan yet. */
  tier: Tier | null;
  /** The tab index of the scene the user picked for the slice, or null: the slice changes nothing. */
  scene: number | null;
  /** The scene of this slice's pick, or else of the last pick before it in its song, or null: what a jump into the slice shows. */
  lastPick: number | null;
  /** True when a drop starts the slice: its scene comes in with a cut. */
  drop: boolean;
  /** The start of the slice whose pick is lastPick, or -1 with none. */
  runStart: number;
}

/** Each song's slices with their picked scenes, for the songs in playlist order (null: no plan yet). */
export function scheduleShow(plans: readonly (SongPlan | null)[], sceneCount: number): ScheduledSlice[][] {
  return plans.map((plan) => {
    const parts: readonly { start: number; tier: Tier | null; scene?: number }[] = plan?.parts ?? [{ start: 0, tier: null }];
    const drops = new Set(plan?.drops.map((drop) => drop.time) ?? []);
    let lastPick: number | null = null;
    let runStart = -1;
    return parts.map((part, index) => {
      const scene = part.scene !== undefined && part.scene >= 0 && part.scene < sceneCount ? part.scene : null;
      if (scene !== null) {
        lastPick = scene;
        runStart = part.start;
      }
      return { start: part.start, tier: part.tier, scene, lastPick, drop: index > 0 && drops.has(part.start), runStart };
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
