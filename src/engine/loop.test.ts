import { describe, expect, it } from "vitest";
import { baseLoopSeconds, fittedCustomSeconds, needsSeamFade, trailSettleTime, warpFlowCorrection } from "./loop";
import { REFERENCE_CYCLE, createParams, createPlayState, liveValue } from "./params";

/** A play state with the kaleidoscope on, so its zoom and rotation ranges show. */
const kaleidoscopeOn = () => {
  const state = createPlayState();
  state.groups.kaleidoscope = true;
  return state;
};

describe("baseLoopSeconds", () => {
  it("is two cycles when a range goes there and back", () => {
    const params = createParams();
    params.cycle.value = 15;
    Object.assign(params.zoom, { on: true, low: 1, high: 2 });
    expect(baseLoopSeconds(params, kaleidoscopeOn())).toBe(30);
  });

  it("is one cycle when only full turns move", () => {
    const params = createParams();
    params.cycle.value = 15;
    Object.assign(params.rotation, { on: true, low: 0, high: 360 });
    expect(baseLoopSeconds(params, kaleidoscopeOn())).toBe(15);
  });

  it("leaves out ranges of effects that are off", () => {
    const params = createParams();
    params.cycle.value = 15;
    Object.assign(params.zoom, { on: true, low: 1, high: 2 });
    expect(baseLoopSeconds(params, createPlayState())).toBe(15);
  });

  it("leaves out ranges with their own time", () => {
    const params = createParams();
    params.cycle.value = 15;
    Object.assign(params.zoom, { on: true, low: 1, high: 2, custom: true, seconds: 7 });
    expect(baseLoopSeconds(params, kaleidoscopeOn())).toBe(15);
  });
});

describe("fittedCustomSeconds", () => {
  it("gives a custom range a time that repeats a whole number of times", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 1, high: 2, custom: true, seconds: 7 });
    const seconds = fittedCustomSeconds(params, 40).zoom!;
    /* There and back is 14 s; 40 s fits about 3 of them, so each trip becomes 40 / 6 s. */
    expect(seconds).toBeCloseTo(40 / 6);
    params.zoom.seconds = seconds;
    const start = { ...createPlayState(), time: 0, clock: 0 };
    for (const clock of [0, 3.3, 11.1]) {
      expect(liveValue(params.zoom, { ...start, clock: clock + 40 })).toBeCloseTo(liveValue(params.zoom, { ...start, clock }));
    }
  });

  it("repeats a slow range at least once", () => {
    const params = createParams();
    Object.assign(params.lightAngle, { on: true, low: 0, high: 360, custom: true, seconds: 100 });
    expect(fittedCustomSeconds(params, 40).lightAngle).toBeCloseTo(40);
  });
});

describe("warpFlowCorrection", () => {
  it("makes a ripple's warp time grow by a whole number of repeats", () => {
    const params = createParams();
    const state = { ...createPlayState(), warpType: 1 as const, time: 0, clock: 0 };
    state.groups.warp = true;
    Object.assign(params.warpFlow, { on: true, low: 0.1, high: 0.5 });
    const frames = 2400;
    const realStep = 40 / frames;
    const animatedStep = realStep * (REFERENCE_CYCLE / 20);
    const offset = warpFlowCorrection(params, state, frames, animatedStep, realStep);
    let travel = 0;
    for (let index = 1; index <= frames; index++) {
      travel += animatedStep * (liveValue(params.warpFlow, { ...state, time: index * animatedStep, clock: index * realStep }) + offset);
    }
    const repeats = travel / (Math.PI / 2);
    expect(Math.abs(repeats - Math.round(repeats))).toBeLessThan(1e-6);
    expect(Math.round(repeats)).toBeGreaterThan(0);
  });

  it("is 0 for noise, which never repeats", () => {
    const params = createParams();
    params.warpFlow.value = 0.3;
    expect(warpFlowCorrection(params, { ...createPlayState(), warpType: 0 }, 100, 0.01, 0.01)).toBe(0);
  });
});

describe("needsSeamFade", () => {
  it("is true for a flowing noise warp and a flying tunnel", () => {
    const params = createParams();
    const state = createPlayState();
    state.groups.warp = true;
    params.warpFlow.value = 0.3;
    expect(needsSeamFade(params, { ...state, warpType: 0 })).toBe(true);
    expect(needsSeamFade(params, { ...state, warpType: 1 })).toBe(false);
    params.warpFlow.value = 0;
    params.mapSpeed.value = 0.2;
    expect(needsSeamFade(params, { ...state, warpType: 0, mapMode: 6, groups: { ...state.groups, map: true } })).toBe(true);
    expect(needsSeamFade(params, { ...state, warpType: 0, mapMode: 6 })).toBe(false);
  });
});

describe("trailSettleTime", () => {
  it("is longer for longer trails, and 0 without trails", () => {
    const params = createParams();
    params.trailAmount.value = 0;
    expect(trailSettleTime(params)).toBe(0);
    params.trailAmount.value = 0.9;
    const short = trailSettleTime(params);
    Object.assign(params.trailAmount, { on: true, low: 0.5, high: 0.98 });
    const long = trailSettleTime(params);
    expect(long).toBeGreaterThan(short);
    /* After that time, less than 1/2000 of the old picture is left. */
    expect(Math.pow(0.98, long * 60)).toBeLessThanOrEqual(1 / 2000 + 1e-9);
  });
});
