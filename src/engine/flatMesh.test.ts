import { describe, expect, it } from "vitest";
import { flatMesh } from "./flatMesh";

describe("flat-faced shape meshes", () => {
  it("cover each shape's faces: 6, 8, 20 and 5 face directions", () => {
    const faces = [1, 6, 7, 8].map((shape) => {
      const data = flatMesh(shape);
      return new Set(Array.from({ length: data.length / 9 }, (_, i) => [3, 4, 5].map((k) => Math.round(data[i * 9 + k] * 1e4)).join(","))).size;
    });
    expect(faces).toEqual([6, 8, 20, 5]);
  });

  it("are closed: every edge belongs to two triangles", () => {
    for (const shape of [1, 6, 7, 8]) {
      const data = flatMesh(shape);
      const key = (i: number) => [0, 1, 2].map((k) => Math.round(data[i * 9 + k] * 1e4)).join(",");
      const counts = new Map<string, number>();
      for (let t = 0; t < data.length / 27; t++) {
        for (let side = 0; side < 3; side++) {
          const a = key(t * 3 + side);
          const b = key(t * 3 + (side + 1) % 3);
          if (a === b) continue;
          const edge = a < b ? `${a}|${b}` : `${b}|${a}`;
          counts.set(edge, (counts.get(edge) ?? 0) + 1);
        }
      }
      expect([...counts.values()].every((count) => count === 2)).toBe(true);
    }
  });

  it("puts every point on its own face's plane", () => {
    const offsets: Record<number, number> = { 1: 0.8, 6: 0.62, 7: 0.82 };
    for (const shape of [1, 6, 7]) {
      const data = flatMesh(shape);
      for (let i = 0; i < data.length; i += 9) {
        const d = data[i] * data[i + 3] + data[i + 1] * data[i + 4] + data[i + 2] * data[i + 5];
        expect(d).toBeCloseTo(offsets[shape], 4);
      }
    }
  });
});
