import { describe, expect, it } from "vitest";
import { INSTANCE_FLOATS } from "./cycles";
import { addSpiroWheel, createParams, createPlayState, removeSpiroWheel } from "./params";
import { applyScene, serializeScene } from "./scene";
import { SPIRO_SHAPE_VALUES, spiroLine, spiroOutline, spiroSegments, spiroTurns, writeSpiroInstances, type SpiroSettings, type SpiroWheel } from "./spiro";

const circle: SpiroWheel = { shape: 0, teeth: 52, x: 0.7, y: 0, color: "#ff0000" };
const base: SpiroSettings = { wheels: [circle], ring: 96, size: 1, width: 0.01, draw: 1, rotation: 0, yaw: 0, tilt: 0, x: 0, y: 0 };
const instances = (settings: Partial<SpiroSettings>, max = 100000) => {
  const out = new Float32Array(max * INSTANCE_FLOATS);
  return { out, count: writeSpiroInstances(out, max, { ...base, ...settings }) };
};

describe("Spirograph", () => {
  it("closes after ring / gcd turns of the wheel", () => {
    expect(spiroTurns(96, 52)).toBe(24);
    expect(spiroTurns(96, 48)).toBe(2);
    expect(spiroTurns(105, 63)).toBe(5);
  });

  it("gives the known curve for a round wheel", () => {
    /* The wheel's center goes around at 1 - a, and the pen is d from it; the pen starts at the ring's side. */
    const a = 52 / 96;
    const d = 0.7 * a;
    const line = spiroLine(circle, 96);
    expect(line[0]).toBeCloseTo(1 - a + d, 3);
    expect(line[1]).toBeCloseTo(0, 3);
    let nearest = Infinity;
    let farthest = 0;
    for (let i = 0; i < line.length; i += 2) {
      const reach = Math.hypot(line[i], line[i + 1]);
      nearest = Math.min(nearest, reach);
      farthest = Math.max(farthest, reach);
    }
    expect(farthest).toBeCloseTo(1 - a + d, 3);
    expect(nearest).toBeCloseTo(Math.abs(1 - a - d), 3);
  });

  it("draws a circle when the hole is at the center of a round wheel", () => {
    const line = spiroLine({ ...circle, x: 0 }, 96);
    for (let i = 0; i < line.length; i += 2) expect(Math.hypot(line[i], line[i + 1])).toBeCloseTo(1 - 52 / 96, 3);
  });

  it("closes the line of every shape, with no jump between points", () => {
    for (const shape of SPIRO_SHAPE_VALUES) {
      const line = spiroLine({ shape, teeth: 40, x: 0.3, y: 0.4, color: "#ffffff" }, 96);
      const points = line.length / 2;
      expect(points).toBeGreaterThan(100);
      for (let i = 0; i < line.length; i++) expect(Number.isFinite(line[i])).toBe(true);
      let longest = 0;
      for (let i = 1; i < points; i++) longest = Math.max(longest, Math.hypot(line[i * 2] - line[i * 2 - 2], line[i * 2 + 1] - line[i * 2 - 1]));
      expect(longest).toBeLessThan(0.08);
    }
  });

  it("keeps every wheel's farthest point 1 from its center", () => {
    for (const shape of SPIRO_SHAPE_VALUES) {
      const outline = spiroOutline(shape);
      let farthest = 0;
      for (let i = 0; i < outline.length; i += 2) farthest = Math.max(farthest, Math.hypot(outline[i], outline[i + 1]));
      expect(farthest).toBeCloseTo(1, 3);
    }
  });

  it("writes one line between each two points, for every wheel", () => {
    const wheels = [circle, { ...circle, teeth: 63, shape: 5 as const }];
    expect(instances({ wheels }).count).toBe(spiroSegments(wheels, 96));
  });

  it("shows only a part of each line with Draw", () => {
    const all = instances({}).count;
    expect(instances({ draw: 0 }).count).toBe(0);
    expect(instances({ draw: 0.5 }).count).toBe(Math.ceil(all / 2));
  });

  it("stops at the most lines there is room for", () => {
    expect(instances({}, 10).count).toBe(10);
  });

  it("gives the same line for a hole that moved as for a new wheel", () => {
    const first = spiroLine({ shape: 3, teeth: 40, x: 0.1, y: 0.2, color: "#ffffff" }, 96);
    const moved = spiroLine({ shape: 3, teeth: 40, x: -0.6, y: 0.5, color: "#ffffff" }, 96);
    expect(moved.length).toBe(first.length);
    /* The triangle's first corner is straight up, at 1; the wheel starts with that corner on the ring's right side. */
    expect(Math.hypot(moved[0] - first[0], moved[1] - first[1])).toBeGreaterThan(0.1);
  });

  it("moves the later wheels' hole sliders up when a wheel is removed", () => {
    const params = createParams();
    const state = createPlayState();
    expect(addSpiroWheel(params, state, { shape: 5, teeth: 30, color: "#00ff00" })).toBe(true);
    Object.assign(params.spiroHoleX3, { value: -0.4, low: -0.8, high: 0.1, on: true });
    params.spiroHoleY2.value = 0.3;
    removeSpiroWheel(params, state, 0);
    expect(state.spiroWheels.map((wheel) => wheel.teeth)).toEqual([63, 30]);
    expect(params.spiroHoleY1.value).toBe(0.3);
    expect(params.spiroHoleX2).toMatchObject({ value: -0.4, low: -0.8, high: 0.1, on: true });
    expect(params.spiroHoleX3).toMatchObject({ value: 0.6, on: false });
    removeSpiroWheel(params, state, 0);
    removeSpiroWheel(params, state, 0);
    expect(state.spiroWheels).toHaveLength(1);
  });

  it("reads the holes of a scene from before the hole sliders", () => {
    const params = createParams();
    const state = createPlayState();
    const scene = JSON.parse(serializeScene(params, state, { image: { type: "image/png", data: "iVBORw0KGgo=" } }));
    scene.state.spiroWheels = [{ shape: 1, teeth: 44, x: -0.25, y: 0.5, color: "#123456" }];
    for (const key of ["spiroHoleX1", "spiroHoleY1"]) delete scene.params[key];
    applyScene(JSON.stringify(scene), params, state);
    expect(state.spiroWheels).toEqual([{ shape: 1, teeth: 44, color: "#123456" }]);
    expect(params.spiroHoleX1.value).toBe(-0.25);
    expect(params.spiroHoleY1.value).toBe(0.5);
  });

  it("gives each wheel its color and the size of the ring", () => {
    const { out } = instances({ size: 0.25, x: 2, y: 3 });
    expect(out[0]).toBeCloseTo(2 + 0.25 * (1 - 52 / 96 + 0.7 * 52 / 96), 3);
    expect(out[1]).toBeCloseTo(3, 3);
    expect([out[4], out[5], out[6], out[7]]).toEqual([1, 0, 0, 1]);
  });
});
