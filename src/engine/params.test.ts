import { describe, expect, it } from "vitest";
import { createParams, createPlayState, liveValue, randomizeParams } from "./params";

const at = (time: number) => ({ ...createPlayState(), time });

describe("liveValue", () => {
  it("returns the slider value when drift is off", () => {
    const params = createParams();
    params.zoom.on = false;
    params.zoom.value = 2.5;
    expect(liveValue(params.zoom, at(12.3))).toBe(2.5);
  });

  it("keeps a drifting value inside its range and reaches both ends", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1, high: 2, rate: 0.5 });
    let lowest = Infinity;
    let highest = -Infinity;
    for (let time = 0; time < 60; time += 0.01) {
      const value = liveValue(params.zoom, at(time));
      lowest = Math.min(lowest, value);
      highest = Math.max(highest, value);
    }
    expect(lowest).toBeGreaterThanOrEqual(1);
    expect(highest).toBeLessThanOrEqual(2);
    expect(lowest).toBeLessThan(1.01);
    expect(highest).toBeGreaterThan(1.99);
  });

  it("starts every drift at its range minimum at time 0", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1.7, high: 0.9 });
    Object.assign(params.rotation, { on: true, low: 90, high: 180 });
    Object.assign(params.hue, { on: true, low: 360, high: 0 });
    expect(liveValue(params.zoom, at(0))).toBeCloseTo(0.9);
    expect(liveValue(params.rotation, at(0))).toBeCloseTo(90);
    expect(liveValue(params.hue, at(0)) % 360).toBeCloseTo(0);
  });

  it("turns without stopping over the full circle", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 0, high: 360, rate: 10, value: 0 });
    expect(liveValue(params.rotation, at(5))).toBeCloseTo(50);
    expect(liveValue(params.rotation, at(37))).toBeCloseTo(10);
  });

  it("swings inside a partial arc", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 90, high: 180, rate: 30 });
    for (let time = 0; time < 30; time += 0.1) {
      const value = liveValue(params.rotation, at(time));
      expect(value).toBeGreaterThanOrEqual(90);
      expect(value).toBeLessThanOrEqual(180);
    }
  });

  it("keeps a reversed back-and-forth range inside its limits", () => {
    const params = createParams();
    Object.assign(params.panX, { on: true, low: 0.5, high: -0.5, rate: 0.1 });
    for (let time = 0; time < 30; time += 0.1) {
      const value = liveValue(params.panX, at(time));
      expect(value).toBeGreaterThanOrEqual(-0.5);
      expect(value).toBeLessThanOrEqual(0.5);
    }
  });

  it("turns backward over a reversed full circle", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 360, high: 0, rate: 10, value: 0 });
    expect(liveValue(params.rotation, at(5))).toBeCloseTo(310);
  });
});

describe("randomizeParams", () => {
  it("keeps every value and range inside the limits", () => {
    for (let run = 0; run < 200; run++) {
      const params = createParams();
      randomizeParams(params);
      for (const param of Object.values(params)) {
        expect(param.value).toBeGreaterThanOrEqual(param.min);
        expect(param.value).toBeLessThanOrEqual(param.max);
        if (!param.drift) continue;
        for (const end of [param.low!, param.high!]) {
          expect(end).toBeGreaterThanOrEqual(param.min);
          expect(end).toBeLessThanOrEqual(param.max);
        }
      }
    }
  });
});
