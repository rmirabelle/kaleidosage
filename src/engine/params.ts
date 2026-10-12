import type { BlurMode, MapMode, TrailMode, WarpMode } from "./renderer";

const TAU = Math.PI * 2;

export const PARAM_KEYS = [
  "warpAmount", "warpScale", "warpMarble", "warpDetail", "warpFlow",
  "mapMix", "mapScale", "mapPower", "mapPointX", "mapPointY", "mapSteps", "mapTwist",
  "segments", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl", "hue", "blurAngle", "blurDist",
  "focusSize", "focusSoft",
  "trailAmount", "trailZoom", "trailTurn", "trailHue",
  "sharpen", "sharpenRadius", "contrast"
] as const;
export type ParamKey = typeof PARAM_KEYS[number];

/**
 * One adjustable value. "value" is the slider value when drift is off.
 * When drift is on, the value moves between "low" (the start handle) and
 * "high" (the end handle), beginning at the lower of the two at time 0.
 * The end can be below the start; a full-circle angle then turns backward:
 * - a "wave" value swings back and forth at "rate" cycles per second.
 * - a "spin" value (an angle) turns at "rate" degrees per second. With the
 *   full 0-360 range it turns without stopping; with a smaller range it
 *   swings back and forth at the same angular speed.
 */
export interface Param {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  unit?: string;
  drift?: "spin" | "wave";
  low?: number;
  high?: number;
  rate?: number;
  on?: boolean;
  phase1: number;
  phase2: number;
}

export type Params = Record<ParamKey, Param>;

/** The settings groups that can be turned off as a whole. */
export type GroupKey = "warp" | "map" | "kaleidoscope" | "blur" | "trails" | "finish";

export interface PlayState {
  /** Which groups are on. A group that is off has no effect, but keeps its settings. */
  groups: Record<GroupKey, boolean>;
  warpMode: WarpMode;
  /** How far the warp noise has flowed; it grows with time × warp flow. */
  warpTime: number;
  mapMode: MapMode;
  blurMode: BlurMode;
  trailMode: TrailMode;
  /** Multiplies how fast time passes for every drifting value. */
  speed: number;
  paused: boolean;
  /** Animation time in seconds. */
  time: number;
}

type ParamSpec = Omit<Param, "phase1" | "phase2">;

const SPECS: Record<ParamKey, ParamSpec> = {
  warpAmount: { label: "Warp strength", min: 0, max: 1, step: 0.01, value: 0.15, drift: "wave", low: 0.05, high: 0.3, rate: 0.02, on: true },
  warpScale: { label: "Warp size", min: 0.2, max: 8, step: 0.01, value: 1.5, drift: "wave", low: 1, high: 2.5, rate: 0.013, on: false },
  warpMarble: { label: "Marbling", min: 0, max: 6, step: 0.01, value: 2, drift: "wave", low: 1, high: 3.5, rate: 0.016, on: true },
  warpDetail: { label: "Warp detail", min: 1, max: 6, step: 1, value: 4 },
  warpFlow: { label: "Warp flow", min: 0, max: 2, step: 0.01, value: 0.25, drift: "wave", low: 0.05, high: 0.6, rate: 0.019, on: false },
  mapMix: { label: "Map mix", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0.4, high: 1, rate: 0.018, on: false },
  mapScale: { label: "Map zoom", min: 0.2, max: 4, step: 0.01, value: 1.2, drift: "wave", low: 0.8, high: 1.8, rate: 0.015, on: false },
  mapPower: { label: "Power", min: 0.5, max: 6, step: 0.01, value: 2, drift: "wave", low: 1.5, high: 3, rate: 0.02, on: true },
  mapPointX: { label: "Point X", min: -1.5, max: 1.5, step: 0.01, value: -0.4, drift: "wave", low: -0.6, high: -0.2, rate: 0.016, on: true },
  mapPointY: { label: "Point Y", min: -1.5, max: 1.5, step: 0.01, value: 0.6, drift: "wave", low: 0.4, high: 0.7, rate: 0.012, on: true },
  mapSteps: { label: "Steps", min: 1, max: 12, step: 1, value: 4 },
  mapTwist: { label: "Twist", min: -80, max: 80, step: 1, value: 30, unit: "°", drift: "wave", low: 10, high: 50, rate: 0.014, on: true },
  segments: { label: "Segments", min: 0, max: 24, step: 1, value: 8 },
  /** The center is a fraction of the screen size: -0.5 and 0.5 are the screen edges. */
  centerX: { label: "Center X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, rate: 0.017, on: true },
  centerY: { label: "Center Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, rate: 0.013, on: true },
  rotation: { label: "Rotation", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, rate: 8, on: true },
  zoom: { label: "Zoom", min: 0.2, max: 4, step: 0.01, value: 1.2, drift: "wave", low: 0.6, high: 1.8, rate: 0.05, on: true },
  panX: { label: "Pan X", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, rate: 0.031, on: true },
  panY: { label: "Pan Y", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, rate: 0.023, on: true },
  twirl: { label: "Twirl", min: -8, max: 8, step: 0.01, value: 0, drift: "wave", low: -3, high: 3, rate: 0.027, on: false },
  hue: { label: "Hue shift", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, rate: 6, on: false },
  blurAngle: { label: "Blur angle", min: 0, max: 360, step: 1, value: 30, unit: "°", drift: "spin", low: 0, high: 360, rate: 12, on: true },
  blurDist: { label: "Blur distance", min: 0, max: 400, step: 1, value: 90, unit: "px", drift: "wave", low: 10, high: 170, rate: 0.043, on: true },
  /** The focus area is in screen heights, measured from the kaleidoscope center. */
  focusSize: { label: "Focus size", min: 0, max: 1.5, step: 0.01, value: 0.15, drift: "wave", low: 0.05, high: 0.3, rate: 0.02, on: false },
  focusSoft: { label: "Focus softness", min: 0, max: 1.5, step: 0.01, value: 0.35, drift: "wave", low: 0.2, high: 0.6, rate: 0.017, on: false },
  /** Trail values are per 1/60 s; the renderer scales them to the real frame time. */
  trailAmount: { label: "Trail length", min: 0, max: 0.98, step: 0.01, value: 0.85, drift: "wave", low: 0.7, high: 0.95, rate: 0.021, on: false },
  trailZoom: { label: "Trail zoom", min: 0.97, max: 1.03, step: 0.001, value: 1.008, drift: "wave", low: 0.996, high: 1.015, rate: 0.033, on: false },
  trailTurn: { label: "Trail turn", min: -3, max: 3, step: 0.01, value: 0.25, unit: "°", drift: "wave", low: -0.8, high: 0.8, rate: 0.026, on: false },
  trailHue: { label: "Trail hue", min: -10, max: 10, step: 0.1, value: 0, unit: "°", drift: "wave", low: -3, high: 3, rate: 0.019, on: false },
  sharpen: { label: "Sharpen", min: 0, max: 3, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 1, rate: 0.02, on: false },
  sharpenRadius: { label: "Sharpen radius", min: 0.5, max: 4, step: 0.1, value: 1, unit: "px", drift: "wave", low: 0.8, high: 2.5, rate: 0.024, on: false },
  contrast: { label: "Contrast", min: 0, max: 2.5, step: 0.01, value: 1.1, drift: "wave", low: 0.9, high: 1.4, rate: 0.015, on: false }
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createParams(): Params {
  const params = {} as Params;
  for (const key of PARAM_KEYS) {
    /** phase2 varies the timing of each value; phase1 is set so every drift begins at its range minimum at time 0. */
    const phase2 = rand(0, TAU);
    params[key] = { ...SPECS[key], phase1: -Math.PI / 2 - 0.8 * Math.sin(phase2), phase2 };
  }
  return params;
}

export function createPlayState(): PlayState {
  return {
    groups: { warp: true, map: false, kaleidoscope: true, blur: true, trails: true, finish: true },
    warpMode: 1, warpTime: 0, mapMode: 1, blurMode: 0, trailMode: 1, speed: 1, paused: false, time: 0 };
}

/**
 * A back-and-forth motion from -1 to 1 that reaches both ends every cycle.
 * A slow second wave bends the timing, so the motion does not look mechanical.
 */
function swing(cycles: number, time: number, param: Param) {
  return Math.sin(TAU * cycles * time + param.phase1 + 0.8 * Math.sin(TAU * cycles * 0.382 * time + param.phase2));
}

/** The value a parameter has at the current animation time. */
export function liveValue(param: Param, state: PlayState): number {
  if (!param.drift || !param.on) return param.value;
  const time = state.time;
  const rate = param.rate ?? 0;
  const start = clamp(param.low ?? param.min, param.min, param.max);
  const end = clamp(param.high ?? param.max, param.min, param.max);
  const bottom = Math.min(start, end);
  const top = Math.max(start, end);
  if (bottom === top) return bottom;
  /** -1 when the end is below the start: a full-circle angle then turns backward. */
  const direction = Math.sign(end - start);
  if (param.drift === "spin" && bottom <= param.min && top >= param.max) {
    return (((bottom + time * rate * direction) % 360) + 360) % 360;
  }
  /** swing() is -1 at time 0 (see createParams), so every value begins at the bottom of its range. */
  const cycles = param.drift === "spin" ? Math.abs(rate) / (2 * (top - bottom)) : rate;
  return bottom + (top - bottom) * (0.5 + 0.5 * swing(cycles, time, param));
}

export function formatValue(param: Param, value: number): string {
  const decimals = (String(param.step).split(".")[1] ?? "").length;
  return value.toFixed(Math.max(decimals, param.step < 1 ? 2 : 0)) + (param.unit ?? "");
}

/** Picks a new random look. Drift stays on for the values that move the picture most. */
export function randomizeParams(params: Params, state?: PlayState) {
  if (state) {
    state.groups.map = Math.random() < 0.75;
    state.mapMode = (1 + Math.floor(Math.random() * 5)) as MapMode;
    state.groups.warp = Math.random() < 0.7;
    state.warpMode = (Math.random() < 0.65 ? 1 : 2) as WarpMode;
  }
  /** Sets the value and a drift range of +/- spread around it, kept inside the limits. */
  const set = (key: ParamKey, value: number, spread = 0) => {
    const param = params[key];
    param.value = clamp(value, param.min, param.max);
    if (!param.drift) return;
    param.low = clamp(param.value - spread, param.min, param.max);
    param.high = clamp(param.value + spread, param.min, param.max);
  };
  /**
   * An angle that turns all the way around, or sometimes swings over a
   * smaller arc. Half the time the range is reversed, so it turns the other way.
   */
  const setAngle = (key: ParamKey, fullTurnChance: number) => {
    const param = params[key];
    if (Math.random() < fullTurnChance) {
      set(key, rand(0, 360));
      param.low = 0;
      param.high = 360;
    } else {
      set(key, rand(60, 300), rand(15, 90));
    }
    if (Math.random() < 0.5) [param.low, param.high] = [param.high, param.low];
    param.rate = rand(4, 20);
  };
  const segmentChoices = [0, 3, 4, 5, 6, 6, 8, 8, 10, 12, 16];
  set("segments", segmentChoices[Math.floor(Math.random() * segmentChoices.length)]);
  set("warpAmount", rand(0.05, 0.4), rand(0.03, 0.15));
  set("warpScale", rand(0.6, 4), rand(0.2, 0.8));
  set("warpMarble", rand(0.5, 4), rand(0.3, 1.5));
  set("warpDetail", Math.round(rand(2, 6)));
  set("warpFlow", rand(0.05, 0.6), rand(0, 0.25));
  set("mapMix", rand(0.6, 1), rand(0, 0.3));
  set("mapScale", rand(0.6, 2), rand(0.1, 0.4));
  set("mapPower", rand(1.5, 4), rand(0.2, 1));
  set("mapPointX", rand(-0.9, 0.5), rand(0.05, 0.25));
  set("mapPointY", rand(-0.7, 0.7), rand(0.05, 0.25));
  set("mapSteps", Math.round(rand(2, 8)));
  set("mapTwist", rand(-60, 60), rand(5, 25));
  set("centerX", rand(-0.2, 0.2), rand(0.1, 0.35));
  set("centerY", rand(-0.15, 0.15), rand(0.08, 0.3));
  setAngle("rotation", 0.7);
  set("zoom", rand(0.6, 2.4), rand(0.2, 0.8));
  set("panX", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("panY", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("twirl", Math.random() < 0.4 ? rand(-4, 4) : 0, rand(1, 3));
  setAngle("hue", 0.8);
  setAngle("blurAngle", 0.6);
  const blurLow = rand(0, 150);
  set("blurDist", blurLow);
  params.blurDist.low = blurLow;
  params.blurDist.high = Math.min(params.blurDist.max, blurLow + rand(40, 200));
  set("focusSize", rand(0, 0.35), rand(0, 0.1));
  set("focusSoft", rand(0.15, 0.7), rand(0, 0.15));
  set("trailAmount", rand(0.6, 0.95), rand(0.03, 0.1));
  set("trailZoom", rand(0.992, 1.02), rand(0.002, 0.008));
  set("trailTurn", rand(-1, 1), rand(0.2, 0.8));
  set("trailHue", Math.random() < 0.3 ? rand(-3, 3) : 0, rand(0.5, 3));
  set("sharpen", rand(0, 1.2), rand(0, 0.3));
  set("sharpenRadius", rand(0.7, 2.5), rand(0, 0.8));
  set("contrast", rand(0.95, 1.4), rand(0, 0.15));
  params.twirl.on = Math.random() < 0.5;
  params.hue.on = Math.random() < 0.4;
}
