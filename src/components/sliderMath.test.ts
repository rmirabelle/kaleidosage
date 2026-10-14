import { describe, expect, it } from "vitest";
import { mirrorAround, shiftRange, snapToDetent, snapToStep } from "./sliderMath";

describe("snapToStep", () => {
  it("rounds to whole steps without float noise", () => {
    expect(snapToStep(0.1 + 0.2, 0.01)).toBe(0.3);
    expect(snapToStep(12.6, 1)).toBe(13);
  });
});

describe("shiftRange", () => {
  it("moves both ends by the same whole-step amount", () => {
    expect(shiftRange(0.6, 1.8, 0.334, 0.2, 4, 0.01)).toEqual([0.93, 2.13]);
    expect(shiftRange(90, 180, -30.4, 0, 360, 1)).toEqual([60, 150]);
  });

  it("keeps a reversed range reversed", () => {
    expect(shiftRange(1.8, 0.6, 5, 0.2, 4, 0.01)).toEqual([4, 2.8]);
    expect(shiftRange(350, 300, -400, 0, 360, 1)).toEqual([50, 0]);
  });

  it("stops at the limits and keeps the width", () => {
    expect(shiftRange(0.6, 1.8, -5, 0.2, 4, 0.01)).toEqual([0.2, 1.4]);
    expect(shiftRange(300, 350, 100, 0, 360, 1)).toEqual([310, 360]);
  });
});

describe("detent and mirrored ranges", () => {
  it("snaps a value near the detent onto it", () => {
    expect(snapToDetent(0.03, 0, -1, 1)).toBe(0);
    expect(snapToDetent(-0.039, 0, -1, 1)).toBe(0);
    expect(snapToDetent(0.05, 0, -1, 1)).toBe(0.05);
    expect(snapToDetent(0.5, undefined, -1, 1)).toBe(0.5);
  });

  it("copies a handle's distance from the center to the other side", () => {
    expect(mirrorAround(0.3, 0, -1, 1, 0.01)).toEqual([0.3, -0.3]);
    expect(mirrorAround(-0.2, 0, -1, 1, 0.01)).toEqual([-0.2, 0.2]);
    /* Zoom has no effect at 1, which is not the middle of 0.2 to 4: the far side stops the distance. */
    expect(mirrorAround(3, 1, 0.2, 4, 0.01)).toEqual([1.8, 0.2]);
  });
});
