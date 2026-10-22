import { describe, expect, it } from "vitest";
import { scheduleShow, sliceAt } from "./showSchedule";
import type { Part, SongPlan, Tier } from "./songPlan";

/** A plan with parts at these starts (10 seconds each); "keep" marks the parts that keep the scene, "drops" the drop times, "picks" the picked scenes by start. */
function plan(starts: number[], keep: number[] = [], drops: number[] = [], picks: Record<number, number> = {}): SongPlan {
  const parts: Part[] = starts.map((start, index) => ({
    start, end: starts[index + 1] ?? start + 10, label: "verse", tier: 1 as Tier, intensity: 0.5,
    ...(keep.includes(start) ? { keepScene: true } : {}),
    ...(start in picks ? { scene: picks[start] } : {})
  }));
  return { parts, drops: drops.map((time) => ({ time, strength: 1, buildStart: time - 8, pauseStart: null })), cues: [] };
}

describe("the show's scene schedule", () => {
  it("gives each slice its own place in the order, across songs, and goes round", () => {
    const schedule = scheduleShow([plan([0, 10, 20], [], [10]), null, plan([0, 10])], 4);
    expect(schedule.map((song) => song.map((slice) => slice.scene))).toEqual([[0, 1, 2], [3], [0, 1]]);
    expect(schedule[0].map((slice) => [slice.change, slice.drop, slice.runStart])).toEqual([[true, false, 0], [true, true, 10], [true, false, 20]]);
    expect(schedule[1][0].change).toBe(true);
  });

  it("keeps the scene before, or plays a picked scene, and skips that slice's own scene: no other slice moves", () => {
    const schedule = scheduleShow([plan([0, 10, 20, 30], [20]), plan([0, 10], [], [], { 0: 0 })], 9);
    expect(schedule.map((song) => song.map((slice) => slice.scene))).toEqual([[0, 1, 1, 3], [0, 5]]);
    expect(schedule[0].map((slice) => [slice.change, slice.runStart])).toEqual([[true, 0], [true, 10], [false, 10], [true, 30]]);
    expect(schedule[1].map((slice) => slice.picked)).toEqual([true, false]);
    /* A picked scene that is no longer there: the slice plays its place in the order. */
    expect(scheduleShow([plan([0, 10], [], [], { 10: 7 })], 3)[0].map((slice) => slice.scene)).toEqual([0, 1]);
  });

  it("finds the slice that plays at a time", () => {
    const [slices] = scheduleShow([plan([0, 10, 20])], 2);
    expect(sliceAt(slices, 0)?.start).toBe(0);
    expect(sliceAt(slices, 15)?.start).toBe(10);
    expect(sliceAt(slices, 99)?.scene).toBe(0);
    expect(sliceAt([], 5)).toBeUndefined();
  });
});
