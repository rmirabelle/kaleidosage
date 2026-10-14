import type { BlendMode, BlurMask, FoldMode, LayerBlend, MapMode, PictureStep, ShapeStep, TrailMode, WarpMode, WarpType } from "./renderer";

export const PARAM_KEYS = [
  "cycle",
  "imageBlend",
  "warpOpacity", "mapOpacity", "foldOpacity",
  "warpAmount", "warpScale", "warpMarble", "warpDetail", "warpFlow", "warpCenterX", "warpCenterY", "warpAngle",
  "mapMix", "mapScale", "mapPower", "mapPointX", "mapPointY", "mapSteps", "mapTwist", "mapAngle", "mapSpeed", "mapFog", "tunnelTwist",
  "segments", "tileSize", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl",
  "blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle", "blurMaskLevel",
  "trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint",
  "reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine",
  "sharpen", "sharpenRadius", "overlayOpacity", "exposure", "blackLevel"
] as const;
export type ParamKey = typeof PARAM_KEYS[number];

/**
 * One adjustable value. "value" is the slider value when drift is off.
 * When drift is on, the value moves between "low" (the start handle) and
 * "high" (the end handle), beginning at the start handle at time 0. The end
 * can be below the start. A range goes from its start handle to its end
 * handle in one shared cycle and comes back in the next, in step with every
 * other range. A "custom" range uses its own time instead: "seconds" real
 * seconds from start to end. An angle ("spin") with the full 0-360 range
 * turns without stopping, one full turn per cycle (backward when the end is
 * below the start).
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
  on?: boolean;
  /** How a back-and-forth range moves between its handles. Unset: smooth for waves, linear for angles. */
  ease?: Ease;
  /** True: the range uses its own time ("seconds") instead of the shared cycle. */
  custom?: boolean;
  /** A custom range's time: real seconds from the start handle to the end handle. */
  seconds?: number;
  /**
   * When the range was last at its start handle: animation time for a range
   * on the shared cycle, real play time ("clock") for a custom range.
   */
  startTime?: number;
}

/**
 * Easing: the curve a back-and-forth range follows between its handles,
 * out and back on the same curve: smooth (a sine wave, slow at both
 * handles), linear at a steady speed, ease in-out (slower at both handles
 * than smooth), ease in slow at the start, ease out slow at the end, and
 * bounce, which bounces at the end handle. "organic" is the smooth curve's
 * name in scene files.
 */
export type Ease = "organic" | "linear" | "inOut" | "in" | "out" | "bounce";
export const EASES: readonly (readonly [Ease, string])[] = [
  ["organic", "Smooth"], ["linear", "Linear"], ["inOut", "Ease in-out"], ["in", "Ease in"], ["out", "Ease out"], ["bounce", "Bounce"]
];

/** The default curve: organic for waves, linear for angles (they turn at a steady angular speed). */
export const easeOf = (param: Param): Ease => param.ease ?? (param.drift === "spin" ? "linear" : "organic");

/**
 * Bounce: the value falls toward the end handle, faster and faster, for 80%
 * of the way, then makes two short, small bounces off the end handle.
 */
function bounceOut(t: number) {
  const fall = 0.8;
  if (t < fall) return (t / fall) ** 2;
  /* Each bounce: its start, its end, and how high it rises (as a part of the range). */
  const bounces = [[fall, 0.92, 0.08], [0.92, 1, 0.025]];
  for (const [from, to, height] of bounces) {
    if (t < to) {
      const u = (t - from) / (to - from);
      return 1 - height * 4 * u * (1 - u);
    }
  }
  return 1;
}

/** A curve from 0 to 1 for t from 0 to 1. */
export function easeCurve(kind: Ease, t: number): number {
  switch (kind) {
    case "linear": return t;
    case "inOut": return t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2;
    case "in": return t ** 3;
    case "out": return 1 - (1 - t) ** 3;
    case "bounce": return bounceOut(t);
    default: return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }
}

export type Params = Record<ParamKey, Param>;

/** The settings groups that can be turned off as a whole. */
export type GroupKey = "animation" | "source" | "warp" | "map" | "kaleidoscope" | "blur" | "trails" | "relief" | "finish";

export interface PlayState {
  /** Which groups are on. A group that is off has no effect, but keeps its settings. */
  groups: Record<GroupKey, boolean>;
  /** Locked groups keep their settings when Randomize runs. Scene files do not store this. */
  locks: Record<GroupKey, boolean>;
  /** How the two source images fade into each other. */
  blendMode: BlendMode;
  warpMode: WarpMode;
  /** The kind of warp: 0 noise, 1 ripple, 2 waves, 3 swirl, 4 bulge and pinch, 5 cells. */
  warpType: WarpType;
  /** How far the warp noise has flowed; it grows with time × warp flow. */
  warpTime: number;
  /** How far the view has flown into the tunnel; it grows with time × tunnel speed. */
  mapTravel: number;
  mapMode: MapMode;
  /** Radial wedges, or triangle or hexagon tiles. */
  foldMode: FoldMode;
  /**
   * The order of the shape steps (they move pixels) and of the picture steps
   * (they change the drawn picture), as the panel lists them: the first step
   * acts first on the picture, and each next step works on that result.
   */
  shapeOrder: ShapeStep[];
  pictureOrder: PictureStep[];
  /** How each shape step's result combines with the picture without it. Randomize does not change it. */
  layerBlend: Record<ShapeStep, LayerBlend>;
  /**
   * The blur mask, which sets where the picture is blurred: 0 a circle with
   * a sharp center, 1 a circle with a blurred center, 2 a straight gradient,
   * 3 bright areas, 4 dark areas, 5 noise blotches.
   */
  blurMask: BlurMask;
  trailMode: TrailMode;
  /** The color overlay color, as "#rrggbb". */
  overlayColor: string;
  /** The color the trails are tinted toward (see trailTint), as "#rrggbb". */
  trailColor: string;
  paused: boolean;
  /** Animation time in seconds. It runs at the speed the shared cycle sets (see REFERENCE_CYCLE). */
  time: number;
  /** Real seconds of play, not changed by speed. Custom ranges move on this clock. */
  clock: number;
}

type ParamSpec = Param;

/**
 * Opacity of the shape steps: how much of a step's result shows over the
 * picture without the step, mixed by the step's blend mode. 1 in normal mode
 * is the plain step; 0 leaves the step out.
 */
const opacitySpec: ParamSpec = { label: "Opacity", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0, high: 1, on: false };
/** Randomize does not change the opacities or their ranges. */
const OPACITY_KEYS: ParamKey[] = ["warpOpacity", "mapOpacity", "foldOpacity"];

/**
 * A shared cycle of this many seconds runs at 1× speed; a shorter one runs
 * faster by the same ratio. Animation time runs at that speed, so on
 * animation time every cycle is REFERENCE_CYCLE seconds long.
 */
export const REFERENCE_CYCLE = 20;

const SPECS: Record<ParamKey, ParamSpec> = {
  /**
   * The shared cycle: real seconds from the start handles to the end
   * handles. It also sets the speed of everything that moves (see
   * REFERENCE_CYCLE).
   */
  cycle: { label: "Cycle", min: 5, max: 90, step: 1, value: REFERENCE_CYCLE, unit: " s" },
  warpOpacity: opacitySpec,
  mapOpacity: opacitySpec,
  foldOpacity: opacitySpec,
  /** 0 shows the first image, 1 the second. With a range, the picture fades back and forth between them. */
  imageBlend: { label: "Image blend", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  warpAmount: { label: "Warp strength", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.05, high: 0.3, on: false },
  warpScale: { label: "Warp size", min: 0.2, max: 8, step: 0.01, value: 1.5, drift: "wave", low: 1, high: 2.5, on: false },
  warpMarble: { label: "Marbling", min: 0, max: 6, step: 0.01, value: 0, drift: "wave", low: 1, high: 3.5, on: false },
  warpDetail: { label: "Warp detail", min: 1, max: 6, step: 1, value: 4 },
  warpFlow: { label: "Warp flow", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.05, high: 0.6, on: false },
  /** Ripple, swirl and bulge: the warp's center, in screen heights from the screen center. */
  warpCenterX: { label: "Warp center X", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  warpCenterY: { label: "Warp center Y", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  /** Waves: the direction the waves roll. */
  warpAngle: { label: "Wave angle", min: 0, max: 360, step: 1, value: 30, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  mapMix: { label: "Map mix", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0.4, high: 1, on: false },
  mapScale: { label: "Map zoom", min: 0.2, max: 4, step: 0.01, value: 1, drift: "wave", low: 0.8, high: 1.8, on: false },
  mapPower: { label: "Power", min: 0.5, max: 6, step: 0.01, value: 1, drift: "wave", low: 1.5, high: 3, on: false },
  mapPointX: { label: "Point X", min: -1.5, max: 1.5, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  mapPointY: { label: "Point Y", min: -1.5, max: 1.5, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  mapSteps: { label: "Steps", min: 1, max: 12, step: 1, value: 4 },
  mapTwist: { label: "Twist", min: -80, max: 80, step: 1, value: 0, unit: "°", drift: "wave", low: 10, high: 50, on: false },
  /** Power, log spiral and tunnel fold the picture over an axis (so there is no seam); this turns that axis. */
  mapAngle: { label: "Axis angle", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  /** Tunnel only: forward speed in tube lengths per second (backward below 0), and how dark the far end gets. */
  mapSpeed: { label: "Tunnel speed", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  /** Tunnel only: how far the wall turns per tube length, so the tube becomes a spiral. Log spiral keeps its own wider twist. */
  tunnelTwist: { label: "Twist", min: -10, max: 10, step: 0.1, value: 0, unit: "°", drift: "wave", low: -5, high: 5, on: false },
  mapFog: { label: "Depth fade", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.3, high: 0.8, on: false },
  /** The handles are whole numbers, but a drifting count moves smoothly between them (see fold() in shaders.ts). */
  segments: { label: "Segments", min: 0, max: 24, step: 1, value: 0, drift: "wave", low: 3, high: 8, on: false },
  /** Tile modes only: screen heights between neighbor cell centers. */
  tileSize: { label: "Tile size", min: 0.1, max: 2, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.8, on: false },
  /** The center is a fraction of the screen size: -0.5 and 0.5 are the screen edges. */
  centerX: { label: "Center X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  centerY: { label: "Center Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
  rotation: { label: "Rotation", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  zoom: { label: "Zoom", min: 0.2, max: 4, step: 0.01, value: 1, drift: "wave", low: 0.6, high: 1.8, on: false },
  panX: { label: "Pan X", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  panY: { label: "Pan Y", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  twirl: { label: "Twirl", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -1.5, high: 1.5, on: false },
  /**
   * Blur: how much the picture is blurred where the mask is full, in pixels
   * at 1080p (it scales with the picture height). The mask decides where.
   * Size, softness and the mask position are in screen heights from the
   * screen center; the level is a brightness.
   */
  blurAmount: { label: "Blur", min: 0, max: 100, step: 1, value: 0, unit: "px", drift: "wave", low: 0, high: 40, on: false },
  blurMaskSize: { label: "Mask size", min: 0.02, max: 1.5, step: 0.01, value: 0.35, drift: "wave", low: 0.15, high: 0.6, on: false },
  blurMaskSoft: { label: "Softness", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 0.8, on: false },
  blurMaskX: { label: "Mask X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  blurMaskY: { label: "Mask Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  blurMaskAngle: { label: "Mask angle", min: 0, max: 360, step: 1, value: 90, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  blurMaskLevel: { label: "Level", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.7, on: false },
  /** Trail values are per 1/60 s; the renderer scales them to the real frame time. */
  trailAmount: { label: "Trail length", min: 0, max: 0.98, step: 0.01, value: 0, drift: "wave", low: 0.7, high: 0.95, on: false },
  trailZoom: { label: "Trail zoom", min: 0.97, max: 1.03, step: 0.001, value: 1, drift: "wave", low: 0.996, high: 1.015, on: false },
  trailTurn: { label: "Trail turn", min: -1, max: 1, step: 0.01, value: 0, unit: "°", drift: "wave", low: -0.3, high: 0.3, on: false },
  /** Flow pushes the old frame along its brightness slopes (swirl 0) or around them (swirl 1). Below 0, the push goes the other way. */
  trailFlow: { label: "Trail flow", min: -100, max: 100, step: 0.1, value: 0, unit: "px", drift: "wave", low: 2, high: 8, on: false },
  trailSwirl: { label: "Flow swirl", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0.3, high: 1, on: false },
  /**
   * How strongly the old part of the trails is multiplied by the trail color
   * each 1/60 s, so the trails take that color and get darker as they age.
   */
  trailTint: { label: "Trail tint", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.6, on: false },
  trailHue: { label: "Trail hue", min: -10, max: 10, step: 0.1, value: 0, unit: "°", drift: "wave", low: -3, high: 3, on: false },
  /** Relief lighting: the picture's brightness becomes height, lit from "Light angle". */
  reliefAmount: { label: "Relief", min: 0, max: 1.5, step: 0.01, value: 0, drift: "wave", low: 0.3, high: 0.9, on: false },
  reliefDepth: { label: "Relief depth", min: 0.5, max: 20, step: 0.1, value: 6, drift: "wave", low: 3, high: 10, on: false },
  reliefSize: { label: "Relief size", min: 0.5, max: 6, step: 0.1, value: 1.5, unit: "px", drift: "wave", low: 1, high: 3, on: false },
  lightAngle: { label: "Light angle", min: 0, max: 360, step: 1, value: 135, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  shine: { label: "Shine", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  sharpen: { label: "Sharpen", min: 0, max: 3, step: 0.01, value: 0, drift: "wave", low: 0.2, high: 1, on: false },
  sharpenRadius: { label: "Sharpen radius", min: 0.5, max: 4, step: 0.1, value: 1, unit: "px", drift: "wave", low: 0.8, high: 2.5, on: false },
  /** Color overlay: the opacity of state.overlayColor, blended over the whole picture. */
  overlayOpacity: { label: "Color overlay", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.5, on: false },
  /** Exposure is in stops: each -1 halves the brightness of every color, so all colors move toward black together. */
  exposure: { label: "Exposure", min: -6, max: 3, step: 0.05, value: 0, unit: " EV", drift: "wave", low: -1.5, high: 0, on: false },
  /** Colors at or below the black level become black; the rest stretch so white stays white. */
  blackLevel: { label: "Black level", min: 0, max: 0.9, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.3, on: false }
};

/**
 * The zero point (the value with no effect), for the controls where it is
 * inside the slider, not at an end. Their sliders show a tick mark there,
 * handles snap to it, and Ctrl + drag on a range handle mirrors around it.
 */
export const NO_EFFECT: Partial<Record<ParamKey, number>> = {
  warpCenterX: 0, warpCenterY: 0,
  mapScale: 1, mapPower: 1, mapPointX: 0, mapPointY: 0, mapTwist: 0, mapSpeed: 0, tunnelTwist: 0,
  centerX: 0, centerY: 0, zoom: 1, panX: 0, panY: 0, twirl: 0,
  blurMaskX: 0, blurMaskY: 0,
  trailZoom: 1, trailTurn: 0, trailHue: 0, trailFlow: 0,
  exposure: 0
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createParams(): Params {
  const params = {} as Params;
  for (const key of PARAM_KEYS) params[key] = { ...SPECS[key] };
  return params;
}

/** The start-up orders: the fold, then the map bends the folded picture, then the warp; and blur, trails, relief, final effects. */
export const defaultShapeOrder = (): ShapeStep[] => ["kaleidoscope", "map", "warp"];
export const defaultPictureOrder = (): PictureStep[] => ["blur", "trails", "relief", "finish"];

export function createPlayState(): PlayState {
  return {
    groups: { animation: true, source: true, warp: true, map: false, kaleidoscope: true, blur: true, trails: true, relief: true, finish: true },
    locks: { animation: false, source: false, warp: false, map: false, kaleidoscope: false, blur: false, trails: false, relief: false, finish: false },
    blendMode: 0, warpMode: 1, warpType: 0, warpTime: 0, mapTravel: 0, mapMode: 1, foldMode: 2, shapeOrder: defaultShapeOrder(), pictureOrder: defaultPictureOrder(), layerBlend: { warp: 0, map: 0, kaleidoscope: 0 }, blurMask: 0, trailMode: 1, overlayColor: "#ff7a1a", trailColor: "#2a6cff", paused: false, time: 0, clock: 0 };
}

/** The longest custom time a range can have, in seconds. */
export const MAX_CUSTOM_SECONDS = 120;

/** Starts a range's timing again: it is at its start handle at this time (animation time, or the clock for a custom range). */
export function startRangeAt(param: Param, time: number) {
  param.startTime = time;
}

const isCustom = (param: Param) => Boolean(param.custom && param.seconds && param.seconds > 0);

/** The time a range moves on: the real clock for a custom range, animation time otherwise. */
export const rangeClock = (param: Param, state: PlayState) => (isCustom(param) ? state.clock : state.time);

/**
 * How many trips from one handle to the other the range has made: 0 at the
 * start handle, 1 at the end handle, 2 back at the start.
 */
function tripsOf(param: Param, state: PlayState) {
  const seconds = isCustom(param) ? param.seconds! : REFERENCE_CYCLE;
  return (rangeClock(param, state) - (param.startTime ?? 0)) / seconds;
}

/**
 * Gives a range its own time ("seconds" from start to end) or, with null,
 * puts it back on the shared cycle. A range that gets its own time goes on
 * from where it is; a range that goes back to the cycle joins it in step
 * with the other ranges.
 */
export function setCustomTime(param: Param, seconds: number | null, state: PlayState) {
  if (seconds === null) {
    param.custom = false;
    param.startTime = 0;
    return;
  }
  const trips = tripsOf(param, state);
  param.custom = true;
  param.seconds = clamp(seconds, 1, MAX_CUSTOM_SECONDS);
  param.startTime = state.clock - trips * param.seconds;
}

/**
 * The value a parameter has now. A range goes from its start handle to its
 * end handle in one cycle (or in its own seconds), and back in the next.
 */
export function liveValue(param: Param, state: PlayState): number {
  if (!param.drift || !param.on) return param.value;
  const start = clamp(param.low ?? param.min, param.min, param.max);
  const end = clamp(param.high ?? param.max, param.min, param.max);
  const bottom = Math.min(start, end);
  const top = Math.max(start, end);
  if (bottom === top) return bottom;
  const trips = tripsOf(param, state);
  /* A whole circle turns once per cycle, without stopping. */
  if (param.drift === "spin" && bottom <= param.min && top >= param.max) {
    const offset = (trips % 1 + 1) % 1 * 360;
    return end > start ? bottom + offset : top - offset;
  }
  const travel = (trips % 2 + 2) % 2;
  return start + (end - start) * easeCurve(easeOf(param), travel <= 1 ? travel : 2 - travel);
}

/** "#rrggbb" to red, green and blue from 0 to 1. Anything else is black. */
export function hexToRgb(hex: string): [number, number, number] {
  const match = /^#([0-9a-f]{6})$/i.exec(hex);
  if (!match) return [0, 0, 0];
  const number = parseInt(match[1], 16);
  return [(number >> 16) / 255, ((number >> 8) & 255) / 255, (number & 255) / 255];
}

/** Hue in degrees, saturation and lightness from 0 to 1, to "#rrggbb". */
export function hslToHex(hue: number, saturation: number, lightness: number): string {
  const f = (n: number) => {
    const k = (n + hue / 30) % 12;
    const a = saturation * Math.min(lightness, 1 - lightness);
    const value = lightness - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/** The value a parameter has when the app starts. Double-click on a slider goes back to it. */
export function defaultValue(key: ParamKey): number {
  return SPECS[key].value;
}

/** The full slider span as a drift range, in the range's current direction. */
export function fullRange(param: Param): [number, number] {
  const reversed = (param.high ?? param.max) < (param.low ?? param.min);
  return reversed ? [param.max, param.min] : [param.min, param.max];
}

export function formatValue(param: Param, value: number): string {
  const decimals = (String(param.step).split(".")[1] ?? "").length;
  return value.toFixed(Math.max(decimals, param.step < 1 ? 2 : 0)) + (param.unit ?? "");
}

/** Picks a new random look. The range is on only for the values that move the picture most. */
export function randomizeParams(params: Params, state?: PlayState) {
  /** Settings of locked groups are copied first and put back at the end, so Randomize leaves them as they were. */
  const lockedGroups = state ? (Object.keys(GROUP_PARAMS) as GroupKey[]).filter((group) => state.locks[group]) : [];
  const kept = lockedGroups.flatMap((group) => GROUP_PARAMS[group].map((key) => [key, { ...params[key] }] as const));
  const keptState = state && {
    groups: { ...state.groups },
    warpMode: state.warpMode,
    warpType: state.warpType,
    mapMode: state.mapMode,
    foldMode: state.foldMode,
    shapeOrder: [...state.shapeOrder],
    overlayColor: state.overlayColor
  };
  randomizeAll(params, state);
  for (const [key, saved] of kept) Object.assign(params[key], saved);
  if (state && keptState) {
    for (const group of lockedGroups) state.groups[group] = keptState.groups[group];
    if (state.locks.warp) {
      state.warpMode = keptState.warpMode;
      state.warpType = keptState.warpType;
    }
    if (state.locks.map) state.mapMode = keptState.mapMode;
    if (state.locks.kaleidoscope) state.foldMode = keptState.foldMode;
    /* The shape order involves all three shape groups, so locking any of them keeps it. */
    if (state.locks.warp || state.locks.map || state.locks.kaleidoscope) state.shapeOrder = keptState.shapeOrder;
    if (state.locks.finish) state.overlayColor = keptState.overlayColor;
  }
}

/**
 * Reset: every effect control goes back to its start-up default (no effect),
 * every range is turned off, and every effect group is turned off, with its
 * modes back to their defaults. Locked groups and the source images stay.
 * Every range goes back to the shared cycle.
 */
export function resetEffects(params: Params, state: PlayState) {
  const fresh = createPlayState();
  for (const group of Object.keys(GROUP_PARAMS) as GroupKey[]) {
    if (group === "source" || group === "animation" || state.locks[group]) continue;
    for (const key of GROUP_PARAMS[group]) {
      const { value, low, high, on } = SPECS[key];
      Object.assign(params[key], { value, low, high, on, ease: undefined, custom: false, startTime: 0 });
    }
    state.groups[group] = false;
  }
  if (!state.locks.warp) {
    state.warpMode = fresh.warpMode;
    state.warpType = fresh.warpType;
  }
  if (!state.locks.map) state.mapMode = fresh.mapMode;
  if (!state.locks.kaleidoscope) state.foldMode = fresh.foldMode;
  if (!state.locks.blur) state.blurMask = fresh.blurMask;
  if (!state.locks.trails) {
    state.trailMode = fresh.trailMode;
    state.trailColor = fresh.trailColor;
  }
  if (!state.locks.finish) state.overlayColor = fresh.overlayColor;
  if (!state.locks.warp && !state.locks.map && !state.locks.kaleidoscope) state.shapeOrder = fresh.shapeOrder;
  for (const step of ["warp", "map", "kaleidoscope"] as const) if (!state.locks[step]) state.layerBlend[step] = 0;
  if (!state.locks.blur && !state.locks.trails && !state.locks.relief && !state.locks.finish) state.pictureOrder = fresh.pictureOrder;
}

/** The parameters in each settings group, for locking. */
export const GROUP_PARAMS: Record<GroupKey, ParamKey[]> = {
  /** The shared cycle is how the user plays the animation; Randomize and Reset leave it alone. */
  animation: ["cycle"],
  /** The images are the user's choice; Randomize does not change the blend. */
  source: ["imageBlend"],
  warp: ["warpOpacity", "warpAmount", "warpScale", "warpMarble", "warpDetail", "warpFlow", "warpCenterX", "warpCenterY", "warpAngle"],
  map: ["mapOpacity", "mapMix", "mapScale", "mapPower", "mapPointX", "mapPointY", "mapSteps", "mapTwist", "mapAngle", "mapSpeed", "mapFog", "tunnelTwist"],
  kaleidoscope: ["foldOpacity", "segments", "tileSize", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl"],
  blur: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle", "blurMaskLevel"],
  trails: ["trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint"],
  relief: ["reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine"],
  finish: ["sharpen", "sharpenRadius", "overlayOpacity", "exposure", "blackLevel"]
};

function randomizeAll(params: Params, state?: PlayState) {
  if (state) {
    state.overlayColor = hslToHex(rand(0, 360), rand(0.5, 1), rand(0.35, 0.6));
    state.groups.map = Math.random() < 0.75;
    state.mapMode = (1 + Math.floor(Math.random() * 6)) as MapMode;
    state.groups.warp = Math.random() < 0.7;
    /* Noise is the most common warp; the other kinds share the rest. */
    state.warpType = (Math.random() < 0.4 ? 0 : 1 + Math.floor(Math.random() * 5)) as WarpType;
    /* Usually the warp acts last on the picture (it breaks the symmetry), and the map after the fold. */
    const middle: ShapeStep[] = Math.random() < 0.75 ? ["kaleidoscope", "map"] : ["map", "kaleidoscope"];
    state.shapeOrder = Math.random() < 0.65 ? [...middle, "warp"] : ["warp", ...middle];
    const fold = Math.random();
    state.foldMode = (fold < 0.6 ? 0 : fold < 0.8 ? 1 : 2) as FoldMode;
  }
  /**
   * Sets the value and a drift range of +/- spread around it, kept inside
   * the limits. A value of 0 (no effect) is different: the range starts at 0
   * and moves "spread" away from it, so the effect grows from nothing. It
   * moves to the side the limits allow, or to a random side when both do.
   */
  const set = (key: ParamKey, value: number, spread = 0) => {
    const param = params[key];
    param.value = clamp(value, param.min, param.max);
    if (!param.drift) return;
    if (param.value === 0) {
      const side = param.min >= 0 ? 1 : param.max <= 0 ? -1 : Math.random() < 0.5 ? -1 : 1;
      param.low = 0;
      param.high = clamp(side * spread, param.min, param.max);
      return;
    }
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
  };
  const segmentChoices = [0, 3, 4, 5, 6, 6, 8, 8, 10, 12, 16];
  /* Only the value: the segment range keeps its handles, and Randomize leaves it off. */
  params.segments.value = segmentChoices[Math.floor(Math.random() * segmentChoices.length)];
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
  set("mapSpeed", (Math.random() < 0.8 ? 1 : -1) * rand(0.1, 0.6), rand(0, 0.2));
  set("mapFog", rand(0.3, 0.9), rand(0, 0.15));
  set("tunnelTwist", Math.random() < 0.4 ? 0 : rand(-8, 8), rand(1, 4));
  set("centerX", rand(-0.2, 0.2), rand(0.1, 0.35));
  set("centerY", rand(-0.15, 0.15), rand(0.08, 0.3));
  setAngle("rotation", 0.7);
  set("zoom", rand(0.6, 2.4), rand(0.2, 0.8));
  set("panX", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("panY", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("twirl", Math.random() < 0.4 ? rand(-1.5, 1.5) : 0, rand(0.3, 1));
  set("blurAmount", Math.random() < 0.5 ? 0 : rand(5, 30), rand(3, 15));
  set("blurMaskSize", rand(0.15, 0.6), rand(0.05, 0.2));
  set("blurMaskSoft", rand(0.2, 0.9), rand(0, 0.2));
  if (state) state.blurMask = Math.floor(Math.random() * 6) as BlurMask;
  set("trailAmount", rand(0.6, 0.95), rand(0.03, 0.1));
  set("trailZoom", rand(0.992, 1.02), rand(0.002, 0.008));
  set("trailTurn", rand(-0.4, 0.4), rand(0.05, 0.3));
  set("trailFlow", Math.random() < 0.5 ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(2, 10), rand(1, 4));
  set("trailSwirl", rand(0, 1), rand(0, 0.3));
  set("trailTint", Math.random() < 0.6 ? 0 : rand(0.1, 0.5), rand(0, 0.15));
  if (state) state.trailColor = hslToHex(rand(0, 360), rand(0.6, 1), rand(0.3, 0.55));
  set("tileSize", rand(0.25, 0.9), rand(0.05, 0.2));
  set("trailHue", Math.random() < 0.3 ? rand(-3, 3) : 0, rand(0.5, 3));
  set("reliefAmount", Math.random() < 0.6 ? 0 : rand(0.3, 1), rand(0.1, 0.3));
  set("reliefDepth", rand(3, 12), rand(0, 3));
  set("reliefSize", rand(1, 3), rand(0, 0.8));
  setAngle("lightAngle", 0.5);
  set("shine", Math.random() < 0.5 ? 0 : rand(0.1, 0.6), rand(0, 0.2));
  set("sharpen", rand(0, 1.2), rand(0, 0.3));
  set("sharpenRadius", rand(0.7, 2.5), rand(0, 0.8));
  set("exposure", Math.random() < 0.6 ? 0 : rand(-1, 0.3), rand(0, 0.5));
  set("overlayOpacity", Math.random() < 0.75 ? 0 : rand(0.1, 0.4), rand(0, 0.15));
  set("blackLevel", Math.random() < 0.6 ? 0 : rand(0.02, 0.25), rand(0, 0.1));
  /** Every range starts off; Randomize turns on the ones that move the picture most. */
  const moving: ParamKey[] = ["warpAmount", "warpMarble", "mapPower", "mapPointX", "mapPointY", "mapTwist", "mapSpeed", "lightAngle",
    "centerX", "centerY", "rotation", "zoom", "panX", "panY"];
  for (const key of PARAM_KEYS) {
    const userOwned = GROUP_PARAMS.source.includes(key) || GROUP_PARAMS.animation.includes(key) || OPACITY_KEYS.includes(key);
    if (params[key].drift && !userOwned) params[key].on = moving.includes(key);
  }
  params.twirl.on = Math.random() < 0.5;
}
