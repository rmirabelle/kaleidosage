import { describe, expect, it } from "vitest";
import { scheduleShow, sliceAt } from "./showSchedule";
import type { Part, SongPlan, Tier } from "./songPlan";

/** A plan with parts at these starts (10 seconds each); "drops" the drop times, "picks" the picked scenes by start. */
function plan(starts: number[], drops: number[] = [], picks: Record<number, number> = {}): SongPlan {
  const parts: Part[] = starts.map((start, index) => ({
    start, end: starts[index + 1] ?? start + 10, label: "verse", tier: 1 as Tier, intensity: 0.5,
    ...(start in picks ? { scene: picks[start] } : {})
  }));
  return { parts, drops: drops.map((time) => ({ time, strength: 1, buildStart: time - 8, pauseStart: null })), cues: [] };
}

describe("the show's scene schedule", () => {
  it("keeps the scene of the slice before; each song brings in the next scene, and the order goes round", () => {
    const schedule = scheduleShow([plan([0, 10, 20], [10]), null, plan([0, 10])], 3);
    expect(schedule.map((song) => song.map((slice) => slice.scene))).toEqual([[0, 0, 0], [1], [2, 2]]);
    expect(schedule[0].map((slice) => [slice.change, slice.drop, slice.runStart])).toEqual([[true, false, 0], [false, true, 0], [false, false, 0]]);
    expect(schedule[1][0].change).toBe(true);
    expect(scheduleShow([plan([0]), plan([0]), plan([0])], 2).map((song) => song[0].scene)).toEqual([0, 1, 0]);
  });

  it("plays a picked scene, and the slices after it keep it", () => {
    const schedule = scheduleShow([plan([0, 10, 20, 30], [], { 10: 5 }), plan([0, 10], [], { 10: 2 })], 9);
    expect(schedule.map((song) => song.map((slice) => slice.scene))).toEqual([[0, 5, 5, 5], [6, 2]]);
    expect(schedule[0].map((slice) => [slice.change, slice.runStart])).toEqual([[true, 0], [true, 10], [false, 10], [false, 10]]);
    expect(schedule[1].map((slice) => slice.picked)).toEqual([false, true]);
    /* A picked scene that is no longer there: the slice keeps the scene before it. */
    expect(scheduleShow([plan([0, 10], [], { 10: 7 })], 3)[0].map((slice) => slice.scene)).toEqual([0, 0]);
  });

  it("finds the slice that plays at a time", () => {
    const [slices] = scheduleShow([plan([0, 10, 20])], 2);
    expect(sliceAt(slices, 0)?.start).toBe(0);
    expect(sliceAt(slices, 15)?.start).toBe(10);
    expect(sliceAt(slices, 99)?.scene).toBe(0);
    expect(sliceAt([], 5)).toBeUndefined();
  });
});
