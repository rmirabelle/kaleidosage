import type { BlendMode, BlurMask, CameraRepeat, FoldMode, FxStep, LayerBlend, MapMode, PictureStep, ShapeStep, SmearShape, TrailMode, WarpMode, WarpType } from "./renderer";

export const PARAM_KEYS = [
  "cycle",
  "imageBlend",
  "warpOpacity", "mapOpacity", "foldOpacity",
  "warpAmount", "warpScale", "warpCellSize", "warpCellAngle", "warpCellSides", "warpCellRandom", "warpMarble", "warpDetail", "warpFlow", "warpCenterX", "warpCenterY", "warpAngle",
  "mapMix", "mapScale", "mapPower", "mapPointX", "mapPointY", "mapSteps", "mapArms", "mapTwist", "mapAngle", "mapSpeed", "mapFog", "tunnelTwist",
  "mobiusRotation", "mobiusTwist", "mobiusZoom", "mobiusPanX", "mobiusPanY",
  "segments", "tileSize", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl",
  "blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle", "blurMaskLevel",
  "trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint",
  "smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade",
  "contourHue", "contourOpacity", "contourLines", "contourWidth", "contourResolution", "contourSteady",
  "reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine",
  "cameraAmount", "cameraHeight", "cameraTilt", "cameraTurn", "cameraSpeed", "cameraDistance", "cameraLens", "cameraLightTurn", "cameraLightHeight", "cameraShadow", "cameraFog", "cameraSky", "cameraShine", "cameraSmooth",
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
  /**
   * "log": the slider and the range move in equal ratios, not equal steps,
   * so small values get as much of the slider as large ones (min must be
   * above 0). See toSlider and fromSlider.
   */
  scale?: "log";
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
 *
 * The dramatic curves: early, pulse and late step from one handle to the
 * other at a quarter, a half, and three quarters of the trip. Out and back,
 * a step makes a square wave that sits at the end handle three quarters,
 * half, or a quarter of the time. Explode and implode are one-way curves
 * (see ONE_WAY): they play once per trip, from the start handle back to the
 * start handle, and never run backward. Explode is a blast wave: the value
 * shoots to the end handle, then falls back to the start handle, fast at
 * first and slower later. Implode is the same played backward: a slow
 * build to the end handle, then a snap back to the start.
 */
export type Ease = "organic" | "linear" | "inOut" | "in" | "out" | "bounce" | "explode" | "implode" | "early" | "pulse" | "late";
export const EASES: readonly (readonly [Ease, string])[] = [
  ["organic", "Smooth"], ["linear", "Linear"], ["inOut", "Ease in-out"], ["in", "Ease in"], ["out", "Ease out"], ["bounce", "Bounce"],
  ["explode", "Explode"], ["implode", "Implode"], ["early", "Early"], ["pulse", "Pulse"], ["late", "Late"]
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

/**
 * The curves that play one way, once per trip, and end where they began
 * (at the start handle), instead of going out on one trip and back on the
 * next.
 */
export const ONE_WAY: ReadonlySet<Ease> = new Set<Ease>(["explode", "implode"]);

/**
 * Explode, shaped like the pressure of a blast wave: the value shoots up in
 * the first 3% of the trip to the end handle, then falls back to the start
 * handle, fast at first and slower and slower (the Friedlander shape: a
 * straight fall times a fast decay), and rests there for the last part of
 * the trip. One peak, no swinging.
 */
function explode(t: number) {
  const rise = 0.03;
  if (t <= 0 || t >= 1) return 0;
  if (t < rise) return t / rise;
  const u = (t - rise) / (1 - rise);
  return (1 - u) * Math.exp(-3 * u);
}

/**
 * A curve for t from 0 to 1. A back-and-forth curve goes from 0 to 1; a
 * one-way curve (see ONE_WAY) starts and ends at 0.
 */
export function easeCurve(kind: Ease, t: number): number {
  switch (kind) {
    case "linear": return t;
    case "inOut": return t < 0.5 ? 4 * t ** 3 : 1 - (2 - 2 * t) ** 3 / 2;
    case "in": return t ** 3;
    case "out": return 1 - (1 - t) ** 3;
    case "bounce": return bounceOut(t);
    case "explode": return explode(t);
    case "implode": return explode(1 - t);
    case "early": return t < 0.25 ? 0 : 1;
    case "pulse": return t < 0.5 ? 0 : 1;
    case "late": return t < 0.75 ? 0 : 1;
    default: return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }
}

export type Params = Record<ParamKey, Param>;

/** The settings groups that can be turned off as a whole. */
/** The contour lines' color: the Color slider's fully saturated hue, black, or white. */
export type ContourTone = "hue" | "black" | "white";
export const CONTOUR_TONES: readonly ContourTone[] = ["hue", "black", "white"];

export type GroupKey = "animation" | "source" | "warp" | "map" | "kaleidoscope" | "blur" | "trails" | "smear" | "contours" | "relief" | "camera" | "finish";

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
  /** Where the camera's aim point is on the land (screen heights); it moves with time × camera speed, the way the camera looks. */
  cameraX: number;
  cameraY: number;
  mapMode: MapMode;
  /** Radial wedges, or triangle or hexagon tiles. */
  foldMode: FoldMode;
  /**
   * The effects the user added, in the order the panel lists them: shape
   * steps (they move pixels) and picture steps (they change the drawn
   * picture) mixed. The first step acts first on the picture, and each next
   * step works on that result. An effect that is not in the list does
   * nothing, and its group is off (see addEffect and removeEffect).
   */
  fxOrder: FxStep[];
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
  /** The time smear's pattern of delays (see SMEAR_SHADER). */
  smearShape: SmearShape;
  /** The contour lines' color: the Color slider's hue, or black or white. And how the lines combine with the picture under them. */
  contourTone: ContourTone;
  contourBlend: LayerBlend;
  /** How the camera's raised land combines with the flat floor under it (see CAMERA_SHADER), and the color of its sky and fog, as "#rrggbb". */
  cameraBlend: LayerBlend;
  skyColor: string;
  /** How the camera's land goes on past the picture: mirrored, repeated as it is, or not at all. */
  cameraRepeat: CameraRepeat;
  /**
   * A source video crossfades its end into its start (see video.ts). Off,
   * the video starts again at the start of each loop, with a jump.
   */
  videoCrossfade: boolean;
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
  cycle: { label: "Length", min: 5, max: 90, step: 1, value: REFERENCE_CYCLE, unit: " s" },
  warpOpacity: opacitySpec,
  mapOpacity: opacitySpec,
  foldOpacity: opacitySpec,
  /** 0 shows the first image, 1 the second. With a range, the picture fades back and forth between them. */
  imageBlend: { label: "Crossfade", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  warpAmount: { label: "Warp strength", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.05, high: 0.3, on: false },
  warpScale: { label: "Warp size", min: 0.2, max: 8, step: 0.01, value: 1.5, drift: "wave", low: 1, high: 2.5, on: false },
  /** Cells warp: the size of each cell, in tenths of the screen height. Larger makes larger cells. */
  warpCellSize: { label: "Cell size", min: 0.05, max: 25, step: 0.01, scale: "log", value: 4, drift: "wave", low: 3, high: 6, on: false },
  /** Cells warp: turns the whole cell pattern, with each cell's shift, around the center. The image does not turn. */
  warpCellAngle: { label: "Cell rotation", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  /**
   * Cells warp: the cell shape, by its number of sides. 4 gives squares;
   * from 4 to 6 the squares change step by step into hexagons; from 4 to 3
   * a diagonal cut fades in and makes each square two triangles. It can
   * drift, so the cells change shape as the scene plays.
   */
  warpCellSides: { label: "Cell sides", min: 3, max: 6, step: 0.01, value: 4, drift: "wave", low: 4, high: 6, on: false },
  /** Cells warp: how far each cell point moves from its place in the grid. 0 gives regular shapes. */
  warpCellRandom: { label: "Cell randomness", min: 0, max: 1, step: 0.01, value: 0.7, drift: "wave", low: 0.2, high: 0.7, on: false },
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
  /**
   * Seamless spiral: how far the spiral twists. Negative twists the other
   * way; 0 gives rings. Any value stays seamless (see the stretch in
   * complexMap), so it can drift like the other ranges.
   */
  mapArms: { label: "Twist", min: -8, max: 8, step: 0.05, value: 2, drift: "wave", low: 1, high: 3, on: false },
  mapTwist: { label: "Twist", min: -80, max: 80, step: 1, value: 0, unit: "°", drift: "wave", low: 10, high: 50, on: false },
  /** Power, log spiral and tunnel fold the picture over an axis (so there is no seam); this turns that axis. */
  mapAngle: { label: "Axis angle", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  /** Tunnel only: forward speed in tube lengths per second (backward below 0), and how dark the far end gets. */
  mapSpeed: { label: "Tunnel speed", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  /** Tunnel only: how far the wall turns per tube length, so the tube becomes a spiral. Log spiral keeps its own wider twist. */
  tunnelTwist: { label: "Twist", min: -10, max: 10, step: 0.1, value: 0, unit: "°", drift: "wave", low: -5, high: 5, on: false },
  mapFog: { label: "Depth fade", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.3, high: 0.8, on: false },
  /**
   * Möbius only: a turn, a twist (which turns more with distance, like the
   * kaleidoscope's twirl), a zoom and a pan, applied to the point after the
   * Möbius map.
   */
  mobiusRotation: { label: "Rotation", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  mobiusTwist: { label: "Twist", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -1, high: 1, on: false },
  mobiusZoom: { label: "Zoom", min: 0.2, max: 4, step: 0.01, value: 1, drift: "wave", low: 0.7, high: 1.6, on: false },
  mobiusPanX: { label: "Pan X", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  mobiusPanY: { label: "Pan Y", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  /** The handles are whole numbers, but a drifting count moves smoothly between them (see fold() in shaders.ts). */
  segments: { label: "Segments", min: 0, max: 24, step: 1, value: 0, drift: "wave", low: 3, high: 8, on: false },
  /** Tile modes only: screen heights between neighbor cell centers. */
  tileSize: { label: "Tile size", min: 0.1, max: 2, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.8, on: false },
  /** The center is a fraction of the screen size: -0.5 and 0.5 are the screen edges. */
  centerX: { label: "Offset X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  centerY: { label: "Offset Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
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
  /**
   * Time smear: each pixel shows the picture from up to "Delay" seconds
   * ago, by a pattern. Angle turns the Linear and Sweep patterns; Bands
   * repeats the pattern back and forth.
   */
  smearAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  smearDelay: { label: "Delay", min: 0.05, max: 3, step: 0.01, value: 1, unit: " s", drift: "wave", low: 0.5, high: 2, on: false },
  smearAngle: { label: "Angle", min: 0, max: 360, step: 1, value: 90, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  smearBands: { label: "Bands", min: 1, max: 12, step: 0.1, value: 1, drift: "wave", low: 1, high: 4, on: false },
  /**
   * Restart: every this many seconds of play, the smear forgets its kept
   * frames, so the picture is sharp again and the smear grows back over the
   * delay (0 = never). Fade: the seconds before each restart in which the
   * smear fades out (0 = it jumps back to sharp).
   */
  smearRestart: { label: "Restart", min: 0, max: 20, step: 0.1, value: 0, unit: " s" },
  smearFade: { label: "Fade", min: 0, max: 3, step: 0.05, value: 0.5, unit: " s" },
  /**
   * Contour lines where the brightness crosses evenly spaced levels.
   * Color is the lines' hue, fully saturated (unless the lines are black
   * or white, see contourTone), Opacity how strongly the lines show,
   * Density how many levels there are.
   * Resolution sets how much fine detail the lines follow: the brightness is
   * blurred by (max - resolution) mip levels.
   */
  contourHue: { label: "Color", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  contourOpacity: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.4, high: 1, on: false },
  contourLines: { label: "Density", min: 2, max: 80, step: 1, value: 16, drift: "wave", low: 8, high: 30, on: false },
  contourWidth: { label: "Line width", min: 0.5, max: 12, step: 0.1, value: 1.5, unit: "px", drift: "wave", low: 1, high: 4, on: false },
  contourResolution: { label: "Resolution", min: 0, max: 6, step: 0.1, value: 4, drift: "wave", low: 2, high: 5, on: false },
  /** Smooth: how much of the last frame's contour brightness each 1/60 s keeps, so the lines glide instead of jumping. */
  contourSteady: { label: "Smooth", min: 0, max: 0.98, step: 0.01, value: 0.8, drift: "wave", low: 0.5, high: 0.9, on: false },
  /** Relief lighting: the picture's brightness becomes height, lit from "Light angle". */
  reliefAmount: { label: "Relief", min: 0, max: 1.5, step: 0.01, value: 0, drift: "wave", low: 0.3, high: 0.9, on: false },
  reliefDepth: { label: "Relief depth", min: 0.5, max: 20, step: 0.1, value: 6, drift: "wave", low: 3, high: 10, on: false },
  reliefSize: { label: "Relief size", min: 0.5, max: 6, step: 0.1, value: 1.5, unit: "px", drift: "wave", low: 1, high: 3, on: false },
  lightAngle: { label: "Light angle", min: 0, max: 360, step: 1, value: 135, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  shine: { label: "Shine", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  /**
   * Camera (see CAMERA_SHADER): how much the raised land shows over the
   * same camera's view of the flat picture, the land's height at white (below 0, dark areas rise), the
   * camera's tilt from straight down and its turn around the center, its
   * speed over the land (screen heights per second, the way it looks;
   * below 0 flies backward), its distance (screen heights) and lens angle, the sun's direction and
   * height, the shadows' darkness, the fog, how much the sky and fog take
   * state.skyColor (0 = the picture's mean color), the shine of the land,
   * and how blurred the height is.
   */
  cameraAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  cameraHeight: { label: "Height", min: -1, max: 1, step: 0.01, value: 0.25, drift: "wave", low: 0.1, high: 0.4, on: false },
  cameraTilt: { label: "Tilt", min: 0, max: 85, step: 1, value: 50, unit: "°", drift: "wave", low: 20, high: 70, on: false },
  cameraTurn: { label: "Turn", min: 0, max: 360, step: 1, value: 270, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  cameraSpeed: { label: "Speed", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  cameraDistance: { label: "Distance", min: 0.3, max: 5, step: 0.01, value: 1.6, drift: "wave", low: 1, high: 3, on: false },
  cameraLens: { label: "Lens", min: 20, max: 120, step: 1, value: 60, unit: "°", drift: "wave", low: 40, high: 90, on: false },
  cameraLightTurn: { label: "Sun angle", min: 0, max: 360, step: 1, value: 135, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  cameraLightHeight: { label: "Sun height", min: 5, max: 90, step: 1, value: 40, unit: "°", drift: "wave", low: 15, high: 60, on: false },
  cameraShadow: { label: "Shadows", min: 0, max: 1, step: 0.01, value: 0.7, drift: "wave", low: 0.3, high: 1, on: false },
  cameraFog: { label: "Fog", min: 0, max: 1, step: 0.01, value: 0.2, drift: "wave", low: 0, high: 0.5, on: false },
  cameraSky: { label: "Sky", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.2, high: 0.8, on: false },
  cameraShine: { label: "Shine", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  cameraSmooth: { label: "Smooth", min: 0, max: 6, step: 0.1, value: 2.5, drift: "wave", low: 1, high: 4, on: false },
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
  warpCenterX: 0, warpCenterY: 0, cameraHeight: 0, cameraSpeed: 0,
  mapScale: 1, mapPower: 1, mapArms: 0, mapPointX: 0, mapPointY: 0, mapTwist: 0, mapSpeed: 0, tunnelTwist: 0,
  mobiusTwist: 0, mobiusZoom: 1, mobiusPanX: 0, mobiusPanY: 0,
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

/** The start-up orders: the fold, then the map bends the folded picture, then the warp; and blur, trails, time smear, contours, relief, camera, final effects. */
export const defaultShapeOrder = (): ShapeStep[] => ["kaleidoscope", "map", "warp"];
export const defaultPictureOrder = (): PictureStep[] => ["blur", "trails", "smear", "contours", "relief", "camera", "finish"];
export const defaultFxOrder = (): FxStep[] => [...defaultShapeOrder(), ...defaultPictureOrder()];

/**
 * The order with some of its steps (for example all shape steps) put in
 * the order "kindOrder", in the places those steps have now. The other
 * steps stay where they are.
 */
export function withKindOrder(order: FxStep[], kindOrder: FxStep[]): FxStep[] {
  const queue = [...kindOrder];
  return order.map((step) => (kindOrder.includes(step) ? queue.shift()! : step));
}

/** Adds an effect at the end of the list and turns its group on. */
export function addEffect(state: PlayState, step: FxStep) {
  if (!state.fxOrder.includes(step)) state.fxOrder = [...state.fxOrder, step];
  state.groups[step] = true;
}

/** Takes an effect out of the list and turns its group off. Its settings stay, for when it is added again. */
export function removeEffect(state: PlayState, step: FxStep) {
  state.fxOrder = state.fxOrder.filter((item) => item !== step);
  state.groups[step] = false;
}

/**
 * True when an effect that is on changes the picture with its settings. A
 * scene from before the effect list listed every effect; it keeps only
 * these (see applyScene).
 */
export function effectShows(step: FxStep, params: Params, state: PlayState): boolean {
  if (!state.groups[step]) return false;
  const used = (key: ParamKey) => params[key].value !== 0 || Boolean(params[key].drift && params[key].on);
  switch (step) {
    case "warp": return used("warpAmount");
    case "blur": return used("blurAmount");
    case "trails": return used("trailAmount");
    case "smear": return used("smearAmount");
    case "contours": return used("contourOpacity");
    case "relief": return used("reliefAmount");
    case "finish": return used("sharpen") || used("exposure") || used("blackLevel") || used("overlayOpacity");
    default: return true;
  }
}

export function createPlayState(): PlayState {
  return {
    /* No effect is in the list at start-up, so every effect group is off. */
    groups: { animation: true, source: true, warp: false, map: false, kaleidoscope: false, blur: false, trails: false, smear: false, contours: false, relief: false, camera: false, finish: false },
    locks: { animation: false, source: false, warp: false, map: false, kaleidoscope: false, blur: false, trails: false, smear: false, contours: false, relief: false, camera: false, finish: false },
    blendMode: 0, warpMode: 1, warpType: 0, warpTime: 0, mapTravel: 0, cameraX: 0, cameraY: 0, mapMode: 1, foldMode: 2, fxOrder: [], layerBlend: { warp: 0, map: 0, kaleidoscope: 0 }, blurMask: 0, trailMode: 1, overlayColor: "#ff7a1a", trailColor: "#2a6cff", smearShape: 0, contourTone: "hue", contourBlend: 0, cameraBlend: 0, skyColor: "#7fa6e6", cameraRepeat: 0, videoCrossfade: false, paused: false, time: 0, clock: 0 };
}

/** The longest custom time a range can have, in seconds. */
export const MAX_CUSTOM_SECONDS = 120;

/** Starts a range's timing again: it is at its start handle at this time (animation time, or the clock for a custom range). */
export function startRangeAt(param: Param, time: number) {
  param.startTime = time;
}

export const isCustom = (param: Param) => Boolean(param.custom && param.seconds && param.seconds > 0);

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
  const kind = easeOf(param);
  /* A one-way curve plays whole on every trip; the others go out on one trip and back on the next. */
  const travel = ONE_WAY.has(kind) ? (trips % 1 + 1) % 1 : (trips % 2 + 2) % 2;
  const part = easeCurve(kind, travel <= 1 ? travel : 2 - travel);
  /* A log slider's range moves at the same speed along the slider, so in equal ratios. */
  if (param.scale === "log") return start * (end / start) ** part;
  return start + (end - start) * part;
}

/** The positions of a log slider: it moves in this many equal ratios from min to max. */
export const SLIDER_STEPS = 1000;

/** Where a value is on its slider: the value itself, or a position from 0 to SLIDER_STEPS on a log slider. */
export function toSlider(param: Param, value: number): number {
  if (param.scale !== "log") return value;
  return Math.log(clamp(value, param.min, param.max) / param.min) / Math.log(param.max / param.min) * SLIDER_STEPS;
}

/** The value at a slider position (see toSlider), on the parameter's steps and inside its limits. */
export function fromSlider(param: Param, position: number): number {
  if (param.scale !== "log") return position;
  const value = param.min * (param.max / param.min) ** (clamp(position, 0, SLIDER_STEPS) / SLIDER_STEPS);
  const decimals = (String(param.step).split(".")[1] ?? "").length;
  return Number(clamp(Math.round(value / param.step) * param.step, param.min, param.max).toFixed(decimals));
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
/** How far Nudge moves each value: this part of its slider's full range. */
export const NUDGE = 0.025;

/**
 * Nudge: moves every value of the unlocked groups a little, up or down at
 * random: NUDGE of its slider's full range, kept inside the slider and on
 * its steps. A range moves both handles, each on its own way; a whole-circle
 * turn keeps its full range, and other angles wrap around the circle. A
 * value at 0 stays 0, so an effect that is off stays off. As with
 * Randomize, the scene length, the image blend and the layer opacities stay;
 * menus and colors do not change.
 */
export function nudgeParams(params: Params, state: PlayState, random = Math.random) {
  for (const group of Object.keys(GROUP_PARAMS) as GroupKey[]) {
    if (group === "animation" || group === "source" || state.locks[group]) continue;
    for (const key of GROUP_PARAMS[group]) {
      if (OPACITY_KEYS.includes(key)) continue;
      const param = params[key];
      const circle = param.drift === "spin" && param.min === 0 && param.max === 360;
      const nudge = (value: number) => {
        if (value === 0) return 0;
        /* A log slider moves the same part of its length. */
        if (param.scale === "log") return fromSlider(param, toSlider(param, value) + (random() < 0.5 ? -1 : 1) * SLIDER_STEPS * NUDGE);
        const moved = value + (random() < 0.5 ? -1 : 1) * (param.max - param.min) * NUDGE;
        const inside = circle ? ((moved % 360) + 360) % 360 : clamp(moved, param.min, param.max);
        const stepped = param.min + Math.round((inside - param.min) / param.step) * param.step;
        return Number(clamp(stepped, param.min, param.max).toFixed(6));
      };
      param.value = nudge(param.value);
      if (!param.drift || !param.on) continue;
      const low = param.low ?? param.min;
      const high = param.high ?? param.max;
      if (circle && Math.min(low, high) <= param.min && Math.max(low, high) >= param.max) continue;
      param.low = nudge(low);
      param.high = nudge(high);
    }
  }
}

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
    overlayColor: state.overlayColor,
    skyColor: state.skyColor
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
    if (state.locks.finish) state.overlayColor = keptState.overlayColor;
    if (state.locks.camera) state.skyColor = keptState.skyColor;
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
  if (!state.locks.smear) state.smearShape = fresh.smearShape;
  if (!state.locks.contours) {
    state.contourTone = fresh.contourTone;
    state.contourBlend = fresh.contourBlend;
  }
  if (!state.locks.camera) {
    state.cameraBlend = fresh.cameraBlend;
    state.skyColor = fresh.skyColor;
    state.cameraRepeat = fresh.cameraRepeat;
  }
  if (!state.locks.finish) state.overlayColor = fresh.overlayColor;
  for (const step of ["warp", "map", "kaleidoscope"] as const) if (!state.locks[step]) state.layerBlend[step] = 0;
  /* The unlocked effects leave the list (their groups are off now); the locked ones stay, in their order. */
  state.fxOrder = state.fxOrder.filter((step) => state.locks[step]);
}

/** The parameters in each settings group, for locking. */
export const GROUP_PARAMS: Record<GroupKey, ParamKey[]> = {
  /** The shared cycle is how the user plays the animation; Randomize and Reset leave it alone. */
  animation: ["cycle"],
  /** The images are the user's choice; Randomize does not change the blend. */
  source: ["imageBlend"],
  warp: ["warpOpacity", "warpAmount", "warpScale", "warpCellSize", "warpCellAngle", "warpCellSides", "warpCellRandom", "warpMarble", "warpDetail", "warpFlow", "warpCenterX", "warpCenterY", "warpAngle"],
  map: ["mapOpacity", "mapMix", "mapScale", "mapPower", "mapPointX", "mapPointY", "mapSteps", "mapArms", "mapTwist", "mapAngle", "mapSpeed", "mapFog", "tunnelTwist",
    "mobiusRotation", "mobiusTwist", "mobiusZoom", "mobiusPanX", "mobiusPanY"],
  kaleidoscope: ["foldOpacity", "segments", "tileSize", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl"],
  blur: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle", "blurMaskLevel"],
  trails: ["trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint"],
  smear: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  contours: ["contourHue", "contourOpacity", "contourLines", "contourWidth", "contourResolution", "contourSteady"],
  relief: ["reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine"],
  camera: ["cameraAmount", "cameraHeight", "cameraTilt", "cameraTurn", "cameraSpeed", "cameraDistance", "cameraLens", "cameraLightTurn", "cameraLightHeight", "cameraShadow", "cameraFog", "cameraSky", "cameraShine", "cameraSmooth"],
  finish: ["sharpen", "sharpenRadius", "overlayOpacity", "exposure", "blackLevel"]
};

/** The play-state settings of each group that Randomize sets: a group's own Randomize changes these too. */
const GROUP_STATE: Partial<Record<GroupKey, (keyof PlayState)[]>> = {
  warp: ["warpType"],
  map: ["mapMode"],
  kaleidoscope: ["foldMode"],
  blur: ["blurMask"],
  trails: ["trailColor"],
  smear: ["smearShape"],
  contours: ["contourTone", "contourBlend"],
  camera: ["skyColor", "cameraBlend", "cameraRepeat"],
  finish: ["overlayColor"]
};

/**
 * Randomize for one group: new random settings for its controls and its
 * modes, the same as Randomize would give them. Everything else stays, and
 * so do the effect list and the group's power button. It works on copies,
 * then takes only the group's part.
 */
export function randomizeGroup(params: Params, state: PlayState, group: GroupKey) {
  const scratchParams = structuredClone(params);
  const scratchState = structuredClone(state);
  randomizeAll(scratchParams, scratchState);
  for (const key of GROUP_PARAMS[group]) Object.assign(params[key], scratchParams[key]);
  for (const key of GROUP_STATE[group] ?? []) Object.assign(state, { [key]: scratchState[key] });
}

/** The chance that Randomize puts each effect in the list. Blur looks the least good, so Randomize leaves it out. */
const EFFECT_CHANCE: Record<FxStep, number> = {
  kaleidoscope: 0.9, map: 0.75, warp: 0.7, blur: 0, trails: 0.5, smear: 0.2, contours: 0.25, relief: 0.4, camera: 0.3, finish: 0.4
};

function randomizeAll(params: Params, state?: PlayState) {
  if (state) {
    state.overlayColor = hslToHex(rand(0, 360), rand(0.5, 1), rand(0.35, 0.6));
    state.skyColor = hslToHex(Math.random() < 0.6 ? rand(190, 250) : rand(0, 360), rand(0.3, 0.8), rand(0.45, 0.8));
    state.mapMode = (1 + Math.floor(Math.random() * 7)) as MapMode;
    /* Noise is the most common warp; the other kinds share the rest. */
    state.warpType = (Math.random() < 0.4 ? 0 : 1 + Math.floor(Math.random() * 5)) as WarpType;
    /**
     * Each unlocked effect is in the new list by its chance, in a random
     * order. A locked effect keeps its place (or stays out of the list).
     */
    const chosen = defaultFxOrder().filter((step) => !state.locks[step] && Math.random() < EFFECT_CHANCE[step]);
    for (let index = chosen.length - 1; index > 0; index--) {
      const other = Math.floor(Math.random() * (index + 1));
      [chosen[index], chosen[other]] = [chosen[other], chosen[index]];
    }
    for (const step of defaultFxOrder()) if (!state.locks[step]) state.groups[step] = chosen.includes(step);
    const next = [...chosen];
    state.fxOrder.forEach((step, index) => { if (state.locks[step]) next.splice(Math.min(index, next.length), 0, step); });
    state.fxOrder = next;
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
  set("warpCellSize", rand(2, 12), rand(0.5, 2));
  setAngle("warpCellAngle", 0.3);
  set("warpCellSides", [3, 4, 5, 6][Math.floor(Math.random() * 4)], rand(0.2, 1));
  set("warpCellRandom", Math.random() < 0.3 ? 0 : rand(0.2, 0.9), rand(0.05, 0.3));
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
  setAngle("mobiusRotation", 0.5);
  set("mobiusTwist", Math.random() < 0.5 ? 0 : rand(-1.2, 1.2), rand(0.2, 0.6));
  set("mobiusZoom", rand(0.7, 1.8), rand(0.1, 0.4));
  set("mobiusPanX", Math.random() < 0.5 ? 0 : rand(-0.4, 0.4), rand(0.05, 0.25));
  set("mobiusPanY", Math.random() < 0.5 ? 0 : rand(-0.4, 0.4), rand(0.05, 0.25));
  set("centerX", rand(-0.2, 0.2), rand(0.1, 0.35));
  set("centerY", rand(-0.15, 0.15), rand(0.08, 0.3));
  setAngle("rotation", 0.7);
  set("zoom", rand(0.6, 2.4), rand(0.2, 0.8));
  set("panX", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("panY", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("twirl", Math.random() < 0.4 ? rand(-1.5, 1.5) : 0, rand(0.3, 1));
  /* Whether an effect shows is set by the list (see EFFECT_CHANCE), so its strength is never 0 here. */
  set("blurAmount", rand(5, 30), rand(3, 15));
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
  set("smearAmount", rand(0.6, 1), rand(0, 0.2));
  set("smearDelay", rand(0.3, 2), rand(0.1, 0.5));
  setAngle("smearAngle", 0.3);
  set("smearBands", Math.random() < 0.5 ? 1 : rand(1, 5), rand(0, 1));
  if (state) state.smearShape = Math.floor(Math.random() * 5) as SmearShape;
  set("contourOpacity", rand(0.4, 1), rand(0.1, 0.3));
  setAngle("contourHue", 0.3);
  set("contourLines", Math.round(rand(6, 40)), rand(2, 8));
  set("contourWidth", rand(0.8, 4), rand(0.2, 1.5));
  set("contourResolution", rand(2, 5.5), rand(0, 1));
  set("contourSteady", rand(0.6, 0.92), rand(0, 0.05));
  if (state) {
    const tone = Math.random();
    state.contourTone = tone < 0.6 ? "hue" : tone < 0.8 ? "white" : "black";
    state.contourBlend = (Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 8)) as LayerBlend;
    state.cameraBlend = (Math.random() < 0.6 ? 0 : Math.floor(Math.random() * 8)) as LayerBlend;
    state.cameraRepeat = (Math.random() < 0.7 ? 0 : Math.random() < 0.7 ? 1 : 2) as CameraRepeat;
  }
  set("reliefAmount", rand(0.3, 1), rand(0.1, 0.3));
  set("reliefDepth", rand(3, 12), rand(0, 3));
  set("reliefSize", rand(1, 3), rand(0, 0.8));
  setAngle("lightAngle", 0.5);
  set("shine", Math.random() < 0.5 ? 0 : rand(0.1, 0.6), rand(0, 0.2));
  set("cameraAmount", 1, rand(0, 0.1));
  set("cameraHeight", (Math.random() < 0.8 ? 1 : -1) * rand(0.1, 0.5), rand(0.02, 0.15));
  set("cameraTilt", rand(20, 75), rand(5, 20));
  setAngle("cameraTurn", 0.6);
  set("cameraSpeed", Math.random() < 0.5 ? 0 : (Math.random() < 0.8 ? 1 : -1) * rand(0.1, 0.6), rand(0, 0.3));
  set("cameraDistance", rand(0.8, 3), rand(0.1, 0.8));
  set("cameraLens", rand(40, 100), rand(0, 20));
  setAngle("cameraLightTurn", 0.3);
  set("cameraLightHeight", rand(15, 70), rand(0, 20));
  set("cameraShadow", rand(0.3, 1), rand(0, 0.2));
  set("cameraFog", Math.random() < 0.5 ? rand(0, 0.1) : rand(0.1, 0.6), rand(0, 0.15));
  set("cameraSky", rand(0, 1), rand(0, 0.2));
  set("cameraShine", Math.random() < 0.5 ? 0 : rand(0.1, 0.6), rand(0, 0.2));
  set("cameraSmooth", rand(1.5, 4), rand(0, 1));
  set("sharpen", rand(0, 1.2), rand(0, 0.3));
  set("sharpenRadius", rand(0.7, 2.5), rand(0, 0.8));
  set("exposure", Math.random() < 0.6 ? 0 : rand(-1, 0.3), rand(0, 0.5));
  set("overlayOpacity", Math.random() < 0.75 ? 0 : rand(0.1, 0.4), rand(0, 0.15));
  set("blackLevel", Math.random() < 0.6 ? 0 : rand(0.02, 0.25), rand(0, 0.1));
  /** Every range starts off; Randomize turns on the ones that move the picture most. */
  const moving: ParamKey[] = ["warpAmount", "warpMarble", "mapPower", "mapPointX", "mapPointY", "mapTwist", "mapSpeed", "lightAngle", "cameraTurn",
    "centerX", "centerY", "rotation", "zoom", "panX", "panY"];
  for (const key of PARAM_KEYS) {
    const userOwned = GROUP_PARAMS.source.includes(key) || GROUP_PARAMS.animation.includes(key) || OPACITY_KEYS.includes(key);
    if (params[key].drift && !userOwned) params[key].on = moving.includes(key);
  }
  params.twirl.on = Math.random() < 0.5;
}
