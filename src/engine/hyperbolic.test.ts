import { describe, expect, it } from "vitest";
import { hyperbolicCrossfade, hyperbolicMirror } from "./renderer";

describe("hyperbolicMirror", () => {
  it("makes a mirror circle at right angles to the disk's edge, meeting the wedge line at pi / corners", () => {
    const [center, radius, wedge] = hyperbolicMirror(5, 4, 0);
    expect(wedge).toBeCloseTo(Math.PI / 5);
    expect(center * center).toBeCloseTo(1 + radius * radius);
    expect(center * Math.sin(wedge)).toBeCloseTo(radius * Math.cos(Math.PI / 4));
  });

  it("raises a corner count too small for the sides until the tiles fit", () => {
    /* 4 squares at a corner lie flat; 5 fit in the disk. */
    const [center, radius] = hyperbolicMirror(4, 4, 0);
    expect(center * Math.sin(Math.PI / 4)).toBeCloseTo(radius * Math.cos(Math.PI / 5));
    expect(hyperbolicMirror(3, 3, 0).every(Number.isFinite)).toBe(true);
  });

  it("keeps the flow inside the disk", () => {
    expect(hyperbolicMirror(6, 4, 2)[3]).toBe(0.95);
    expect(hyperbolicMirror(6, 4, -2)[3]).toBe(-0.95);
  });
});

describe("hyperbolicCrossfade", () => {
  const total = (shares: Float32Array) => shares.reduce((sum, share) => sum + share, 0);

  it("uses one pattern at whole numbers, and near them", () => {
    for (const sides of [5, 5.1, 5.9]) {
      const { count, shares, mirrors } = hyperbolicCrossfade(sides, 4, 0);
      expect(count).toBe(1);
      expect(shares[0]).toBe(1);
      expect(mirrors[2]).toBeCloseTo(Math.PI / Math.round(sides));
    }
  });

  it("mixes the two patterns evenly halfway", () => {
    const { count, shares, mirrors } = hyperbolicCrossfade(5.5, 4, 0);
    expect(count).toBe(2);
    expect(shares[0]).toBeCloseTo(0.5);
    expect(shares[1]).toBeCloseTo(0.5);
    expect(mirrors[2]).toBeCloseTo(Math.PI / 5);
    expect(mirrors[6]).toBeCloseTo(Math.PI / 6);
  });

  it("mixes four patterns when both counts are between whole numbers, and the shares add up to 1", () => {
    const { count, shares } = hyperbolicCrossfade(5.4, 6.7, 0);
    expect(count).toBe(4);
    expect(total(shares)).toBeCloseTo(1);
  });

  it("has no jump: the share of the next pattern grows from 0 to 1 across each step", () => {
    let last = 0;
    for (let value = 5; value < 6; value += 0.01) {
      const { count, shares } = hyperbolicCrossfade(value, 4, 0);
      const next = count === 2 ? shares[1] : value < 5.5 ? 0 : 1;
      expect(next - last).toBeLessThan(0.05);
      expect(next).toBeGreaterThanOrEqual(last);
      last = next;
    }
    expect(last).toBe(1);
  });

  it("counts pairs that give the same tiles as one pattern", () => {
    /* With 4 sides, 3 and 4 per corner both go up to 5. */
    const { count, shares } = hyperbolicCrossfade(4, 3.5, 0);
    expect(count).toBe(1);
    expect(shares[0]).toBeCloseTo(1);
  });

  it("stays inside the limits at the top of the range", () => {
    const { count, mirrors } = hyperbolicCrossfade(12, 12, 0);
    expect(count).toBe(1);
    expect(mirrors[2]).toBeCloseTo(Math.PI / 12);
    expect(mirrors.every(Number.isFinite)).toBe(true);
  });
});
