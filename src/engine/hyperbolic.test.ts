import { describe, expect, it } from "vitest";
import { hyperbolicMirror } from "./renderer";

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
