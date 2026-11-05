import { describe, expect, it } from "vitest";
import { outlineCircles, outlineCorners, outlineGlowStep, outlineTurns, snakePoint } from "./renderer";

/* The matrix of copy i, by columns, used on a point. */
const turn = (turns: Float32Array, i: number, [x, y, z]: number[]) => [0, 1, 2].map((row) => turns[i * 9 + row] * x + turns[i * 9 + 3 + row] * y + turns[i * 9 + 6 + row] * z);

describe("outlineTurns", () => {
  it("leaves a copy with no turn as it is", () => {
    /* "+ 0" makes -0 into 0. */
    expect([...outlineTurns(0, 0, 0, 0).slice(0, 9)].map((value) => value + 0)).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });

  it("turns by Spin around the upright line first, then by Tumble around the level line, each copy less by the lag", () => {
    const turns = outlineTurns(1, 0.25, 0.5, 0.1);
    const spin = 1 - 0.25 * 3;
    const tumble = 0.5 - 0.1 * 3;
    const [x, y, z] = [0.3, -0.7, 0.2];
    /* Spin about y, then tumble about x, as in OUTLINE_SHADER. */
    const sx = Math.cos(spin) * x - Math.sin(spin) * z;
    const sz = Math.sin(spin) * x + Math.cos(spin) * z;
    const expected = [sx, Math.cos(tumble) * y - Math.sin(tumble) * sz, Math.sin(tumble) * y + Math.cos(tumble) * sz];
    turn(turns, 3, [x, y, z]).forEach((value, k) => expect(value).toBeCloseTo(expected[k]));
  });
});

describe("outlineGlowStep", () => {
  it("makes a glow pixel at most a quarter of the haze across, and at most 4 pixels", () => {
    expect([2.5, 7.9, 8, 15.9, 16, 60].map(outlineGlowStep)).toEqual([1, 1, 2, 2, 4, 4]);
  });
});

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

  it("puts each copy's seen sides inside its group circles and its whole circle, also when it turns", () => {
    const eye = 2.5 * 2160;
    const radii = [2138, 1500, 400];
    for (const [spin, tumble] of [[0, 0], [4.3, 0], [2.2, 0.9]]) {
      const turns = outlineTurns(spin, 0.21, tumble, 0.1);
      for (const [shape, points, groupCount] of [[4, 5, 6], [3, 24, 6], [3, 5, 2], [1, 5, 1]]) {
        const outline = outlineCorners(shape, points, 49, 0.82, 0.5);
        const { groups, bounds } = outlineCircles(outline, radii, turns, eye, false);
        radii.forEach((r, i) => {
          /* A point a part t of the way along side k, turned and seen as project() in OUTLINE_SHADER. */
          const seen = (k: number, t: number) => {
            const [a, b] = [k % outline.count, (k + 1) % outline.count];
            const [x, y] = [0, 1].map((axis) => r * (outline.corners[a * 2 + axis] * (1 - t) + outline.corners[b * 2 + axis] * t));
            const [vx, vy, vz] = turn(turns, i, [x, y, 0]);
            return [vx * eye / (eye + vz), vy * eye / (eye + vz)];
          };
          const inside = (circle: Float32Array, at: number, [x, y]: number[]) => expect(Math.hypot(x - circle[at], y - circle[at + 1])).toBeLessThanOrEqual(circle[at + 2]);
          for (let g = 0; g < 6; g++) {
            const at = (i * 6 + g) * 3;
            expect(groups[at + 2] > 0).toBe(g < groupCount);
            for (let k = g * 8; g < groupCount && k < Math.min(g * 8 + 8, outline.sides); k++) {
              for (const t of [0, 0.3, 0.7, 1]) {
                inside(groups, at, seen(k, t));
                inside(bounds, i * 3, seen(k, t));
              }
            }
          }
        });
      }
    }
  });

  it("makes Radial a plain shape with Points sides at Inner radius 1", () => {
    const { length, at } = outlineCorners(3, 6);
    expect(length).toBeCloseTo(6);
    expect(at[2]).toBeCloseTo(1 / 6);
  });
});
