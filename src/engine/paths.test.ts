import { describe, expect, it } from "vitest";
import { INSTANCE_FLOATS } from "./cycles";
import { createParams, createPlayState } from "./params";
import { MAX_PATH_ARMS, MAX_PATH_STEPS, PATH_PRESETS, applyPathPreset, pathSegments, writePathInstances, type PathSettings } from "./paths";

const QUARTER = Math.PI / 2;
const base: PathSettings = { shape: 1, arms: 1, steps: 4, step: 1, turn: QUARTER, radius: 0, width: 0.01, draw: 1, fade: 0, hue: 0, rainbow: 0, rotation: 0, x: 0, y: 0 };
const instances = (settings: Partial<PathSettings>, max = 20000) => {
  const out = new Float32Array(max * INSTANCE_FLOATS);
  return { out, count: writePathInstances(out, max, { ...base, ...settings }) };
};
/** The place at the end of the given line. */
const end = (out: Float32Array, line: number) => [out[line * INSTANCE_FLOATS + 2], out[line * INSTANCE_FLOATS + 3]];

describe("Light Paths", () => {
  it("draws one line per step on every arm", () => {
    expect(instances({ arms: 7, steps: 9 }).count).toBe(63);
  });

  it("makes a square wave at 90 degrees", () => {
    const { out } = instances({});
    expect(end(out, 0)[0]).toBeCloseTo(1);
    expect(end(out, 0)[1]).toBeCloseTo(0);
    expect(end(out, 1)[0]).toBeCloseTo(1);
    expect(end(out, 1)[1]).toBeCloseTo(1);
    expect(end(out, 2)[0]).toBeCloseTo(2);
    expect(end(out, 2)[1]).toBeCloseTo(1);
    expect(end(out, 3)[0]).toBeCloseTo(2);
    expect(end(out, 3)[1]).toBeCloseTo(0);
  });

  it("makes each Greek key period go 6 lengths straight out", () => {
    const { out } = instances({ shape: 2, steps: 20 });
    expect(end(out, 9)[0]).toBeCloseTo(6);
    expect(end(out, 9)[1]).toBeCloseTo(0);
    expect(end(out, 19)[0]).toBeCloseTo(12);
    expect(end(out, 19)[1]).toBeCloseTo(0);
  });

  it("keeps a zigzag straight out on average at any angle", () => {
    const { out } = instances({ shape: 0, steps: 2, turn: 1 });
    expect(end(out, 1)[1]).toBeCloseTo(0);
    expect(end(out, 1)[0]).toBeGreaterThan(0);
  });

  it("makes the circuit path end level, so its next round goes on outward", () => {
    const { out } = instances({ shape: 5, steps: 48, turn: QUARTER });
    expect(end(out, 47)[0]).toBeGreaterThan(0);
  });

  it("turns every arm around the center", () => {
    const { out } = instances({ arms: 4, steps: 1, radius: 1, x: 5, y: 3 });
    expect(end(out, 1)[0]).toBeCloseTo(5);
    expect(end(out, 1)[1]).toBeCloseTo(5);
  });

  it("stops part of the way along the last line with Draw", () => {
    const half = instances({ steps: 4, draw: 0.625 });
    expect(half.count).toBe(3);
    expect(end(half.out, 2)[0]).toBeCloseTo(1.5);
    expect(instances({ draw: 0 }).count).toBe(0);
  });

  it("fades toward the far end", () => {
    const { out } = instances({ steps: 2, fade: 1 });
    expect(out[7]).toBeCloseTo(1);
    expect(out[INSTANCE_FLOATS + 11]).toBeCloseTo(0);
  });

  it("goes around the color wheel with Rainbow", () => {
    const { out } = instances({ steps: 2, rainbow: 0.5 });
    expect([out[4], out[5], out[6]]).toEqual([1, 0, 0]);
    expect(out[INSTANCE_FLOATS + 8]).toBeCloseTo(0);
    expect(out[INSTANCE_FLOATS + 9]).toBeCloseTo(1);
    expect(out[INSTANCE_FLOATS + 10]).toBeCloseTo(1);
  });

  it("stops at the limit it is given", () => {
    expect(instances({ arms: 10, steps: 10 }, 7).count).toBe(7);
  });

  it("counts lines inside the sliders' limits", () => {
    expect(pathSegments(1000, 1000)).toBe(MAX_PATH_ARMS * MAX_PATH_STEPS);
    expect(pathSegments(0, 0)).toBe(1);
  });

  it("has only presets inside the sliders' limits", () => {
    const params = createParams();
    for (const { values } of PATH_PRESETS) {
      for (const [key, given] of Object.entries(values)) {
        const { min, max } = params[key as keyof typeof params];
        for (const value of [given].flat()) {
          expect(value).toBeGreaterThanOrEqual(min);
          expect(value).toBeLessThanOrEqual(max);
        }
      }
    }
  });

  it("applies a preset, with its ranges playing and its other settings at their defaults", () => {
    const params = createParams();
    const state = createPlayState();
    params.pathRotation.value = 123;
    params.pathAmount.value = 0.4;
    applyPathPreset(params, state, PATH_PRESETS[4], createParams());
    expect(state.pathShape).toBe(0);
    expect(params.pathArms.value).toBe(36);
    expect(params.pathTurn).toMatchObject({ low: 40, high: 120, on: true });
    expect(params.pathRotation.value).toBe(0);
    expect(params.pathAmount.value).toBe(0.4);
  });
});
