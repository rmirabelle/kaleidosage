import { describe, expect, it } from "vitest";
import { outlineCorners } from "./renderer";

describe("outlineCorners", () => {
  it("puts a level square's corners a quarter of the way apart, from the top right", () => {
    const { corners, at, length } = outlineCorners(1, 5);
    expect(corners[0]).toBeCloseTo(Math.SQRT1_2);
    expect(corners[1]).toBeCloseTo(Math.SQRT1_2);
    expect([...at.slice(0, 5)].map((value) => Number(value.toFixed(5)))).toEqual([0, 0.25, 0.5, 0.75, 1]);
    expect(length).toBeCloseTo(4 * Math.SQRT2);
  });

  it("gives a ring 48 sides, a little shorter than the circle", () => {
    const { at, length } = outlineCorners(0, 5);
    expect(at[48]).toBeCloseTo(1);
    expect(length).toBeLessThan(Math.PI * 2);
    expect(length).toBeGreaterThan(Math.PI * 2 * 0.99);
  });

  it("puts a star's inner corners at 0.45", () => {
    const { corners, at } = outlineCorners(3, 5);
    expect(Math.hypot(corners[2], corners[3])).toBeCloseTo(0.45);
    expect(at[10]).toBeCloseTo(1);
  });
});
