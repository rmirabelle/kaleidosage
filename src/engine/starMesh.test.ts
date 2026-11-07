import { describe, expect, it } from "vitest";
import { STAR_COUNTS, barSize, core, starKinds, starMesh } from "./starMesh";

/** Each edge of the triangles (by its two ends' places), and how many triangles have it. */
function edgeCounts(data: Float32Array) {
  const key = (i: number) => [0, 1, 2].map((k) => Math.round(data[i * 6 + k] * 1e4)).join(",");
  const counts = new Map<string, number>();
  for (let t = 0; t < data.length / 18; t++) {
    for (let side = 0; side < 3; side++) {
      const a = key(t * 3 + side);
      const b = key(t * 3 + (side + 1) % 3);
      if (a === b) continue;
      const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
      counts.set(edge, (counts.get(edge) ?? 0) + 1);
    }
  }
  return counts;
}

describe("Moravian star mesh", () => {
  it("has one face per point on each core", () => {
    expect(STAR_COUNTS.map((_, kind) => core(kind).faces.length)).toEqual([...STAR_COUNTS]);
  });

  it("turns each core as the ray-marched star does (SOLID_SHADER's STAR_N)", () => {
    const has = (kind: number, n: number[]) => core(kind).faces.some((face) => face.normal.every((x, k) => Math.abs(x - n[k]) < 1e-5));
    const a = 0.5773503;
    expect(has(0, [-a, -a, -a])).toBe(true);
    expect(has(1, [1, 0, 0])).toBe(true);
    expect(has(2, [a, a, a])).toBe(true);
    expect(has(3, [0.5257311, 0, 0.8506508])).toBe(true);
    expect(has(4, [0.7071068, 0.7071068, 0]) || has(4, [1, 0, 0])).toBe(true);
    expect(has(5, [0, 0.3568221, 0.9341724])).toBe(true);
    expect(has(6, [0.7071068, 0.7071068, 0]) && has(6, [a, a, a])).toBe(true);
    expect(has(7, [0.5257311, 0, 0.8506508]) && has(7, [0, 0.3568221, 0.9341724])).toBe(true);
  });

  it("is closed when solid: every edge belongs to two triangles", () => {
    for (let kind = 0; kind < 8; kind++) {
      for (const length of [0, 0.6, 1]) {
        const counts = edgeCounts(starMesh(kind, length, 0));
        expect([...counts.values()].every((count) => count === 2)).toBe(true);
      }
    }
  });

  it("is closed when hollow with full points: the bars have no open sides", () => {
    for (let kind = 0; kind < 8; kind++) {
      for (const hollow of [0.4, 1]) {
        const counts = edgeCounts(starMesh(kind, 0.8, hollow));
        expect([...counts.values()].every((count) => count % 2 === 0)).toBe(true);
      }
    }
  });

  it("thins the bars toward Hollow 1, and turns the windows over below 0", () => {
    const span = (data: Float32Array) => data.length;
    expect(span(starMesh(6, 0.6, 0))).toBeLessThan(span(starMesh(6, 0.6, 0.5)));
    expect(span(starMesh(6, 0.6, -0.5))).toBeGreaterThan(span(starMesh(6, 0.6, 0)));
    expect(barSize(1, 0.2).width).toBeCloseTo(0.012);
    expect(barSize(0, 0.2).width).toBe(0);
    expect(barSize(1e-6, 0.2).width).toBeCloseTo(0.2, 3);
    expect(barSize(-1, 0.2).width).toBeCloseTo(0.85);
    expect(barSize(-1, 0.2).over).toBe(true);
  });

  it("stays inside the tips' reach", () => {
    for (let kind = 0; kind < 8; kind++) {
      const data = starMesh(kind, 1, 1);
      for (let i = 0; i < data.length; i += 6) expect(Math.hypot(data[i], data[i + 1], data[i + 2])).toBeLessThanOrEqual(1.25 + 1e-5);
    }
  });

  it("fades between two cores between counts", () => {
    expect(starKinds(26)).toEqual([{ kind: 6, weight: 1 }]);
    expect(starKinds(32)).toEqual([{ kind: 7, weight: 1 }]);
    const between = starKinds(10);
    expect(between.map((each) => each.kind)).toEqual([2, 3]);
    expect(between[0].weight + between[1].weight).toBeCloseTo(1);
  });
});
