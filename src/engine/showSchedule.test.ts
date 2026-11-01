import { describe, expect, it } from "vitest";
import { scheduleShow, sliceAt } from "./showSchedule";
import type { Part, SongPlan, Tier } from "./songPlan";

/** A plan with parts at these starts (10 seconds each); "drops" the drop times, "picks" the picked scenes' IDs by start. */
function plan(starts: number[], drops: number[] = [], picks: Record<number, string> = {}): SongPlan {
  const parts: Part[] = starts.map((start, index) => ({
    start, end: starts[index + 1] ?? start + 10, label: "verse", tier: 1 as Tier, intensity: 0.5,
    ...(start in picks ? { scene: picks[start] } : {})
  }));
  return { parts, drops: drops.map((time) => ({ time, strength: 1, buildStart: time - 8, pauseStart: null })), cues: [] };
}

/** The IDs of this many scenes, in tab order: "s0", "s1" and so on. */
const ids = (count: number) => Array.from({ length: count }, (_, index) => `s${index}`);

describe("the show's scene schedule", () => {
  it("gives a slice its picked scene; a slice with no pick has none, but knows the last pick before it in its song", () => {
    const schedule = scheduleShow([plan([0, 10, 20, 30], [10], { 10: "s5" }), null, plan([0, 10], [], { 10: "s2" })], ids(9));
    expect(schedule.map((song) => song.map((slice) => slice.scene))).toEqual([[null, 5, null, null], [null], [null, 2]]);
    expect(schedule.map((song) => song.map((slice) => slice.lastPick))).toEqual([[null, 5, 5, 5], [null], [null, 2]]);
    expect(schedule[0].map((slice) => [slice.drop, slice.runStart])).toEqual([[false, -1], [true, 10], [false, 10], [false, 10]]);
  });

  it("leaves out a picked scene that is no longer there", () => {
    expect(scheduleShow([plan([0, 10], [], { 0: "s1", 10: "s7" })], ids(3))[0].map((slice) => [slice.scene, slice.lastPick])).toEqual([[1, 1], [null, 1]]);
  });

  it("finds a picked scene at its tab, wherever the scenes moved to", () => {
    expect(scheduleShow([plan([0, 10], [], { 0: "s1", 10: "s0" })], ["s2", "s0", "s1"])[0].map((slice) => slice.scene)).toEqual([2, 1]);
  });

  it("finds the slice that plays at a time", () => {
    const [slices] = scheduleShow([plan([0, 10, 20])], ids(2));
    expect(sliceAt(slices, 0)?.start).toBe(0);
    expect(sliceAt(slices, 15)?.start).toBe(10);
    expect(sliceAt(slices, 99)?.start).toBe(20);
    expect(sliceAt([], 5)).toBeUndefined();
  });
});
