import type { MapSlice } from "./songPlan";

/**
 * The song map editor's changes (see SongMapDialog): each takes the slices
 * in time order and returns a new list; the first slice always starts at
 * 0, and each slice ends where the next one starts. A slice starts on a bar
 * start (the analysis's downbeats).
 */

/** Changes one slice's name, level or drop. The first slice has no drop: nothing comes before it. */
export function changeSlice(slices: readonly MapSlice[], index: number, change: Partial<Pick<MapSlice, "label" | "tier" | "drop">>): MapSlice[] {
  return slices.map((slice, i) => (i === index ? { ...slice, ...change, drop: i === 0 ? false : change.drop ?? slice.drop } : slice));
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
 * Splits a slice in two at the bar start nearest "at" (or nearest its
 * middle, with no "at"), leaving at least one bar on each side. Both
 * halves keep the slice's name and level; the second has no drop. With no
 * bar start to split at, nothing changes.
 */
export function splitSlice(slices: readonly MapSlice[], index: number, downbeats: readonly number[], duration: number, at?: number): MapSlice[] {
  const slice = slices[index];
  if (!slice) return [...slices];
  const end = slices[index + 1]?.start ?? duration;
  const target = at ?? (slice.start + end) / 2;
  const inside = downbeats.filter((time) => time > slice.start + 0.01 && time < end - 0.01);
  if (inside.length === 0) return [...slices];
  const split = inside.reduce((best, time) => (Math.abs(time - target) < Math.abs(best - target) ? time : best));
  return [...slices.slice(0, index + 1), { ...slice, start: split, drop: false }, ...slices.slice(index + 1)];
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
