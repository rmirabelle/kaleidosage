import { describe, expect, it } from "vitest";
import type { ScheduledSlice } from "../engine/showSchedule";
import { atResolution, mixFrames, songCues, stitchPlan } from "./videoExport";

describe("stitchPlan", () => {
  it("joins scenes with 2-second crossfades and shortens the video by them", () => {
    expect(stitchPlan([600, 600, 600], 60, false)).toEqual({ fades: [120, 120], total: 1560 });
  });

  it("adds a last crossfade back into the first scene when the video repeats", () => {
    expect(stitchPlan([600, 600, 600], 60, true)).toEqual({ fades: [120, 120, 120], total: 1440 });
  });

  it("keeps a crossfade inside half of the shorter scene", () => {
    expect(stitchPlan([100, 600], 60, false)).toEqual({ fades: [50], total: 650 });
  });

  it("has no crossfade with one scene", () => {
    expect(stitchPlan([600], 60, true)).toEqual({ fades: [], total: 600 });
  });
});

describe("songCues", () => {
  const slice = (start: number, scene: number | null, drop = false): ScheduledSlice => ({ start, tier: null, scene, lastPick: scene, drop, runStart: start });

  it("changes scene only at slices with a pick", () => {
    expect(songCues([slice(0, 2), slice(10, null), slice(20, 1)], 120, 60).map(({ scene }) => scene)).toEqual([2, 1]);
  });

  it("brings a scene in one frame early, at the start of the video at the earliest", () => {
    expect(songCues([slice(0, 0), slice(10, 1)], 120, 60).map(({ frame }) => frame)).toEqual([0, 599]);
  });

  it("cuts on a drop and crossfades for two beats otherwise, for at most 1.5 seconds", () => {
    expect(songCues([slice(5, 1, true), slice(10, 2)], 120, 60).map(({ fadeFrames }) => fadeFrames)).toEqual([0, 60]);
    expect(songCues([slice(10, 2)], 60, 60)[0].fadeFrames).toBe(90);
  });
});

describe("mixFrames", () => {
  const pixel = (...channels: number[]) => new Uint8Array(channels);

  it("keeps the first frame at 0 and gives the second frame at 1", () => {
    const first = pixel(10, 200, 30, 255);
    mixFrames(first, pixel(250, 0, 90, 255), 0);
    expect([...first]).toEqual([10, 200, 30, 255]);
    mixFrames(first, pixel(250, 0, 90, 255), 1);
    expect([...first]).toEqual([250, 0, 90, 255]);
  });

  it("gives the middle at 0.5, in every channel of every pixel", () => {
    const first = pixel(0, 100, 200, 255, 40, 80, 120, 255);
    mixFrames(first, pixel(100, 200, 100, 255, 60, 120, 180, 255), 0.5);
    expect([...first]).toEqual([50, 150, 150, 255, 50, 100, 150, 255]);
  });
});

describe("atResolution", () => {
  it("doubles a size at 4K, but not a 360 video", () => {
    expect(atResolution("landscape", { width: 1920, height: 1080 }, "4k")).toEqual({ width: 3840, height: 2160 });
    expect(atResolution("landscape", { width: 1920, height: 1080 }, "1080p")).toEqual({ width: 1920, height: 1080 });
    expect(atResolution("sphere", { width: 4096, height: 2048 }, "4k")).toEqual({ width: 4096, height: 2048 });
  });
});
