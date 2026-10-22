import type { MapSlice } from "./songPlan";

/**
 * The song map editor's changes (see SongMapPanel): each takes the slices
 * in time order and returns a new list; the first slice always starts at
 * 0, and each slice ends where the next one starts. A slice starts on a bar
 * start (the analysis's downbeats).
 */

/**
 * Changes one slice's name, level, drop or picked scene ("scene":
 * undefined clears the pick). The first slice has no drop: nothing comes
 * before it. A Keep Scene mark from older maps is left out.
 */
export function changeSlice(slices: readonly MapSlice[], index: number, change: Partial<Pick<MapSlice, "label" | "tier" | "drop" | "scene">>): MapSlice[] {
  return slices.map((slice, i) => {
    if (i !== index) return slice;
    const { start, label, tier, scene } = { ...slice, ...change };
    const drop = i === 0 ? false : change.drop ?? slice.drop;
    return scene !== undefined ? { start, label, tier, drop, scene } : { start, label, tier, drop };
  });
}

/**
 * Fill (the Song Map toolbar): picks a scene for each slice that has none,
 * so the song plays a new scene at each slice: the scene after the one of
 * the slice before it, in tab order ("first": the scene of the first slice
 * when it has no pick). The slices with a pick keep it, and the order goes
 * on from them.
 */
export function fillScenes(slices: readonly MapSlice[], first: number, sceneCount: number): MapSlice[] {
  const count = Math.max(1, sceneCount);
  let before = first - 1;
  return slices.map((slice) => {
    const scene = slice.scene ?? (before + 1) % count;
    before = scene;
    return slice.scene === undefined ? { ...slice, scene } : slice;
  });
}

/**
 * The slices after a change of the scene order: "place" gives each old
 * tab index its new one, or null for a scene that is gone (its slices go
 * back to the show's order). Returns the same list when nothing changes.
 */
export function moveScenes(slices: readonly MapSlice[], place: (index: number) => number | null): readonly MapSlice[] {
  let moved = false;
  const next = slices.map((slice) => {
    if (slice.scene === undefined) return slice;
    const scene = place(slice.scene);
    if (scene === slice.scene) return slice;
    moved = true;
    const rest = { ...slice };
    delete rest.scene;
    return scene === null ? rest : { ...rest, scene };
  });
  return moved ? next : slices;
}

/**
 * Deletes a slice: the slice before it grows to take its place. The first
 * slice has none before it, so the next slice grows back to the start.
 * The last slice left cannot be deleted.
 */
export function deleteSlice(slices: readonly MapSlice[], index: number): MapSlice[] {
  if (slices.length < 2 || index < 0 || index >= slices.length) return [...slices];
  if (index === 0) return [{ ...slices[1], start: 0, drop: false }, ...slices.slice(2)];
  return slices.filter((_, i) => i !== index);
}

/** Joins a slice with the next one; the joined slice keeps the first one's name, level and drop. */
export function mergeWithNext(slices: readonly MapSlice[], index: number): MapSlice[] {
  if (index < 0 || index >= slices.length - 1) return [...slices];
  return slices.filter((_, i) => i !== index + 1);
}

/**
 * Splits the slice that plays at "at" (the playhead) in two, at the bar
 * start nearest "at". Both halves keep the slice's name, level and scene
 * choice; the second has no drop. When that bar start is a slice start
 * already (a second press at the same place, or the song's start), or
 * with no bar starts, nothing changes: so a slice is never shorter than
 * one bar, and two slices never start at the same place.
 */
export function splitAt(slices: readonly MapSlice[], downbeats: readonly number[], at: number): MapSlice[] {
  if (downbeats.length === 0) return [...slices];
  const split = downbeats.reduce((best, time) => (Math.abs(time - at) < Math.abs(best - at) ? time : best));
  if (split < 0.01 || slices.some((slice) => Math.abs(slice.start - split) < 0.01)) return [...slices];
  const index = slices.filter((slice) => slice.start < split).length - 1;
  if (index < 0) return [...slices];
  return [...slices.slice(0, index + 1), { ...slices[index], start: split, drop: false }, ...slices.slice(index + 1)];
}

/**
 * Moves the divider at the start of slice "index" to the bar start nearest
 * "at": the slice before it and this slice change size, and each keeps at
 * least one bar. The first slice has no divider at its start.
 */
export function moveDivider(slices: readonly MapSlice[], index: number, downbeats: readonly number[], duration: number, at: number): MapSlice[] {
  if (index < 1 || index >= slices.length) return [...slices];
  const from = slices[index - 1].start;
  const to = slices[index + 1]?.start ?? duration;
  const inside = downbeats.filter((time) => time > from + 0.01 && time < to - 0.01);
  if (inside.length === 0) return [...slices];
  const place = inside.reduce((best, time) => (Math.abs(time - at) < Math.abs(best - at) ? time : best));
  return slices.map((slice, i) => (i === index ? { ...slice, start: place } : slice));
}
