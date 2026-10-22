import { describe, expect, it } from "vitest";
import { scheduleShow, sliceAt } from "./showSchedule";
import type { Part, SongPlan, Tier } from "./songPlan";

/** A plan with parts at these starts (10 seconds each); "keep" marks the parts that keep the scene, "drops" the drop times. */
function plan(starts: number[], keep: number[] = [], drops: number[] = []): SongPlan {
  const parts: Part[] = starts.map((start, index) => ({
    start, end: starts[index + 1] ?? start + 10, label: "verse", tier: 1 as Tier, intensity: 0.5,
    ...(keep.includes(start) ? { keepScene: true } : {})
  }));
  return { parts, drops: drops.map((time) => ({ time, strength: 1, buildStart: time - 8, pauseStart: null })), cues: [] };
}

describe("the show's scene schedule", () => {
  it("brings in the next scene at each slice that does not keep the scene, across songs, and goes round", () => {
    const schedule = scheduleShow([plan([0, 10, 20], [20], [10]), null, plan([0, 10])], 3);
    expect(schedule.map((song) => song.map((slice) => slice.scene))).toEqual([[0, 1, 1], [2], [0, 1]]);
    expect(schedule[0].map((slice) => [slice.change, slice.drop, slice.runStart])).toEqual([[true, false, 0], [true, true, 10], [false, false, 10]]);
    expect(schedule[1][0].change).toBe(true);
  });

  it("finds the slice that plays at a time", () => {
    const [slices] = scheduleShow([plan([0, 10, 20])], 2);
    expect(sliceAt(slices, 0)?.start).toBe(0);
    expect(sliceAt(slices, 15)?.start).toBe(10);
    expect(sliceAt(slices, 99)?.scene).toBe(0);
    expect(sliceAt([], 5)).toBeUndefined();
  });
});
