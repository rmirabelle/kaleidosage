import { describe, expect, it } from "vitest";
import { GROUP_PARAMS, PARAM_KEYS, applyRadialStart, createParams, gradientColorAt, rgbToHex, createPlayState, defaultValue, fullRange, NUDGE, hexToRgb, hslToHex, liveValue, NO_EFFECT, nudgeParams, randomizeGroup, randomizeParams, resetEffects, setCustomTime, startRangeAt, withKindOrder, openRange, addEffect, removeEffect, toSlider, fromSlider, SLIDER_STEPS } from "./params";

/** A play state at this many seconds, on both clocks: animation time (the shared cycle) and real time (custom ranges). */
const at = (time: number) => ({ ...createPlayState(), time, clock: time });

describe("liveValue", () => {
  it("returns the slider value when drift is off", () => {
    const params = createParams();
    params.mapPower.on = false;
    params.mapPower.value = 2.5;
    expect(liveValue(params.mapPower, at(12.3))).toBe(2.5);
  });

  it("keeps a drifting value inside its range and reaches both ends", () => {
    const params = createParams();
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, custom: true, seconds: 1 });
    let lowest = Infinity;
    let highest = -Infinity;
    for (let time = 0; time < 60; time += 0.01) {
      const value = liveValue(params.mapPower, at(time));
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
    Object.assign(params.mapPower, { on: true, low: 1.7, high: 0.9 });
    Object.assign(params.rotation, { on: true, low: 90, high: 180 });
    Object.assign(params.lightAngle, { on: true, low: 360, high: 0, custom: true, seconds: 7 });
    expect(liveValue(params.mapPower, at(0))).toBeCloseTo(1.7);
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
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease: "linear" });
    startRangeAt(params.mapPower, 10);
    expect(liveValue(params.mapPower, at(10))).toBeCloseTo(1);
    expect(liveValue(params.mapPower, at(11))).toBeCloseTo(1.5);
    expect(liveValue(params.mapPower, at(12))).toBeCloseTo(2);
    expect(liveValue(params.mapPower, at(13))).toBeCloseTo(1.5);
    params.mapPower.ease = "in";
    expect(liveValue(params.mapPower, at(11))).toBeCloseTo(1.125);
    params.mapPower.ease = "bounce";
    for (let time = 10; time < 20; time += 0.05) {
      const value = liveValue(params.mapPower, at(time));
      expect(value).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(value).toBeLessThanOrEqual(2 + 1e-9);
    }
  });

  it("moves early or late in the trip on a smooth curve, and waits at a handle for the other half", () => {
    const params = createParams();
    /* Two seconds from start to end: the trip out runs from 10 to 12, the trip back from 12 to 14. */
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease: "early" });
    startRangeAt(params.mapPower, 10);
    expect(liveValue(params.mapPower, at(10))).toBeCloseTo(1);
    expect(liveValue(params.mapPower, at(10.5))).toBeCloseTo(1.5);
    expect(liveValue(params.mapPower, at(11))).toBeCloseTo(2);
    expect(liveValue(params.mapPower, at(11.6))).toBeCloseTo(2);
    expect(liveValue(params.mapPower, at(13.5))).toBeCloseTo(1.5);
    params.mapPower.ease = "late";
    expect(liveValue(params.mapPower, at(10.6))).toBeCloseTo(1);
    expect(liveValue(params.mapPower, at(11))).toBeCloseTo(1);
    expect(liveValue(params.mapPower, at(11.5))).toBeCloseTo(1.5);
    expect(liveValue(params.mapPower, at(12))).toBeCloseTo(2);
    expect(liveValue(params.mapPower, at(12.5))).toBeCloseTo(1.5);
    /* No jumps: the curve is smooth on both sides of the half. */
    for (const ease of ["early", "late"] as const) {
      params.mapPower.ease = ease;
      for (let time = 10.01; time <= 14; time += 0.01) {
        expect(Math.abs(liveValue(params.mapPower, at(time)) - liveValue(params.mapPower, at(time - 0.01)))).toBeLessThan(0.02);
      }
    }
  });

  it("wanders inside the range on the random and drunk curves, the same way each time, and never repeats", () => {
    for (const ease of ["random", "drunk"] as const) {
      const params = createParams();
      Object.assign(params.mapPower, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease });
      startRangeAt(params.mapPower, 10);
      const values: number[] = [];
      for (let time = 10; time <= 30; time += 0.01) values.push(liveValue(params.mapPower, at(time)));
      for (const value of values) {
        expect(value).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(value).toBeLessThanOrEqual(2 + 1e-9);
      }
      /* Fast, but with no jumps. */
      for (let time = 10.0001; time < 12; time += 0.0001) {
        expect(Math.abs(liveValue(params.mapPower, at(time)) - liveValue(params.mapPower, at(time - 0.0001)))).toBeLessThan(0.02);
      }
      /* It uses most of the range, and the trip out and the trip back differ. */
      expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.5);
      expect(liveValue(params.mapPower, at(11))).not.toBeCloseTo(liveValue(params.mapPower, at(13)), 3);
      /* The same time gives the same value, but another parameter takes another path. */
      expect(liveValue(params.mapPower, at(17.3))).toBeCloseTo(values[730], 9);
      const other = createParams().warpScale;
      Object.assign(other, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease });
      startRangeAt(other, 10);
      expect(liveValue(other, at(17.3))).not.toBeCloseTo(values[730], 3);
    }
  });

  it("explodes from the start handle to the end handle and falls back, once per trip, inside the range", () => {
    const params = createParams();
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease: "explode" });
    startRangeAt(params.mapPower, 10);
    /* At the start handle at the start of every trip, out and back alike; at the end handle a moment later. */
    for (const time of [10, 12, 14, 16]) {
      expect(liveValue(params.mapPower, at(time))).toBeCloseTo(1);
      expect(liveValue(params.mapPower, at(time + 0.06))).toBeCloseTo(2);
    }
    /* One peak: the value only rises until the peak, then only falls, and stays between the handles. */
    for (let time = 10.01; time <= 14; time += 0.01) {
      const previous = liveValue(params.mapPower, at(time - 0.01));
      const value = liveValue(params.mapPower, at(time));
      expect(value).toBeGreaterThanOrEqual(1 - 1e-9);
      expect(value).toBeLessThanOrEqual(2 + 1e-9);
      const sinceTrip = (time - 10) % 2;
      if (sinceTrip > 0.07 && sinceTrip < 1.99) expect(value).toBeLessThanOrEqual(previous + 1e-9);
    }
    /* The fall is fast at first and slower later: more than half the way back in the first fifth of the trip. */
    expect(liveValue(params.mapPower, at(10.4))).toBeLessThan(1.5);
    expect(liveValue(params.mapPower, at(11.4))).toBeLessThan(1.1);
  });

  it("implodes: a slow build to the end handle, then a snap back to the start", () => {
    const params = createParams();
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, custom: true, seconds: 2, ease: "implode" });
    startRangeAt(params.mapPower, 10);
    expect(liveValue(params.mapPower, at(10))).toBeCloseTo(1);
    expect(liveValue(params.mapPower, at(11.94))).toBeCloseTo(2);
    expect(liveValue(params.mapPower, at(12))).toBeCloseTo(1);
    expect(liveValue(params.mapPower, at(13.94))).toBeCloseTo(2);
    for (let time = 10.01; time < 11.94; time += 0.01) {
      expect(liveValue(params.mapPower, at(time))).toBeGreaterThanOrEqual(liveValue(params.mapPower, at(time - 0.01)) - 1e-9);
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
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, ease: "linear" });
    Object.assign(params.panX, { on: true, low: -0.3, high: 0.3, ease: "linear" });
    for (const [time, zoom, panX] of [[0, 1, -0.3], [10, 1.5, 0], [20, 2, 0.3], [30, 1.5, 0], [40, 1, -0.3]]) {
      expect(liveValue(params.mapPower, at(time))).toBeCloseTo(zoom);
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
    Object.assign(params.mapPower, { on: true, low: 0.8, high: 3 });
    const state = { ...createPlayState(), time: 13, clock: 7 };
    const before = liveValue(params.mapPower, state);
    setCustomTime(params.mapPower, 4, state);
    expect(liveValue(params.mapPower, state)).toBeCloseTo(before);
    setCustomTime(params.mapPower, 9, state);
    expect(liveValue(params.mapPower, state)).toBeCloseTo(before);
    /* Two trips of its own time later, it is back where it was. */
    expect(liveValue(params.mapPower, { ...state, clock: 25 })).toBeCloseTo(before);
    setCustomTime(params.mapPower, null, state);
    expect(params.mapPower.custom).toBe(false);
    expect(liveValue(params.mapPower, { ...state, time: 0 })).toBeCloseTo(0.8);
  });

  it("moves a custom range on the real clock, so the cycle does not change it", () => {
    const params = createParams();
    Object.assign(params.mapPower, { on: true, low: 1, high: 2, ease: "linear", custom: true, seconds: 5 });
    expect(liveValue(params.mapPower, { ...createPlayState(), time: 999, clock: 5 })).toBeCloseTo(2);
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
    Object.assign(params.mapPower, { low: 1, high: 2 });
    expect(fullRange(params.mapPower)).toEqual([params.mapPower.min, params.mapPower.max]);
    Object.assign(params.mapPower, { low: 2, high: 1 });
    expect(fullRange(params.mapPower)).toEqual([params.mapPower.max, params.mapPower.min]);
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

describe("gradientColorAt", () => {
  it("mixes the two stops around a place, and keeps the end colors past the ends", () => {
    const stops = [{ at: 0.25, color: "#ff0000" }, { at: 0.5, color: "#0000ff" }, { at: 1, color: "#ffffff" }];
    expect(rgbToHex(gradientColorAt(stops, 0))).toBe("#ff0000");
    expect(rgbToHex(gradientColorAt(stops, 0.375))).toBe("#800080");
    expect(rgbToHex(gradientColorAt(stops, 0.75))).toBe("#8080ff");
    /* The stops may come in any order. */
    expect(rgbToHex(gradientColorAt([...stops].reverse(), 0.375))).toBe("#800080");
  });
});

describe("applyRadialStart", () => {
  it("sets the Radial look and leaves the tile size", () => {
    const params = createParams();
    Object.assign(params.zoom, { value: 0.6, on: true });
    params.tileSize.value = 1.2;
    applyRadialStart(params);
    expect(params.segments.value).toBe(10);
    expect(params.rotation).toMatchObject({ low: 0, high: 45, on: true, ease: "organic" });
    expect(params.panX).toMatchObject({ low: -0.15, high: 0.15, on: true });
    expect(params.zoom).toMatchObject({ value: 1, on: false });
    expect(params.tileSize.value).toBe(1.2);
  });
});

describe("resetEffects", () => {
  it("turns every unlocked effect off, and leaves locked groups and the image blend", () => {
    const params = createParams();
    const state = createPlayState();
    randomizeParams(params, state);
    Object.assign(params.imageBlend, { value: 0.4, on: true });
    addEffect(state, "trails");
    state.locks.trails = true;
    const trails = JSON.stringify(params.trailAmount);
    resetEffects(params, state);
    const fresh = createParams();
    expect(params.mapPower).toMatchObject({ value: fresh.mapPower.value, low: fresh.mapPower.low, high: fresh.mapPower.high, on: fresh.mapPower.on });
    expect(params.mapAngle.ease).toBe(fresh.mapAngle.ease);
    expect(params.rotation.on).toBe(false);
    expect(state.groups).toMatchObject({ warp: false, kaleidoscope: false, color: false, trails: true, source: true });
    expect(state.fxOrder).toEqual(["trails"]);
    expect(JSON.stringify(params.trailAmount)).toBe(trails);
    expect(params.imageBlend).toMatchObject({ value: 0.4, on: true });
  });
});

describe("randomizeGroup", () => {
  it("changes only the group's controls and modes, and keeps the effect list", () => {
    const params = createParams();
    const state = createPlayState();
    addEffect(state, "kaleidoscope");
    addEffect(state, "warp");
    const before = structuredClone(params);
    const order = [...state.fxOrder];
    const groups = { ...state.groups };
    const warpType = state.warpType;
    for (let run = 0; run < 20; run++) randomizeGroup(params, state, "kaleidoscope");
    for (const key of PARAM_KEYS) {
      if (!GROUP_PARAMS.kaleidoscope.includes(key)) expect(params[key]).toEqual(before[key]);
    }
    expect(GROUP_PARAMS.kaleidoscope.some((key) => params[key].value !== before[key].value)).toBe(true);
    expect(state.fxOrder).toEqual(order);
    expect(state.groups).toEqual(groups);
    expect(state.warpType).toBe(warpType);
  });
});

describe("randomizeParams", () => {
  it("leaves locked groups as they were", () => {
    for (let run = 0; run < 50; run++) {
      const params = createParams();
      const state = createPlayState();
      state.locks.kaleidoscope = true;
      state.locks.map = true;
      state.locks.sharpen = true;
      state.locks.color = true;
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

  it("puts every parameter in exactly one group, except the camera that Camera shares with Terrain", () => {
    const { camera, ...others } = GROUP_PARAMS;
    const grouped = Object.values(others).flat();
    expect(new Set(grouped).size).toBe(grouped.length);
    expect([...grouped, "viewAmount"].sort()).toEqual([...PARAM_KEYS].sort());
    expect(camera.filter((key) => key !== "viewAmount").every((key) => GROUP_PARAMS.terrain.includes(key))).toBe(true);
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


describe("nudgeParams", () => {
  it("moves each unlocked value by NUDGE of its slider, inside the slider and on its steps", () => {
    const params = createParams();
    const state = createPlayState();
    params.mapPower.value = 1.5;
    params.trailAmount.value = 0.5;
    const before = { zoom: params.mapPower.value, trail: params.trailAmount.value };
    nudgeParams(params, state, () => 0.9);
    const zoomTarget = before.zoom + (params.mapPower.max - params.mapPower.min) * NUDGE;
    expect(Math.abs(params.mapPower.value - zoomTarget)).toBeLessThanOrEqual(params.mapPower.step / 2 + 1e-9);
    /* The result lands on the slider's step. */
    const trailTarget = before.trail + (params.trailAmount.max - params.trailAmount.min) * NUDGE;
    expect(Math.abs(params.trailAmount.value - trailTarget)).toBeLessThanOrEqual(params.trailAmount.step / 2 + 1e-9);
    /* At the end of its slider, the value turns back. */
    params.mapPower.value = params.mapPower.max;
    nudgeParams(params, state, () => 0.9);
    expect(Math.abs(params.mapPower.value - (params.mapPower.max - (params.mapPower.max - params.mapPower.min) * NUDGE))).toBeLessThanOrEqual(params.mapPower.step / 2 + 1e-9);
  });

  it("goes on the same way at each next nudge, so it never just goes back", () => {
    const params = createParams();
    const state = createPlayState();
    params.trailAmount.value = 0.5;
    const step = (params.trailAmount.max - params.trailAmount.min) * NUDGE;
    /* The first nudge goes up; the next coin toss would say down, but the value goes on up. */
    nudgeParams(params, state, () => 0.9);
    nudgeParams(params, state, () => 0.1);
    expect(Math.abs(params.trailAmount.value - (0.5 + 2 * step))).toBeLessThanOrEqual(params.trailAmount.step + 1e-9);
  });

  it("leaves locked groups, values at 0, the scene length and whole-circle turns alone", () => {
    const params = createParams();
    const state = createPlayState();
    state.locks.relief = true;
    params.reliefAmount.value = 0.8;
    params.blurAmount.value = 0;
    params.cycle.value = 30;
    Object.assign(params.rotation, { on: true, low: 0, high: 360 });
    nudgeParams(params, state, () => 0.1);
    expect(params.reliefAmount.value).toBe(0.8);
    expect(params.blurAmount.value).toBe(0);
    expect(params.cycle.value).toBe(30);
    expect([params.rotation.low, params.rotation.high]).toEqual([0, 360]);
  });

  it("moves both handles of a range", () => {
    const params = createParams();
    Object.assign(params.mapPower, { on: true, low: 1, high: 2 });
    nudgeParams(params, createPlayState(), () => 0.1);
    const step = (params.mapPower.max - params.mapPower.min) * NUDGE;
    expect(Math.abs(params.mapPower.low! - (1 - step))).toBeLessThanOrEqual(params.mapPower.step / 2 + 1e-9);
    expect(Math.abs(params.mapPower.high! - (2 - step))).toBeLessThanOrEqual(params.mapPower.step / 2 + 1e-9);
  });
});

describe("effect order", () => {
  it("puts one kind of step in a new order, in the places that kind has now", () => {
    expect(withKindOrder(["blur", "warp", "trails", "map", "kaleidoscope", "levels"], ["kaleidoscope", "map", "warp"]))
      .toEqual(["blur", "kaleidoscope", "trails", "map", "warp", "levels"]);
  });

  it("Randomize picks effects in a random order, and a locked effect keeps its place", () => {
    const state = createPlayState();
    state.fxOrder = ["blur", "warp", "trails"];
    state.groups.trails = true;
    state.locks.trails = true;
    const firsts = new Set<string>();
    for (let round = 0; round < 60; round++) {
      /* The locked effect keeps its place, or comes last when the new list is shorter than that. */
      const place = state.fxOrder.indexOf("trails");
      randomizeParams(createParams(), state);
      expect(state.fxOrder.indexOf("trails")).toBe(Math.min(place, state.fxOrder.length - 1));
      expect(new Set(state.fxOrder).size).toBe(state.fxOrder.length);
      /* An effect in the list is on, and one that is not is off. */
      for (const step of ["warp", "map", "kaleidoscope", "blur", "smear", "contours", "relief", "sharpen", "color", "levels"] as const) {
        expect(state.groups[step]).toBe(state.fxOrder.includes(step));
      }
      firsts.add(state.fxOrder[0]);
    }
    /* Picture steps and shape steps both come first sometimes. */
    expect(firsts.size).toBeGreaterThan(2);
  });

  it("Clear all empties the list, except for locked effects", () => {
    const state = createPlayState();
    for (const step of ["blur", "warp", "trails", "kaleidoscope"] as const) addEffect(state, step);
    state.locks.trails = true;
    resetEffects(createParams(), state);
    expect(state.fxOrder).toEqual(["trails"]);
  });

  it("adds an effect at the end and turns it on; removing it turns it off", () => {
    const state = createPlayState();
    expect(state.fxOrder).toEqual([]);
    addEffect(state, "blur");
    addEffect(state, "kaleidoscope");
    expect(state.fxOrder).toEqual(["blur", "kaleidoscope"]);
    expect(state.groups.kaleidoscope).toBe(true);
    removeEffect(state, "blur");
    expect(state.fxOrder).toEqual(["kaleidoscope"]);
    expect(state.groups.blur).toBe(false);
  });
});

describe("log sliders", () => {
  it("give each ratio the same part of the slider", () => {
    const cell = createParams().warpCellSize;
    expect(toSlider(cell, cell.min)).toBe(0);
    expect(toSlider(cell, cell.max)).toBeCloseTo(SLIDER_STEPS);
    expect(fromSlider(cell, SLIDER_STEPS / 2)).toBeCloseTo(Math.sqrt(cell.min * cell.max), 2);
    expect(fromSlider(cell, toSlider(cell, 4))).toBe(4);
  });

  it("move a range in equal ratios", () => {
    const cell = createParams().warpCellSize;
    Object.assign(cell, { on: true, low: 1, high: 16, ease: "linear" });
    /* Halfway through the cycle, halfway along the slider: 4 is the middle ratio of 1 and 16. */
    expect(liveValue(cell, at(10))).toBeCloseTo(4);
  });
});

describe("openRange", () => {
  const params = createParams();

  it("opens two ends on one value to a tenth of the span, upward", () => {
    expect(openRange(params.overlayOpacity, 0, 0)).toEqual([0, 0.1]);
  });

  it("opens downward when there is no room above", () => {
    expect(openRange(params.overlayOpacity, 1, 1)).toEqual([0.9, 1]);
  });

  it("keeps a range that has room between its ends, also a reversed one", () => {
    expect(openRange(params.overlayOpacity, 0.2, 0.6)).toEqual([0.2, 0.6]);
    expect(openRange(params.overlayOpacity, 0.6, 0.2)).toEqual([0.6, 0.2]);
  });

  it("no default range has both ends on one value", () => {
    for (const key of PARAM_KEYS) {
      const param = params[key];
      if (!param.drift || param.low === undefined || param.high === undefined) continue;
      expect(Math.abs(param.high - param.low), key).toBeGreaterThanOrEqual(param.step / 2);
    }
  });
});
