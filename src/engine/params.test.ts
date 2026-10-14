import { describe, expect, it } from "vitest";
import { GROUP_PARAMS, PARAM_KEYS, createParams, createPlayState, defaultValue, fullRange, hexToRgb, hslToHex, liveValue, NO_EFFECT, randomizeParams, resetEffects, setCustomTime, startRangeAt } from "./params";

/** A play state at this many seconds, on both clocks: animation time (the shared cycle) and real time (custom ranges). */
const at = (time: number) => ({ ...createPlayState(), time, clock: time });

describe("liveValue", () => {
  it("returns the slider value when drift is off", () => {
    const params = createParams();
    params.zoom.on = false;
    params.zoom.value = 2.5;
    expect(liveValue(params.zoom, at(12.3))).toBe(2.5);
  });

  it("keeps a drifting value inside its range and reaches both ends", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1, high: 2, custom: true, seconds: 1 });
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

  it("starts every drift at its start handle at time 0", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1.7, high: 0.9 });
    Object.assign(params.rotation, { on: true, low: 90, high: 180 });
    Object.assign(params.lightAngle, { on: true, low: 360, high: 0, custom: true, seconds: 7 });
    expect(liveValue(params.zoom, at(0))).toBeCloseTo(1.7);
    expect(liveValue(params.rotation, at(0))).toBeCloseTo(90);
    expect(liveValue(params.lightAngle, at(0))).toBeCloseTo(360);
  });

  it("moves a reversed arc from its start toward its end at a steady speed", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 355, high: 5, custom: true, seconds: 35 });
    expect(liveValue(params.rotation, at(0))).toBeCloseTo(355);
    expect(liveValue(params.rotation, at(1))).toBeCloseTo(345);
    expect(liveValue(params.rotation, at(35))).toBeCloseTo(5);
    expect(liveValue(params.rotation, at(36))).toBeCloseTo(15);
  });

  it("starts a range at its start handle from any time", () => {
    const params = createParams();
    Object.assign(params.imageBlend, { on: true, low: 0, high: 1 });
    startRangeAt(params.imageBlend, 123.4);
    expect(liveValue(params.imageBlend, at(123.4))).toBeCloseTo(0);
    expect(liveValue(params.imageBlend, at(125))).toBeGreaterThan(0);
  });

  it("follows the chosen easing between the handles, starting at the start handle", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease: "linear" });
    startRangeAt(params.zoom, 10);
    expect(liveValue(params.zoom, at(10))).toBeCloseTo(1);
    expect(liveValue(params.zoom, at(11))).toBeCloseTo(1.5);
    expect(liveValue(params.zoom, at(12))).toBeCloseTo(2);
    expect(liveValue(params.zoom, at(13))).toBeCloseTo(1.5);
    params.zoom.ease = "in";
    expect(liveValue(params.zoom, at(11))).toBeCloseTo(1.125);
    params.zoom.ease = "bounce";
    for (let time = 10; time < 20; time += 0.05) {
      const value = liveValue(params.zoom, at(time));
      expect(value).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(value).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it("turns without stopping over the full circle", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 0, high: 360, custom: true, seconds: 36, value: 0 });
    expect(liveValue(params.rotation, at(5))).toBeCloseTo(50);
    expect(liveValue(params.rotation, at(37))).toBeCloseTo(10);
  });

  it("swings inside a partial arc", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 90, high: 180, custom: true, seconds: 3 });
    for (let time = 0; time < 30; time += 0.1) {
      const value = liveValue(params.rotation, at(time));
      expect(value).toBeGreaterThanOrEqual(90);
      expect(value).toBeLessThanOrEqual(180);
    }
  });

  it("keeps a reversed back-and-forth range inside its limits", () => {
    const params = createParams();
    Object.assign(params.panX, { on: true, low: 0.5, high: -0.5 });
    for (let time = 0; time < 30; time += 0.1) {
      const value = liveValue(params.panX, at(time));
      expect(value).toBeGreaterThanOrEqual(-0.5);
      expect(value).toBeLessThanOrEqual(0.5);
    }
  });

  it("turns backward over a reversed full circle", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 360, high: 0, custom: true, seconds: 36, value: 0 });
    expect(liveValue(params.rotation, at(5))).toBeCloseTo(310);
    expect(liveValue(params.rotation, at(37))).toBeCloseTo(350);
  });
});

describe("range timing", () => {
  it("moves every range on the shared cycle together", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1, high: 2, ease: "linear" });
    Object.assign(params.panX, { on: true, low: -0.3, high: 0.3, ease: "linear" });
    for (const [time, zoom, panX] of [[0, 1, -0.3], [10, 1.5, 0], [20, 2, 0.3], [30, 1.5, 0], [40, 1, -0.3]]) {
      expect(liveValue(params.zoom, at(time))).toBeCloseTo(zoom);
      expect(liveValue(params.panX, at(time))).toBeCloseTo(panX);
    }
  });

  it("turns a whole-circle angle once per shared cycle", () => {
    const params = createParams();
    Object.assign(params.rotation, { on: true, low: 0, high: 360 });
    expect(liveValue(params.rotation, at(5))).toBeCloseTo(90);
    Object.assign(params.rotation, { low: 360, high: 0 });
    expect(liveValue(params.rotation, at(5))).toBeCloseTo(270);
  });

  it("keeps the value where it is when a range gets its own time, then rejoins the cycle", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 0.8, high: 3 });
    const state = { ...createPlayState(), time: 13, clock: 7 };
    const before = liveValue(params.zoom, state);
    setCustomTime(params.zoom, 4, state);
    expect(liveValue(params.zoom, state)).toBeCloseTo(before);
    setCustomTime(params.zoom, 9, state);
    expect(liveValue(params.zoom, state)).toBeCloseTo(before);
    /* Two trips of its own time later, it is back where it was. */
    expect(liveValue(params.zoom, { ...state, clock: 25 })).toBeCloseTo(before);
    setCustomTime(params.zoom, null, state);
    expect(params.zoom.custom).toBe(false);
    expect(liveValue(params.zoom, { ...state, time: 0 })).toBeCloseTo(0.8);
  });

  it("moves a custom range on the real clock, so the cycle does not change it", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1, high: 2, ease: "linear", custom: true, seconds: 5 });
    expect(liveValue(params.zoom, { ...createPlayState(), time: 999, clock: 5 })).toBeCloseTo(2);
  });
});

describe("no-effect values", () => {
  it("are inside their sliders, not at an end", () => {
    const params = createParams();
    for (const [key, value] of Object.entries(NO_EFFECT) as [keyof typeof params, number][]) {
      expect(value, key).toBeGreaterThan(params[key].min);
      expect(value, key).toBeLessThan(params[key].max);
    }
  });
});

describe("double-click resets", () => {
  it("give each value its start-up default", () => {
    expect(defaultValue("segments")).toBe(0);
    expect(defaultValue("panX")).toBe(0);
  });

  it("widen a range to the full span and keep its direction", () => {
    const params = createParams();
    Object.assign(params.zoom, { low: 1, high: 2 });
    expect(fullRange(params.zoom)).toEqual([params.zoom.min, params.zoom.max]);
    Object.assign(params.zoom, { low: 2, high: 1 });
    expect(fullRange(params.zoom)).toEqual([params.zoom.max, params.zoom.min]);
  });
});

describe("overlay colors", () => {
  it("read #rrggbb and make it from hue, saturation and lightness", () => {
    expect(hexToRgb("#ff8000")).toEqual([1, 128 / 255, 0]);
    expect(hexToRgb("not a color")).toEqual([0, 0, 0]);
    expect(hslToHex(0, 1, 0.5)).toBe("#ff0000");
    expect(hslToHex(120, 1, 0.5)).toBe("#00ff00");
    expect(hslToHex(240, 1, 0.25)).toBe("#000080");
  });
});

describe("resetEffects", () => {
  it("turns every unlocked effect off, and leaves locked groups and the image blend", () => {
    const params = createParams();
    const state = createPlayState();
    randomizeParams(params, state);
    Object.assign(params.imageBlend, { value: 0.4, on: true });
    state.locks.trails = true;
    const trails = JSON.stringify(params.trailAmount);
    resetEffects(params, state);
    expect(params.zoom).toMatchObject({ value: defaultValue("zoom"), on: false });
    expect(params.rotation.on).toBe(false);
    expect(state.groups).toMatchObject({ warp: false, kaleidoscope: false, finish: false, trails: true, source: true });
    expect(JSON.stringify(params.trailAmount)).toBe(trails);
    expect(params.imageBlend).toMatchObject({ value: 0.4, on: true });
  });
});

describe("randomizeParams", () => {
  it("leaves locked groups as they were", () => {
    for (let run = 0; run < 50; run++) {
      const params = createParams();
      const state = createPlayState();
      state.locks.kaleidoscope = true;
      state.locks.map = true;
      state.locks.finish = true;
      const before = JSON.stringify({ zoom: params.zoom, segments: params.segments, mapPower: params.mapPower, sharpen: params.sharpen });
      const stateBefore = { map: state.groups.map, mapMode: state.mapMode, overlayColor: state.overlayColor };
      randomizeParams(params, state);
      expect(JSON.stringify({ zoom: params.zoom, segments: params.segments, mapPower: params.mapPower, sharpen: params.sharpen })).toBe(before);
      expect({ map: state.groups.map, mapMode: state.mapMode, overlayColor: state.overlayColor }).toEqual(stateBefore);
    }
  });

  it("starts a range at 0 when the value is 0, and moves away from it", () => {
    for (let run = 0; run < 200; run++) {
      const params = createParams();
      randomizeParams(params);
      for (const key of ["twirl", "trailHue", "exposure", "overlayOpacity", "blackLevel"] as const) {
        const param = params[key];
        if (param.value !== 0) continue;
        expect(param.low).toBe(0);
        if (param.min >= 0) expect(param.high).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it("puts every parameter in exactly one group", () => {
    const grouped = Object.values(GROUP_PARAMS).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped].sort()).toEqual([...PARAM_KEYS].sort());
  });

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

