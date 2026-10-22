import { describe, expect, it } from "vitest";
import { changeSlice, deleteSlice, fillScenes, mergeWithNext, moveDivider, moveScenes, splitAt } from "./songMapEdits";
import { mapOf, planSong, type MapSlice } from "./songPlan";
import type { SongAnalysis } from "./songScript";

/** Three slices of a 30-second song at 120 BPM (a bar every 2 seconds). */
const slices: MapSlice[] = [
  { start: 0, label: "intro", tier: 0, drop: false },
  { start: 10, label: "verse", tier: 1, drop: false },
  { start: 20, label: "chorus", tier: 3, drop: true }
];
const downbeats = Array.from({ length: 15 }, (_, i) => i * 2);

describe("song map edits", () => {
  it("changes a slice's name, level and drop, but never a drop on the first slice", () => {
    expect(changeSlice(slices, 1, { tier: 2, label: "bridge", drop: true })[1]).toEqual({ start: 10, label: "bridge", tier: 2, drop: true });
    expect(changeSlice(slices, 0, { drop: true })[0].drop).toBe(false);
    /* A Keep Scene mark from an older map is left out. */
    expect(changeSlice([{ ...slices[1], keepScene: true } as MapSlice], 0, { tier: 3 })[0]).toEqual({ start: 10, label: "verse", tier: 3, drop: false });
  });

  it("picks a scene for a slice, even the first, and clears it", () => {
    expect(changeSlice(slices, 0, { scene: 4 })[0]).toEqual({ ...slices[0], scene: 4 });
    expect(changeSlice(changeSlice(slices, 1, { scene: 2 }), 1, { scene: undefined })[1]).toEqual(slices[1]);
    expect(changeSlice(changeSlice(slices, 1, { scene: 2 }), 1, { tier: 3 })[1]).toEqual({ ...slices[1], tier: 3, scene: 2 });
  });

  it("fills the slices with no pick with the next scenes, and keeps the picks", () => {
    expect(fillScenes(changeSlice(slices, 1, { scene: 7 }), 2, 9).map((slice) => slice.scene)).toEqual([2, 7, 8]);
    expect(fillScenes(slices, 8, 9).map((slice) => slice.scene)).toEqual([8, 0, 1]);
  });

  it("moves picked scenes with the scene order, and drops a pick whose scene is gone", () => {
    const picked = changeSlice(changeSlice(slices, 0, { scene: 0 }), 2, { scene: 3 });
    expect(moveScenes(picked, (index) => index).length).toBe(3);
    expect(moveScenes(picked, (index) => index)).toBe(picked);
    expect(moveScenes(picked, (index) => (index === 0 ? null : index - 1))).toEqual([slices[0], slices[1], { ...slices[2], scene: 2 }]);
  });

  it("deletes a slice: the slice before it grows into its place", () => {
    expect(deleteSlice(slices, 1)).toEqual([slices[0], slices[2]]);
    /* The first slice: the next one grows back to the start, and has no drop there. */
    expect(deleteSlice(slices, 0)).toEqual([{ start: 0, label: "verse", tier: 1, drop: false }, slices[2]]);
    expect(deleteSlice([slices[0]], 0)).toEqual([slices[0]]);
  });

  it("joins a slice with the next one", () => {
    expect(mergeWithNext(slices, 1)).toEqual([slices[0], slices[1]]);
    expect(mergeWithNext(slices, 2)).toEqual(slices);
  });

  it("moves a divider to the nearest bar start, and keeps a bar on each side", () => {
    expect(moveDivider(slices, 1, downbeats, 30, 13.1).map((slice) => slice.start)).toEqual([0, 14, 20]);
    /* Past the next divider: it stops a bar before it. */
    expect(moveDivider(slices, 1, downbeats, 30, 25).map((slice) => slice.start)).toEqual([0, 18, 20]);
    /* Before the slice before it: it stops a bar after its start. */
    expect(moveDivider(slices, 1, downbeats, 30, -5).map((slice) => slice.start)).toEqual([0, 2, 20]);
    expect(moveDivider(slices, 0, downbeats, 30, 5)).toEqual(slices);
  });

  it("splits the slice at the playhead, at the bar start nearest it", () => {
    expect(splitAt(slices, downbeats, 13.1).map((slice) => slice.start)).toEqual([0, 10, 14, 20]);
    expect(splitAt(slices, downbeats, 27.3).map((slice) => slice.start)).toEqual([0, 10, 20, 28]);
    expect(splitAt(slices, downbeats, 27.3)[3]).toEqual({ start: 28, label: "chorus", tier: 3, drop: false });
  });

  it("does not split again at the same place, or at a slice start", () => {
    const once = splitAt(slices, downbeats, 13.1);
    expect(splitAt(once, downbeats, 13.1)).toEqual(once);
    expect(splitAt(slices, downbeats, 10.4)).toEqual(slices);
    expect(splitAt(slices, downbeats, 0.3)).toEqual(slices);
  });
});

describe("an edited song map", () => {
  const frames = 30 * 100;
  const zeros = new Array<number>(frames).fill(0);
  const analysis: SongAnalysis = {
    version: 2, duration: 30, tempo: 120,
    beats: Array.from({ length: 60 }, (_, i) => i * 0.5), downbeats,
    curveRate: 100,
    curves: { loudness: zeros, loudnessShort: zeros, intensity: zeros, intensityLocal: zeros, bass: zeros, mids: zeros, highs: zeros, brightness: zeros, onsets: zeros },
    hits: { kick: [], snare: [], hats: [] },
    sections: [{ start: 0, end: 30, label: "verse" }],
    mapEdits: slices
  };

  it("gives the plan its parts, levels and drops", () => {
    const plan = planSong(analysis);
    expect(plan.parts.map((part) => [part.start, part.end, part.label, part.tier])).toEqual([[0, 10, "intro", 0], [10, 20, "verse", 1], [20, 30, "chorus", 3]]);
    expect(plan.drops.map((drop) => drop.time)).toEqual([20]);
    expect(plan.cues).toEqual([{ time: 10, drop: false }, { time: 20, drop: true }]);
    expect(mapOf(plan)).toEqual(slices);
  });

  it("keeps a picked scene with its slice", () => {
    const plan = planSong({ ...analysis, mapEdits: changeSlice(slices, 2, { scene: 4 }) });
    expect(plan.parts[2].scene).toBe(4);
    expect(plan.drops.map((drop) => drop.time)).toEqual([20]);
    expect(mapOf(plan)[2].scene).toBe(4);
  });
});
