import { describe, expect, it } from "vitest";
import { shiftRange, snapToStep } from "./sliderMath";

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
