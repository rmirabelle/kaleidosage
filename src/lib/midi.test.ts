import { describe, expect, it } from "vitest";
import { PARAM_KEYS, createParams, toSlider, type Param } from "../engine/params";
import { absoluteMove, moveValue, playheadPosition, playheadValue, pushPlayhead, relativeMove, scaledStep } from "./midi";

const params = createParams();
const linear = (): Param => ({ label: "Test", min: -1, max: 1, step: 0.01, value: 0 });
const logKey = PARAM_KEYS.find((key) => params[key].scale === "log")!;

describe("scaledStep", () => {
  it("spreads the knob's travel left over the value's travel left", () => {
    /* From 0.4 with the knob at 0.8: the last 0.2 of the knob covers the last 0.6 of the value. */
    expect(scaledStep(0.4, 0.8, 0.9)).toBeCloseTo(0.7);
    expect(scaledStep(0.4, 0.8, 1)).toBe(1);
    /* Down from there: the knob's 0.8 covers the value's 0.4. */
    expect(scaledStep(0.4, 0.8, 0.4)).toBeCloseTo(0.2);
    expect(scaledStep(0.4, 0.8, 0)).toBe(0);
  });

  it("does nothing for a knob already at its end, or one that did not move", () => {
    expect(scaledStep(0.4, 1, 1)).toBe(0.4);
    expect(scaledStep(0.4, 0.3, 0.3)).toBe(0.4);
  });
});

describe("moveValue", () => {
  it("takes the slider over where it is on the first step, with no jump", () => {
    expect(moveValue(linear(), 0.3, absoluteMove(null, 0.9))).toBe(0.3);
  });

  it("then moves along the slider, and the knob's end reaches the slider's end", () => {
    expect(moveValue(linear(), 0.3, absoluteMove(0.5, 0.55))).toBeCloseTo(0.37);
    expect(moveValue(linear(), 0.9, absoluteMove(0.5, 1))).toBe(1);
    expect(moveValue(linear(), -0.9, absoluteMove(0.5, 0))).toBe(-1);
  });

  it("keeps a 14-bit control's small steps instead of rounding to the slider's steps", () => {
    expect(moveValue(linear(), 0, absoluteMove(8192 / 16383, 8193 / 16383))).toBeCloseTo(2 / 16383, 7);
  });

  it("moves a log slider in equal ratios", () => {
    const param = { ...params[logKey], on: false };
    const middle = Math.sqrt(param.min * param.max);
    const quarterUp = moveValue(param, middle, absoluteMove(0.5, 0.75));
    expect(toSlider(param, quarterUp) / 1000).toBeCloseTo(0.75, 2);
  });
});

describe("playheadValue", () => {
  it("goes from the lower handle to the higher one, whichever way the range runs", () => {
    const range = { ...linear(), on: true, low: 0.6, high: -0.2 };
    expect(playheadValue(range, 0)).toBeCloseTo(-0.2);
    expect(playheadValue(range, 1)).toBeCloseTo(0.6);
    expect(playheadValue(range, 0.25)).toBeCloseTo(0);
  });

  it("moves a log range in equal ratios", () => {
    const param = { ...params[logKey], on: true, low: params[logKey].min, high: params[logKey].max };
    expect(playheadValue(param, 0)).toBeCloseTo(param.min);
    expect(playheadValue(param, 1)).toBeCloseTo(param.max);
    expect(playheadValue(param, 0.5)).toBeCloseTo(Math.sqrt(param.min * param.max));
  });
});

describe("playheadPosition", () => {
  it("is the reverse of playheadValue", () => {
    const range = { ...linear(), on: true, low: 0.6, high: -0.2 };
    for (const position of [0, 0.3, 1]) expect(playheadPosition(range, playheadValue(range, position))).toBeCloseTo(position);
    const log = { ...params[logKey], on: true, low: params[logKey].min, high: params[logKey].max };
    expect(playheadPosition(log, playheadValue(log, 0.7))).toBeCloseTo(0.7);
  });
});

describe("absoluteMove on a range", () => {
  it("takes over where the playhead is on the first step, with no jump", () => {
    expect(absoluteMove(null, 0.9)(0.42)).toBe(0.42);
  });

  it("then moves between the handles, and the knob's end reaches the handle", () => {
    expect(absoluteMove(0.9, 0.95)(0.42)).toBeCloseTo(0.71);
    expect(absoluteMove(0.9, 1)(0.42)).toBe(1);
    expect(absoluteMove(0.6, 0.55)(1)).toBeCloseTo(1 - 0.05 / 0.6);
  });
});

describe("pushPlayhead", () => {
  it("moves along the whole slider and pushes the handle it passes", () => {
    const range = { ...linear(), on: true, low: -0.2, high: 0.2 };
    /* From the middle with the knob in the middle, a step is the same part of the slider: 0.05 of the knob is 0.1. Inside the range, no handle moves. */
    expect(pushPlayhead(range, 0, absoluteMove(0.5, 0.55))).toEqual({ value: expect.closeTo(0.1), low: -0.2, high: 0.2 });
    /* Past the top handle: it moves with the playhead (0.55 of the slider + 0.1 × 0.45 / 0.5 = 0.64, so 0.28). */
    const up = pushPlayhead(range, 0.1, absoluteMove(0.5, 0.6));
    expect(up.value).toBeCloseTo(0.28);
    expect(up).toMatchObject({ low: -0.2, high: 0.28 });
    /* Past the bottom handle, and stopped at the end of the slider. */
    expect(pushPlayhead(range, 0, absoluteMove(0.5, 0))).toMatchObject({ low: -1, high: 0.2 });
  });

  it("pushes the right handle of a range that runs down", () => {
    const reversed = { ...linear(), on: true, low: 0.2, high: -0.2 };
    expect(pushPlayhead(reversed, 0.1, absoluteMove(0.5, 0.6))).toMatchObject({ low: 0.28, high: -0.2 });
    expect(pushPlayhead(reversed, -0.1, absoluteMove(0.5, 0.4))).toMatchObject({ low: 0.2, high: -0.28 });
  });
});

describe("relativeMove", () => {
  it("moves by steps, with no end to the knob's turn, and stops at the value's ends", () => {
    expect(relativeMove(1)(0.5)).toBeCloseTo(0.5 + 1 / 127);
    expect(relativeMove(-4)(0.5)).toBeCloseTo(0.5 - 4 / 127);
    expect(relativeMove(3)(0.999)).toBe(1);
    expect(relativeMove(-3)(0.001)).toBe(0);
  });

  it("moves a single value and a Ctrl push the same way", () => {
    expect(moveValue(linear(), 0, relativeMove(127))).toBe(1);
    const range = { ...linear(), on: true, low: -0.2, high: 0.2 };
    expect(pushPlayhead(range, 0.2, relativeMove(127 * 0.05))).toMatchObject({ low: -0.2, high: expect.closeTo(0.3) });
  });
});
