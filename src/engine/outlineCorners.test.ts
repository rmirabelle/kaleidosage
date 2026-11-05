import { describe, expect, it } from "vitest";
import { outlineCorners, snakePoint } from "./renderer";

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

  it("runs a snake's 48 corners from its tail to its head, open, with its head at the clock time", () => {
    const { corners, at } = outlineCorners(4, 5, 7.5, 0.4);
    const [x, y] = snakePoint(7.5);
    expect(corners[94]).toBeCloseTo(x);
    expect(corners[95]).toBeCloseTo(y);
    expect(at[0]).toBe(0);
    expect(at[47]).toBeCloseTo(1);
    for (let k = 1; k < 48; k++) expect(at[k]).toBeGreaterThan(at[k - 1]);
  });

  it("gives Radial its points at radius 1, one straight up, and inner corners by Inner radius", () => {
    for (const points of [3, 5, 24]) {
      const inner = 0.5;
      const { corners, at } = outlineCorners(3, points, 0, 0.35, inner);
      expect(corners[0]).toBeCloseTo(0);
      expect(corners[1]).toBeCloseTo(1);
      for (let k = 0; k < 2 * points; k++) {
        expect(Math.hypot(corners[k * 2], corners[k * 2 + 1])).toBeCloseTo(k % 2 === 0 ? 1 : inner * Math.cos(Math.PI / points));
      }
      expect(at[2 * points]).toBeCloseTo(1);
    }
  });

  it("makes Radial a plain shape with Points sides at Inner radius 1", () => {
    const { length, at } = outlineCorners(3, 6);
    expect(length).toBeCloseTo(6);
    expect(at[2]).toBeCloseTo(1 / 6);
  });
});
