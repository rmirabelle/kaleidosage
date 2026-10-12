import { describe, expect, it } from "vitest";
import { blurReach } from "./reach";

describe("blurReach", () => {
  it("is half the linear blur distance, scaled to the screen height", () => {
    expect(blurReach(0, 400, 0.8, 1920, 1080)).toBe(200);
    expect(blurReach(0, 400, 0.8, 3840, 2160)).toBe(400);
  });

  it("uses the corner distance for radial and spin blur", () => {
    const reach = blurReach(1, 400, 0.8, 1920, 1080);
    expect(reach).toBeCloseTo(0.5 * 0.8 * 1080 * 0.5 * Math.hypot(1920 / 1080, 1));
    expect(blurReach(2, 400, 0.8, 1920, 1080)).toBe(reach);
  });

  it("grows when the center moves toward an edge", () => {
    const centered = blurReach(1, 400, 0.8, 1920, 1080);
    const moved = blurReach(1, 400, 0.8, 1920, 1080, 0.3, -0.2);
    expect(moved).toBeCloseTo(0.5 * 0.8 * 1080 * Math.hypot(0.8 * 1920 / 1080, 0.7));
    expect(moved).toBeGreaterThan(centered);
  });

  it("is zero with no blur", () => {
    expect(blurReach(0, 0, 0, 1920, 1080)).toBe(0);
    expect(blurReach(1, 0, 0, 1920, 1080)).toBe(0);
  });
});
