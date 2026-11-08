import { describe, expect, it } from "vitest";
import { atResolution, mixFrames, stitchPlan } from "./videoExport";

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
