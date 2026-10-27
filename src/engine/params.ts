import type { BlendMode, BlurMask, CameraColors, CameraHeightSource, CameraRepeat, CycleMove, CyclePaint, DriverMode, MandelPlace, SolidMap, SolidShape, DriverSource, Tiling, FoldMode, FxStep, LayerBlend, MapMode, OutlineDraw, OutlineShape, ParticleBlend, ParticleShape, PictureBlend, PictureStep, ShapeStep, SmearShape, SortOrder, TrailMode, WarpMode, WarpType } from "./renderer";

export const PARAM_KEYS = [
  "cycle",
  "imageBlend",
  "warpOpacity", "mapOpacity", "foldOpacity",
  "warpAmount", "warpScale", "warpCellSize", "warpCellAngle", "warpCellSides", "warpCellRandom", "warpMarble", "warpDetail", "warpFlow", "warpCenterX", "warpCenterY", "warpAngle",
  "mapMix", "mapScale", "juliaZoom", "mapPower", "juliaShape", "juliaEdge", "juliaFog", "juliaFogSoftness", "mapSteps", "mapArms", "mapTwist", "mapAngle", "mapSpeed", "mapFog", "mapFogSoftness", "tunnelTwist", "mapPanX", "mapPanY", "mapRoll", "mapCurl",
  "mandelDepth", "mandelEnd", "mandelSpeed", "mandelFade", "mandelSpread", "mandelInvert", "mandelEdge", "mandelEdgeWidth", "mandelBands", "mandelFlow", "mandelTerraces", "mandelSoftness", "mandelLight", "mandelLightAngle",
  "drosteSize", "drosteSpirals", "drosteSoftness", "drosteRound", "drosteRotation", "drostePictureTurn",
  "mobiusPoint", "mobiusTurn", "mobiusRotation", "mobiusTwist", "mobiusZoom", "mobiusPanX", "mobiusPanY", "mobiusFog", "mobiusFogSoftness",
  "segments", "tileSize", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl",
  "blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle", "blurMaskLevel",
  "trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint",
  "smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade",
  "contourHue", "contourOpacity", "contourLines", "contourWidth", "contourResolution", "contourSteady",
  "reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine",
  "driverAmount", "driverStrength", "driverScale", "driverSpeed", "driverContrast",
  "cameraAmount", "cameraHeight", "cameraPan", "cameraTilt", "cameraPedestal", "cameraDolly", "cameraTruck", "cameraLens", "cameraLightTurn", "cameraLightHeight", "cameraShadow", "cameraFog", "cameraSky", "cameraShine", "cameraSmooth", "cameraTerrainScale", "cameraRoughness", "cameraRidges", "cameraSeed", "cameraDetail", "cameraDetailSize",
  "sortAmount", "sortLow", "sortHigh", "sortAngle", "sortLength", "sortThickness",
  "particleAmount", "particleBackground", "particleCount", "particleLevel", "particleSize", "particleLife", "particleSpeed", "particleGravity", "particleAngle", "particleTurbulence", "particleDrag", "particleFollow", "particleCling", "particleGradient", "particleBoost", "particleRingRadius",
  "cyclesAmount", "cyclesBackground", "cyclesCount", "cyclesSpeed", "cyclesWidth", "cyclesLength", "cyclesTurns", "cyclesFollow", "cyclesDodge", "cyclesGrid", "cyclesHead",
  "cyclesGradient", "cyclesShift", "cyclesRepeat", "cyclesAngle", "cyclesCenterX", "cyclesCenterY",
  "solidAmount", "solidBackground", "solidSize", "solidRound", "solidMorph", "solidBlobs", "solidBumps", "solidWaves", "solidSpikes", "solidSpikeCount", "solidSpikeTip", "solidLevels", "solidSpin", "solidTumble", "solidTilt", "solidBend", "solidTiles", "solidLight", "solidShading", "solidShine", "solidShadow", "solidX", "solidY",
  "raysAmount", "raysThreshold", "raysLength", "raysFade", "raysX", "raysY",
  "laserAmount", "laserCount", "laserSpread", "laserSweep", "laserSweepDelay", "laserBase", "laserBaseAngle", "laserWidth", "laserGlow", "laserGlowSize", "laserEmitter", "laserFade", "laserHue", "laserRainbow", "laserX", "laserY",
  "outlineAmount", "outlineCount", "outlineRadius", "outlineSpacing", "outlineDelay", "outlineDrawTime", "outlineLength", "outlinePoints", "outlineWidth", "outlineGlow", "outlineGlowSize", "outlineFlow", "outlineTurn", "outlineX", "outlineY",
  "pictureAmount", "pictureSize", "pictureX", "pictureY", "pictureTurn", "pictureKey",
  "bloomAmount", "bloomThreshold", "bloomSoftness", "bloomSize",
  "sharpen", "sharpenRadius", "overlayOpacity", "exposure", "blackLevel",
  /* Last, so the settings before it keep their seeds (see createParams). */
  "viewAmount",
  "outlineSpin", "outlineTumble"
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
  /** Gives each parameter its own path on the curves that never repeat (see wander). createParams sets it. */
  seed?: number;
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
 * The dramatic curves: early moves smoothly from one handle to the other
 * in the first half of the trip and waits there for the second half; late
 * waits for the first half and moves in the second. Out and back, the value
 * sits near the end handle three quarters or a quarter of the time.
 * Random and drunk never repeat (see WANDER): random is a fast wave about
 * the middle of the range, with peaks of very different lengths and
 * heights; drunk is the same wave in pairs of cycles, one tall and one
 * short. Explode and implode are one-way curves
 * (see ONE_WAY): they play once per trip, from the start handle back to the
 * start handle, and never run backward. Explode is a blast wave: the value
 * shoots to the end handle, then falls back to the start handle, fast at
 * first and slower later. Implode is the same played backward: a slow
 * build to the end handle, then a snap back to the start.
 */
export type Ease = "organic" | "linear" | "inOut" | "in" | "out" | "bounce" | "explode" | "implode" | "early" | "late" | "random" | "drunk";
export const EASES: readonly (readonly [Ease, string])[] = [
  ["organic", "Smooth"], ["linear", "Linear"], ["inOut", "Ease in-out"], ["in", "Ease in"], ["out", "Ease out"], ["bounce", "Bounce"],
  ["explode", "Explode"], ["implode", "Implode"], ["early", "Early"], ["late", "Late"], ["random", "Random"], ["drunk", "Drunk"]
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

/** The curves that never repeat: they go on from trip to trip, by the trip count, not out and back. */
export const WANDER: ReadonlySet<Ease> = new Set<Ease>(["random", "drunk"]);

/** A random number from 0 to 1 for each whole number "index" and "seed". The same numbers give the same result. */
function hash(index: number, seed: number) {
  let h = Math.imul(index | 0, 0x27d4eb2d) ^ Math.imul(seed | 0, 0x165667b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** The random curve: each trip has this many half waves, or up to "RANDOM_EXTRA" more (an even count, so every trip starts going up). */
const RANDOM_HALVES = 20;
const RANDOM_EXTRA = 12;

/**
 * Splits a trip into "count" pieces of random length (random weights: most
 * short, some long) and returns the piece that "x" (0 to 1) is in, and how
 * far into that piece it is (0 to 1). "random" gives the trip's random
 * numbers; the weights use numbers 1 to "count".
 */
function pieceAt(x: number, count: number, random: (index: number) => number) {
  const weights = Array.from({ length: count }, (_, j) => 0.5 - Math.log(1 - 0.999 * random(1 + j)));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let from = 0;
  for (let j = 0; j < count; j++) {
    const to = from + weights[j] / total;
    if (x < to || j === count - 1) return { piece: j, u: clamp((x - from) / (to - from), 0, 1) };
    from = to;
  }
  return { piece: count - 1, u: 1 };
}

/**
 * The random curve, from 0 to 1: a wave about the middle of the range (0.5)
 * that goes up, then down, then up again, with 10 to 16 peaks and as many
 * dips per trip. Each half wave is half a sine wave with its own length
 * (see pieceAt) and its own height (from a small ripple to the full way to
 * a handle). Every half wave starts and ends at the middle, so the trips
 * join without a gap.
 */
function randomCurve(trips: number, seed: number) {
  const trip = Math.floor(trips);
  const random = (index: number) => hash(trip * 256 + index, seed * 7 + 3);
  const count = RANDOM_HALVES + 2 * Math.floor(random(0) * (RANDOM_EXTRA / 2 + 1));
  const { piece, u } = pieceAt(trips - trip, count, random);
  const height = 0.06 + 0.44 * random(50 + piece) ** 0.8;
  return 0.5 + (piece % 2 === 0 ? 1 : -1) * height * Math.sin(Math.PI * u);
}

/** The drunk curve: each trip has this many pairs of sine cycles, or up to "DRUNK_EXTRA" more. */
const DRUNK_PAIRS = 5;
const DRUNK_EXTRA = 3;

/**
 * The drunk curve, from 0 to 1: like the random curve, a sine wave about
 * the middle of the range, but in pairs of whole cycles (up, down, up,
 * down), 10 to 16 cycles per trip. Each pair has its own length (see
 * pieceAt), the same for both its cycles. In each pair one cycle is tall
 * (0.3 to 0.5, near the handles) and the other short (a fifth to a half of
 * the tall one); the tall one is first or second at random.
 */
function drunkCurve(trips: number, seed: number) {
  const trip = Math.floor(trips);
  const random = (index: number) => hash(trip * 256 + index, seed * 7 + 5);
  const count = DRUNK_PAIRS + Math.floor(random(0) * (DRUNK_EXTRA + 1));
  const { piece, u } = pieceAt(trips - trip, count, random);
  const tall = 0.3 + 0.2 * random(50 + piece);
  const short = tall * (0.2 + 0.3 * random(100 + piece));
  const second = u >= 0.5;
  const height = (random(150 + piece) < 0.5) === second ? short : tall;
  return 0.5 + height * Math.sin(4 * Math.PI * u);
}

/**
 * A curve that never repeats, from 0 to 1, at "trips" trips (any number,
 * not only 0 to 1): see randomCurve and drunkCurve. "seed" gives each
 * parameter its own path.
 */
export function wander(kind: Ease, trips: number, seed: number) {
  return kind === "random" ? randomCurve(trips, seed) : drunkCurve(trips, seed);
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
    case "early": return t < 0.5 ? 0.5 - 0.5 * Math.cos(2 * Math.PI * t) : 1;
    case "late": return t < 0.5 ? 0 : 0.5 + 0.5 * Math.cos(2 * Math.PI * t);
    /* The menu's drawing of a curve that never repeats: a sample of it over a few trips. */
    case "random": return wander(kind, 0.5 * t, 4);
    case "drunk": return wander(kind, 0.5 * t, 11);
    default: return 0.5 - 0.5 * Math.cos(Math.PI * t);
  }
}

export type Params = Record<ParamKey, Param>;

/** The settings groups that can be turned off as a whole. */
/** The contour lines' color: the Color slider's fully saturated hue, black, or white. */
export type ContourTone = "hue" | "black" | "white";
export const CONTOUR_TONES: readonly ContourTone[] = ["hue", "black", "white"];

export type GroupKey = "animation" | "source" | "warp" | "map" | "kaleidoscope" | "blur" | "trails" | "smear" | "contours" | "relief" | "driver" | "terrain" | "camera" | "solid" | "sort" | "particles" | "cycles" | "rays" | "lasers" | "bloom" | "sharpen" | "color" | "levels" | "picture" | "outlines";

export interface PlayState {
  /** Which groups are on. A group that is off has no effect, but keeps its settings. */
  groups: Record<GroupKey, boolean>;
  /** Locked groups keep their settings when Randomize runs. Scene files do not store this. */
  locks: Record<GroupKey, boolean>;
  /** How the two source images fade into each other. */
  blendMode: BlendMode;
  /** How the source images go on past their edges. */
  tiling: Tiling;
  warpMode: WarpMode;
  /** The kind of warp: 0 noise, 1 ripple, 2 waves, 3 swirl, 4 bulge and pinch, 5 cells. */
  warpType: WarpType;
  /** How far the warp noise has flowed; it grows with time × warp flow. */
  warpTime: number;
  /** The Mandelbrot map's bands moved so far by Band flow (in bands), added up like warpTime. */
  mandelFlowTime: number;
  /** How far the view has flown into the tunnel; it grows with time × tunnel speed. */
  mapTravel: number;
  /** Where the camera's aim point is on the land (screen heights); it moves with time × camera speed, the way the camera looks. */
  cameraX: number;
  cameraY: number;
  mapMode: MapMode;
  /** The Mandelbrot map's place to dive into (see MANDEL_PLACES in submodes.ts). */
  mandelPlace: MandelPlace;
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
   * The settings whose audio switch is on: they move with the sound (see
   * docs/AUDIO.md, part 3), from a song's plan or from the live sound. Part
   * of the scene: each scene reacts in its own way to the same sound.
   */
  sound: Partial<Record<ParamKey, true>>;
  /**
   * The blur mask, which sets where the picture is blurred: 0 a circle with
   * a sharp center, 1 a circle with a blurred center, 2 a straight gradient,
   * 3 bright areas, 4 dark areas, 5 noise blotches.
   */
  blurMask: BlurMask;
  trailMode: TrailMode;
  /** The color overlay color, as "#rrggbb", and how it combines with the picture (see blendLayer in FINISH_SHADER). */
  overlayColor: string;
  colorBlend: LayerBlend;
  /** The color the trails are tinted toward (see trailTint), as "#rrggbb". */
  trailColor: string;
  /** The time smear's pattern of delays (see SMEAR_SHADER). */
  smearShape: SmearShape;
  /** The contour lines' color: the Color slider's hue, or black or white. And how the lines combine with the picture under them. */
  contourTone: ContourTone;
  contourBlend: LayerBlend;
  /** How the camera's raised land combines with the flat floor under it (see CAMERA_SHADER), and the color of its sky and fog, as "#rrggbb". */
  cameraBlend: LayerBlend;
  /** Camera's blend over the picture (cameraBlend is Terrain's, the name it had when Camera made the land). */
  viewBlend: LayerBlend;
  skyColor: string;
  /** How the camera's land goes on past the picture: mirrored, repeated as it is, or not at all. */
  cameraRepeat: CameraRepeat;
  /** Where the camera's land heights come from. The panel offers only real terrain (2) now (see docs/TERRAIN.md). */
  cameraHeightSource: CameraHeightSource;
  /** The land's colors. The panel offers only the terrain picture (2) now; with no picture loaded, the gradient by height (cameraStops) stands in. */
  cameraColors: CameraColors;
  cameraStops: GradientStop[];
  /** The pixel sort's order along each run: dark to bright, or bright to dark. */
  sortOrder: SortOrder;
  /** How the particles combine with the picture under them: they add light (glow), or cover it. */
  particleBlend: ParticleBlend;
  /** How each particle looks: a dot, a line along its motion, or a ring. */
  particleShape: ParticleShape;
  /** How the Image or Video effect's image or video goes over the picture: 0 Normal (its clear parts show the picture), 1 Screen and 2 Add (its black adds nothing). */
  pictureBlend: PictureBlend;
  /**
   * The particles' life gradient (see particleGradient): its color stops,
   * from 2 to MAX_GRADIENT_STOPS, in order of place. A new array replaces
   * the old one on each change, so an Undo step keeps its own stops.
   */
  particleStops: GradientStop[];
  /**
   * Light Cycles: how the cycles move (grid lanes or free curves), how their
   * lines combine with the picture under them, where their gradient colors
   * come from (see CyclePaint), and the gradient's color stops (as
   * particleStops).
   */
  cyclesMove: CycleMove;
  cyclesBlend: LayerBlend;
  cyclesPaint: CyclePaint;
  cyclesStops: GradientStop[];
  /**
   * Light shapes (see OUTLINE_SHADER): the outline, how it draws, the
   * colors along it, and two clocks added up as the animation runs: the
   * place in the draw cycle (0 to 1) and the color flow (0 to 1).
   */
  outlineShape: OutlineShape;
  outlineDraw: OutlineDraw;
  outlineStops: GradientStop[];
  outlineTime: number;
  outlineFlowTime: number;
  /**
   * 3D Object (see SOLID_SHADER): the shape preset, how the picture goes onto
   * it (wrap, project, mirror), how the shape combines with the picture
   * behind it, and how far it has turned about its own axis and tumbled
   * over, in turns; these two grow with time times Spin and Tumble.
   */
  solidShape: SolidShape;
  solidMap: SolidMap;
  solidBlend: LayerBlend;
  /**
   * Freeze background (see docs/LAYERS.md): the steps after the 3D Object
   * in the FX list change only the picture painted on the object, which is
   * drawn last; the picture behind it stays as it was at the 3D Object.
   */
  solidKeep: boolean;
  solidSpinTurns: number;
  /** Light shapes: how far the first outline has turned by Spin and Tumble (turns, 0 to 1). */
  outlineSpinTurns: number;
  outlineTumbleTurns: number;
  solidTumbleTurns: number;
  /** The Driver effect's driver (caustics, smoke, ink, fire, ripples), and what it does to the picture. */
  driverSource: DriverSource;
  driverMode: DriverMode;
  /** How far the driver's motion has run; it grows with time × driver speed. */
  driverTime: number;
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
const OPACITY_KEYS: ParamKey[] = ["warpOpacity", "mapOpacity", "foldOpacity", "particleBackground"];

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
  mapScale: { label: "Zoom", min: 0.25, max: 1.5, step: 0.01, value: 1, drift: "wave", low: 0.5, high: 1, on: false },
  juliaZoom: { label: "Zoom", min: 0.5, max: 1.5, step: 0.01, value: 0.5, drift: "wave", low: 0.5, high: 1, on: true },
  mapPower: { label: "Power", min: 0.5, max: 6, step: 0.01, value: 2, drift: "wave", low: 1, high: 3, on: true },
  /**
   * The Julia point walks the edge of the Mandelbrot set's main body, where
   * every point gives a detailed shape (near the center the shape is a plain
   * circle and the picture goes flat). Edge moves it a little inside the edge
   * (smooth, joined shapes) or outside it (broken shapes).
   */
  juliaShape: { label: "Shape", min: 0, max: 360, step: 1, value: 120, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  /** Julia has its own Darkness and Softness (see mapFog): the far end is where the steps stretch the picture most. */
  juliaFog: { label: "Darkness", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.3, high: 0.7, on: false },
  mandelDepth: { label: "Start", min: 0, max: 10, step: 0.01, value: 0.5, drift: "wave", low: 0, high: 3, on: false },
  mandelEnd: { label: "End", min: 0.5, max: 10, step: 0.01, value: 8, drift: "wave", low: 6, high: 10, on: false },
  mandelFade: { label: "Crossfade", min: 0.05, max: 0.5, step: 0.01, value: 0.25, drift: "wave", low: 0.15, high: 0.4, on: false },
  mandelBands: { label: "Band width", min: 2, max: 4, step: 0.001, value: 3, drift: "wave", low: 2.8, high: 3.2, on: false },
  mandelSpeed: { label: "Speed", min: -4, max: 4, step: 0.001, value: 0.15, drift: "wave", low: 0.05, high: 0.3, on: false },
  mandelSpread: { label: "Palette spread", min: 0.05, max: 4, step: 0.001, scale: "log", value: 0.5, drift: "wave", low: 0.3, high: 1, on: false },
  mandelInvert: { label: "Invert", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  mandelEdge: { label: "Edge light", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.6, high: 1, on: false },
  mandelEdgeWidth: { label: "Edge width", min: 0.002, max: 0.3, step: 0.0001, scale: "log", value: 0.03, drift: "wave", low: 0.01, high: 0.08, on: false },
  mandelFlow: { label: "Band flow", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -0.5, high: 0.5, on: false },
  mandelTerraces: { label: "Terraces", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.3, high: 0.9, on: false },
  mandelSoftness: { label: "Softness", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.8, on: false },
  mandelLight: { label: "Light", min: 0, max: 1, step: 0.01, value: 0.7, drift: "wave", low: 0.4, high: 1, on: false },
  mandelLightAngle: { label: "Light angle", min: 0, max: 360, step: 1, value: 135, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  juliaFogSoftness: { label: "Softness", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.7, on: false },
  juliaEdge: { label: "Edge", min: 0.5, max: 1.5, step: 0.01, value: 1, drift: "wave", low: 0.9, high: 1.1, on: false },
  mapSteps: { label: "Steps", min: 1, max: 12, step: 1, value: 1 },
  /**
   * Seamless spiral: how far the spiral twists. Negative twists the other
   * way; 0 gives rings. Any value stays seamless (see the stretch in
   * complexMap), so it can drift like the other ranges.
   */
  mapArms: { label: "Twist", min: -8, max: 8, step: 0.05, value: 2, drift: "wave", low: 1, high: 3, on: false },
  /**
   * Droste spiral: the size of the picture's copy inside itself, as a share
   * of the picture (0.4: the copy is 40% as wide and high). Any size meets
   * itself, so it can drift.
   */
  drosteSize: { label: "Copy size", min: 0.1, max: 0.8, step: 0.01, value: 0.4, drift: "wave", low: 0.3, high: 0.5, on: false },
  /**
   * Droste spiral: how many spiral arms one turn around the center has; 0
   * gives plain frames in frames, and a negative count turns the spiral the
   * other way. Only a whole number meets itself with no seam, so a count
   * between two whole numbers (a value or a drifting range) crossfades
   * between the two nearest whole counts (see shapeColor in shaders.ts),
   * like a twist.
   */
  drosteSpirals: { label: "Spirals", min: -4, max: 4, step: 0.01, value: 1, drift: "wave", low: -1, high: 1, on: false },
  /**
   * Droste spiral: how far each frame fades into the smaller copy next to
   * it, as a share of the space between two frames; 0 is a hard edge.
   */
  drosteSoftness: { label: "Edge softness", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.6, on: false },
  /** Droste spiral: the frames' shape, from the picture's rectangle (0) to a circle (1). */
  drosteRound: { label: "Frame shape", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  /** Droste spiral: turns the whole spiral and its frames around the map's center. */
  drosteRotation: { label: "Rotate (post)", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  /**
   * Droste spiral: turns the picture inside the frames; the frames and the
   * spiral stay. The picture's corners come in from outside it as it turns.
   */
  drostePictureTurn: { label: "Rotate (pre)", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  mapTwist: { label: "Twist", min: -80, max: 80, step: 1, value: 0, unit: "°", drift: "wave", low: 10, high: 50, on: false },
  /**
   * Turns the whole map on the screen (Möbius has its own). With a mirrored
   * image, Power, Log spiral and Tunnel fold the picture over an axis (so
   * there is no seam), and this turns that axis too.
   */
  mapAngle: { label: "Rotation", min: 0, max: 360, step: 1, value: 270, unit: "°", drift: "spin", low: 153, high: 207, on: false, ease: "organic" },
  /** Tunnel, Log spiral and Seamless spiral: forward speed into the far end (backward below 0). */
  mapSpeed: { label: "Speed", min: -2, max: 2, step: 0.01, value: 0.15, drift: "wave", low: 0.1, high: 0.5, on: false },
  /** Tunnel only: how far the wall turns per tube length, so the tube becomes a spiral. Log spiral keeps its own wider twist. */
  tunnelTwist: { label: "Twist", min: -2, max: 2, step: 0.001, value: 0, unit: "°", drift: "wave", low: -0.5, high: 0.5, on: false },
  /** Moves the map's center on the screen, for every map but Möbius (which has its own pan). */
  mapPanX: { label: "Pan X", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  mapPanY: { label: "Pan Y", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  /**
   * Power, Julia and Sine (Möbius has its own): Roll turns the image inside
   * the map's shapes, and Twist turns it more with distance. The spirals and
   * the tunnel have none: turning their image would open a seam.
   */
  mapRoll: { label: "Roll", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  mapCurl: { label: "Twist", min: 0, max: 1, step: 0.001, value: 0, drift: "wave", low: 0, high: 0.2, on: false },
  mapFog: { label: "Darkness", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.3, high: 0.7, on: false },
  /** How gradual the darkness is: 0 a hard edge at the start, 1 a slow fade that is black only near the far end. */
  mapFogSoftness: { label: "Softness", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.7, on: false },
  /**
   * Möbius only: a turn, a twist (which turns more with distance, like the
   * kaleidoscope's twirl), a zoom and a pan, applied to the point after the
   * Möbius map.
   */
  /**
   * The Möbius point's distance from the center. With the pole at the screen
   * center, it sets the size of the picture around the pole: near 0 the
   * picture blows out, and at 1 it shrinks to one color and then flips.
   */
  mobiusPoint: { label: "Point", min: 0.66, max: 0.99, step: 0.01, value: 0.98, drift: "wave", low: 0.94, high: 0.98, on: true },
  /** Rotation turns the whole Möbius picture on the screen; Roll turns the image inside the map's shapes. */
  mobiusTurn: { label: "Rotation", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 165, on: true, ease: "organic" },
  mobiusRotation: { label: "Roll", min: 0, max: 360, step: 1, value: 66, unit: "°", drift: "spin", low: 0, high: 66, on: true, ease: "organic" },
  mobiusTwist: { label: "Twist", min: 0, max: 1, step: 0.001, value: 0, drift: "wave", low: 0, high: 0.207, on: false },
  mobiusZoom: { label: "Zoom", min: 1, max: 5, step: 0.01, value: 1, drift: "wave", low: 1, high: 5, on: false },
  mobiusPanX: { label: "Pan X", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  mobiusPanY: { label: "Pan Y", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -0.35, high: 0.35, on: false },
  /** Möbius has its own Darkness and Softness (see mapFog), so it and Tunnel can have different defaults. */
  mobiusFog: { label: "Darkness", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.14, on: false },
  mobiusFogSoftness: { label: "Softness", min: 0, max: 1, step: 0.01, value: 0.1, drift: "wave", low: 0, high: 1, on: false },
  /** The handles are whole numbers, but a drifting count moves smoothly between them (see fold() in shaders.ts). */
  segments: { label: "Segments", min: 0, max: 24, step: 1, value: 0, drift: "wave", low: 3, high: 8, on: false },
  /** Tile modes only: screen heights between neighbor cell centers. */
  tileSize: { label: "Tile size", min: 0.1, max: 2, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.8, on: false },
  /** The center is a fraction of the screen size: -0.5 and 0.5 are the screen edges. */
  centerX: { label: "Offset X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  centerY: { label: "Offset Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
  rotation: { label: "Rotation", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  zoom: { label: "Zoom", min: 0.25, max: 1.5, step: 0.01, value: 1, drift: "wave", low: 0.5, high: 1, on: false },
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
  /** Trail zoom only grows the old frame (1 is no zoom); it never shrinks it. */
  trailZoom: { label: "Zoom", min: 1, max: 1.03, step: 0.001, value: 1, drift: "wave", low: 1.002, high: 1.015, on: false },
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
   * Terrain (see TERRAIN_SHADER), under the names it had when it was the
   * Camera effect, so saved scenes and MIDI links still find them: how much
   * the raised land shows over the same camera's view of the flat picture
   * (cameraAmount), the land's height at white (below 0, dark areas rise),
   * the free camera, as on a film set: Pan (the way it looks, 0 along +x,
   * counterclockwise), Tilt (up from level; below 0 looks down), Pedestal
   * (its height, screen heights), Dolly and Truck (its speeds forward and
   * to its right, screen heights per second; it holds still at 0), and its
   * lens (the focal length on a 35 mm camera, see lensAngle), the sun's
   * direction and height, the shadows' darkness, the fog, how much the sky
   * and fog take state.skyColor (0 = the picture's mean color), the shine
   * of the land, and how blurred the height is.
   *
   * Camera (see CAMERA_SHADER) views the flat picture with the same camera
   * (Pan to Lens, Fog and Sky); its own Opacity is viewAmount.
   */
  cameraAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  viewAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  cameraHeight: { label: "Height", min: -1, max: 1, step: 0.01, value: 0.25, drift: "wave", low: 0.1, high: 0.4, on: false },
  cameraPan: { label: "Pan", min: 0, max: 360, step: 1, value: 90, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  cameraTilt: { label: "Tilt", min: -90, max: 60, step: 1, value: -40, unit: "°", drift: "wave", low: -60, high: -20, on: false },
  cameraPedestal: { label: "Pedestal", min: 0.02, max: 5, step: 0.01, value: 1, drift: "wave", low: 0.6, high: 1.6, on: false },
  cameraDolly: { label: "Dolly", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  cameraTruck: { label: "Truck", min: -2, max: 2, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  cameraLens: { label: "Lens", min: 7, max: 300, step: 1, scale: "log", value: 21, unit: "mm", drift: "wave", low: 14, high: 35, on: false },
  cameraLightTurn: { label: "Sun angle", min: 0, max: 360, step: 1, value: 135, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  cameraLightHeight: { label: "Sun height", min: 5, max: 90, step: 1, value: 40, unit: "°", drift: "wave", low: 15, high: 60, on: false },
  cameraShadow: { label: "Shadows", min: 0, max: 1, step: 0.01, value: 0.7, drift: "wave", low: 0.3, high: 1, on: false },
  cameraFog: { label: "Fog", min: 0, max: 1, step: 0.01, value: 0.2, drift: "wave", low: 0, high: 0.5, on: false },
  cameraSky: { label: "Sky", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.2, high: 0.8, on: false },
  cameraShine: { label: "Shine", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.1, high: 0.5, on: false },
  cameraSmooth: { label: "Smooth", min: 0, max: 6, step: 0.1, value: 2.5, drift: "wave", low: 1, high: 4, on: false },
  /**
   * Generated heights (see docs/TERRAIN.md): Scale is about how many
   * mountains fit across the land's height; Roughness how tall each finer
   * layer of detail is; Ridges how sharp the crests are; Seed picks
   * another land.
   */
  cameraTerrainScale: { label: "Scale", min: 0.5, max: 16, step: 0.1, value: 1.5, drift: "wave", low: 1, high: 3, on: false },
  cameraRoughness: { label: "Roughness", min: 0.2, max: 0.8, step: 0.01, value: 0.5, drift: "wave", low: 0.4, high: 0.6, on: false },
  cameraRidges: { label: "Ridges", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.3, high: 0.9, on: false },
  cameraSeed: { label: "Seed", min: 0, max: 99, step: 1, value: 0, drift: "wave", low: 0, high: 99, on: false },
  /**
   * Real terrain: made-up fine ridges, as tall as Detail (steep slopes get
   * the most), with their largest features Detail size large (1: about 24
   * across the land's height, at any area).
   */
  cameraDetail: { label: "Detail", min: 0, max: 2, step: 0.01, value: 0.6, drift: "wave", low: 0.3, high: 1, on: false },
  cameraDetailSize: { label: "Detail size", min: 0.05, max: 4, step: 0.01, scale: "log", value: 1, drift: "wave", low: 0.7, high: 1.5, on: false },
  /**
   * Pixel sort (see SORT_STEP_SHADER): along lines at Angle, each run of
   * pixels whose brightness is between Low and High is sorted by
   * brightness. Length cuts the runs into pieces at most this part of the
   * screen's diagonal long (1 = no cut). Thickness is the width of each
   * sort line, in pixels at 1080p. Opacity mixes the sorted picture over
   * the picture.
   */
  sortAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  sortLow: { label: "Low", min: 0, max: 1, step: 0.01, value: 0.25, drift: "wave", low: 0.15, high: 0.4, on: false },
  sortHigh: { label: "High", min: 0, max: 1, step: 0.01, value: 0.8, drift: "wave", low: 0.6, high: 0.95, on: false },
  sortAngle: { label: "Angle", min: 0, max: 360, step: 1, value: 270, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  sortLength: { label: "Length", min: 0.02, max: 1, step: 0.01, value: 1, drift: "wave", low: 0.1, high: 0.5, on: false },
  sortThickness: { label: "Thickness", min: 1, max: 64, step: 0.1, scale: "log", value: 1, unit: "px", drift: "wave", low: 2, high: 16, on: false },
  /**
   * Particles (see PARTICLE_STEP_SHADER): their opacity, how many there are,
   * and the brightness a spot of the picture needs to emit one (0 = any
   * spot). Each particle takes the color of the spot it came from. Size is
   * in pixels at 1080p, Life in seconds (each particle lives half to one and
   * a half times as long), Speed is the start speed in screen heights per
   * second. Gravity pulls toward Direction (below 0, away from it).
   * Turbulence pushes the particles along a moving swirl of noise, and Drag
   * slows them. Background is the opacity of the picture under the
   * particles: at 0 only the particles show, on black, but the picture
   * still sets where they are born and their color.
   */
  particleAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  particleBackground: { label: "Background", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0, high: 1, on: false },
  particleCount: { label: "Count", min: 100, max: 1048576, step: 1, scale: "log", value: 4000, drift: "wave", low: 1000, high: 10000, on: false },
  particleLevel: { label: "Threshold", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.4, high: 0.8, on: false },
  particleSize: { label: "Size", min: 0.5, max: 40, step: 0.1, scale: "log", value: 4, unit: "px", drift: "wave", low: 2, high: 8, on: false },
  particleLife: { label: "Life", min: 0.2, max: 10, step: 0.1, value: 2.5, unit: " s", drift: "wave", low: 1, high: 4, on: false },
  particleSpeed: { label: "Speed", min: 0, max: 0.2, step: 0.001, value: 0.15, drift: "wave", low: 0.05, high: 0.2, on: false },
  particleGravity: { label: "Gravity", min: -1, max: 1, step: 0.01, value: 0.1, drift: "wave", low: -0.2, high: 0.2, on: false },
  particleAngle: { label: "Direction", min: 0, max: 360, step: 1, value: 270, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  particleTurbulence: { label: "Turbulence", min: 0, max: 2, step: 0.01, value: 0.3, drift: "wave", low: 0.1, high: 0.8, on: false },
  particleDrag: { label: "Drag", min: 0, max: 5, step: 0.01, value: 1, drift: "wave", low: 0.5, high: 2, on: false },
  /**
   * How fast each particle turns to the edge of the picture under it: at 0
   * a particle turns about an eighth of the way in each frame, and at 1 it
   * takes the edge's direction at once (see the follow in PARTICLE_STEP_SHADER).
   */
  particleFollow: { label: "Follow", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  /**
   * How strongly each particle is pulled to the middle of the edge it
   * follows (where the brightness changes fastest), so it stays on the
   * line instead of drifting off it; 0 is off.
   */
  /**
   * How much each particle takes its color from the life gradient instead
   * of from the picture where it was born. The gradient runs over the
   * particle's life, from birth to end; its colors are state.particleStops
   * (see PARTICLE_VERTEX_SHADER).
   */
  /**
   * How much light each particle gives: its dot covers more and gets a
   * firmer center, and its color gets brighter up to full with no change of
   * hue, so few small particles still show (see PARTICLE_SHADER). 1 is a
   * plain soft dot.
   */
  particleBoost: { label: "Boost", min: 1, max: 8, step: 0.01, value: 1, drift: "wave", low: 1, high: 4, on: false },
  /** A Ring particle's radius, in pixels at 1080p; Size is then its line's width (twice it). */
  particleRingRadius: { label: "Ring radius", min: 1, max: 200, step: 0.1, scale: "log", value: 12, unit: "px", drift: "wave", low: 6, high: 24, on: false },
  particleGradient: { label: "Gradient", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  particleCling: { label: "Focus", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  /**
   * Light Cycles (see cycles.ts): the lines' opacity; Background is the
   * picture under them, as with particles. Count cycles drive at Speed
   * (screen heights per second) and draw lines Width pixels wide at 1080p.
   * Trail Length is how many seconds a line takes to fade behind its cycle;
   * at its top the line stays until its cycle crashes. Turn Rate is the
   * random turns per second, Follow how strongly the cycles turn toward
   * bright areas, and Dodge the chance that a cycle sees a line ahead and
   * turns away. Grid Size is the space between the lanes in grid mode, in
   * screen heights. Head Glow makes the heads bigger and brighter than the
   * lines.
   */
  cyclesAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  cyclesBackground: { label: "Background", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0, high: 1, on: false },
  cyclesCount: { label: "Count", min: 1, max: 2000, step: 1, scale: "log", value: 12, drift: "wave", low: 6, high: 40, on: false },
  cyclesSpeed: { label: "Speed", min: 0, max: 1, step: 0.01, value: 0.3, drift: "wave", low: 0.15, high: 0.5, on: false },
  cyclesWidth: { label: "Width", min: 0.5, max: 16, step: 0.1, scale: "log", value: 2, unit: "px", drift: "wave", low: 1.5, high: 4, on: false },
  cyclesLength: { label: "Trail Length", min: 0.25, max: 30, step: 0.01, scale: "log", value: 30, unit: " s", drift: "wave", low: 2, high: 10, on: false },
  cyclesTurns: { label: "Turn Rate", min: 0, max: 5, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 2, on: false },
  cyclesFollow: { label: "Follow", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  cyclesDodge: { label: "Dodge", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 0.9, on: false },
  cyclesGrid: { label: "Grid Size", min: 0.005, max: 0.2, step: 0.001, scale: "log", value: 0.02, drift: "wave", low: 0.01, high: 0.05, on: false },
  cyclesHead: { label: "Head Glow", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 1, on: false },
  /**
   * The cycles' gradient (see state.cyclesPaint): how much its color
   * replaces the picture's (0: all from the picture). Shift moves the colors
   * along the gradient; at 1 they are back where they started. The colors go
   * out and back along the gradient, so they never jump. Repeat is how many times the gradient goes out and
   * back along a trail's Trail Length (or 10 seconds when the trails do not
   * fade) or across the screen. Angle turns a linear gradient; Center X and
   * Y move a radial one's center, as a part of the screen size.
   */
  cyclesGradient: { label: "Gradient", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  cyclesShift: { label: "Shift", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, ease: "linear", on: false },
  cyclesRepeat: { label: "Repeat", min: 0.25, max: 8, step: 0.01, scale: "log", value: 1, drift: "wave", low: 1, high: 3, on: false },
  cyclesAngle: { label: "Angle", min: 0, max: 360, step: 1, value: 0, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  cyclesCenterX: { label: "Center X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
  cyclesCenterY: { label: "Center Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
  /**
   * 3D Object (see SOLID_SHADER): opacity, the picture behind the shape (1
   * whole, 0 black), the shape's size as a part of the screen height, how
   * round its edges are, its spin about its own axis and its tumble (turns
   * per minute), how far its axis leans toward the viewer, how strongly it
   * bends the picture (Project), how many times the picture goes round it
   * (Wrap), the light's angle around the view, how dark the side away from
   * the light is, the highlight, the shadow on the picture behind, and the
   * shape's place (a part of the screen height from the center).
   */
  solidAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  solidBackground: { label: "Background", min: 0, max: 1, step: 0.01, value: 1, drift: "wave", low: 0.2, high: 1, on: false },
  solidSize: { label: "Size", min: 0.1, max: 1.5, step: 0.01, scale: "log", value: 0.6, drift: "wave", low: 0.45, high: 0.8, on: false },
  solidRound: { label: "Roundness", min: 0, max: 1, step: 0.01, value: 0.15, drift: "wave", low: 0, high: 0.6, on: false },
  solidMorph: { label: "Squareness", min: 0, max: 1, step: 0.01, value: 0.65, drift: "wave", low: 0.2, high: 0.9, on: false },
  solidBlobs: { label: "Blobs", min: 2, max: 8, step: 1, value: 5, drift: "wave", low: 3, high: 7, on: false },
  solidBumps: { label: "Bumps", min: 0, max: 1, step: 0.01, value: 0.75, drift: "wave", low: 0.4, high: 1, on: false },
  solidWaves: { label: "Waves", min: 1, max: 10, step: 0.1, value: 4, drift: "wave", low: 2, high: 7, on: false },
  solidSpikes: { label: "Spike length", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.3, high: 0.9, on: false },
  solidSpikeCount: { label: "Spikes", min: 4, max: 32, step: 1, value: 12, drift: "wave", low: 8, high: 20, on: false },
  solidLevels: { label: "Levels", min: 1, max: 5, step: 1, value: 3, drift: "wave", low: 2, high: 4, on: false },
  solidSpikeTip: { label: "Spike shape", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 1, on: false },
  solidSpin: { label: "Spin", min: -60, max: 60, step: 0.1, value: 6, unit: " rpm", drift: "wave", low: 3, high: 12, on: false },
  solidTumble: { label: "Tumble", min: -60, max: 60, step: 0.1, value: 0, unit: " rpm", drift: "wave", low: -3, high: 3, on: false },
  solidTilt: { label: "Tilt", min: -90, max: 90, step: 1, value: 20, unit: "°", drift: "wave", low: -30, high: 30, on: false },
  solidBend: { label: "Bend", min: 0, max: 1, step: 0.01, value: 0.4, drift: "wave", low: 0.2, high: 0.7, on: false },
  solidTiles: { label: "Tiles", min: 0.25, max: 8, step: 0.01, scale: "log", value: 1, drift: "wave", low: 1, high: 3, on: false },
  solidLight: { label: "Light angle", min: 0, max: 360, step: 1, value: 135, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  solidShading: { label: "Shading", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.3, high: 0.9, on: false },
  solidShine: { label: "Shine", min: 0, max: 1, step: 0.01, value: 0.4, drift: "wave", low: 0.1, high: 0.7, on: false },
  solidShadow: { label: "Shadow", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 0.8, on: false },
  solidX: { label: "Center X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
  solidY: { label: "Center Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  /** Driver (see DRIVER_SHADER): opacity, how strongly the driver bends, reveals or lights, its size, its speed, and its contrast. */
  driverAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  driverStrength: { label: "Strength", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.8, on: false },
  driverScale: { label: "Size", min: 0.25, max: 4, step: 0.01, scale: "log", value: 1, drift: "wave", low: 0.7, high: 1.5, on: false },
  driverSpeed: { label: "Speed", min: 0, max: 3, step: 0.01, value: 1, drift: "wave", low: 0.5, high: 1.5, on: false },
  driverContrast: { label: "Contrast", min: 0.5, max: 3, step: 0.01, value: 1, drift: "wave", low: 0.8, high: 1.6, on: false },
  /**
   * Light rays (see RAYS_SHADER): the bright parts of the picture shine
   * out in rays, away from a center. Strength is how much light the rays
   * add; Threshold is the brightness where the light starts. Length is how
   * far each ray reaches, as a part of the way to the center (1 = all the
   * way), and Fade how fast a ray gets dimmer along its length. The center
   * is a part of the screen size from the screen center: -0.5 and 0.5 are
   * the screen edges.
   */
  raysAmount: { label: "Strength", min: 0, max: 4, step: 0.01, value: 0, drift: "wave", low: 0.8, high: 2, on: false },
  raysThreshold: { label: "Threshold", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.4, high: 0.8, on: false },
  raysLength: { label: "Length", min: 0, max: 1, step: 0.01, value: 0.4, drift: "wave", low: 0.2, high: 0.7, on: false },
  raysFade: { label: "Fade", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.2, high: 0.8, on: false },
  raysX: { label: "Center X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  raysY: { label: "Center Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.25, high: 0.25, on: false },
  /**
   * Lasers (see LASER_SHADER): a fan of thin, bright beams, added to the
   * picture as light. Spread is the angle of the whole fan. The fan is a
   * flat sheet of beams, and Sweep tilts it up and down: at 90 it stands
   * straight up, at 0 it is level and seen edge-on, so it looks flat, and
   * below 0 it points down. Sweep delay staggers a moving Sweep: each beam
   * does what the beam before it did, that many seconds later (0 = all
   * beams together). The beams start from a base line:
   * Base width is its length (a part of the screen height; 0 = all beams
   * from one point). Turn turns the whole fan, base line and beams,
   * clockwise about the source (0 = upright). Width is the beam
   * width in screen pixels; Glow is how bright the haze around each beam
   * is, and Glow size how far it reaches, in screen pixels, so a thin beam
   * can have a strong glow. Emitter is the size of the glowing dot where
   * each beam starts (0 = no dot). Fade is how fast a beam gets dimmer
   * along its length (0 = not at all). Color is the first beam's hue;
   * Rainbow spreads the beams' hues around the color wheel. The source is a
   * part of the screen size from the screen center: -0.5 and 0.5 are the
   * screen edges, so the start-up source is the middle of the bottom edge.
   */
  laserAmount: { label: "Strength", min: 0, max: 3, step: 0.01, value: 0, drift: "wave", low: 0.6, high: 1.5, on: false },
  laserCount: { label: "Beams", min: 1, max: 32, step: 1, value: 12, drift: "wave", low: 6, high: 16, on: false },
  laserSpread: { label: "Spread", min: 0, max: 180, step: 1, value: 60, unit: "°", drift: "wave", low: 20, high: 100, on: false },
  laserSweep: { label: "Sweep", min: -90, max: 90, step: 1, value: 60, unit: "°", drift: "wave", low: -30, high: 90, on: false },
  laserSweepDelay: { label: "Sweep delay", min: 0, max: 0.5, step: 0.01, value: 0, unit: " s", drift: "wave", low: 0.02, high: 0.15, on: false },
  laserBase: { label: "Base width", min: 0, max: 2, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.5, on: false },
  laserBaseAngle: { label: "Turn", min: -180, max: 180, step: 1, value: 0, unit: "°", drift: "wave", low: -20, high: 20, on: false },
  laserWidth: { label: "Width", min: 0.5, max: 12, step: 0.1, value: 1.5, unit: "px", drift: "wave", low: 1, high: 3, on: false },
  laserGlow: { label: "Glow", min: 0, max: 4, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 1.5, on: false },
  laserEmitter: { label: "Emitter", min: 0, max: 3, step: 0.01, value: 1, drift: "wave", low: 0.5, high: 1.5, on: false },
  laserGlowSize: { label: "Glow size", min: 2, max: 80, step: 0.1, scale: "log", value: 10, unit: "px", drift: "wave", low: 6, high: 24, on: false },
  laserFade: { label: "Fade", min: 0, max: 1, step: 0.01, value: 0.3, drift: "wave", low: 0.1, high: 0.6, on: false },
  laserHue: { label: "Color", min: 0, max: 360, step: 1, value: 120, unit: "°", drift: "spin", low: 0, high: 360, on: false },
  laserRainbow: { label: "Rainbow", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.5, on: false },
  laserX: { label: "Source X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.3, high: 0.3, on: false },
  laserY: { label: "Source Y", min: -0.5, max: 0.5, step: 0.01, value: -0.5, drift: "wave", low: -0.5, high: -0.3, on: false },
  /**
   * Light shapes (see OUTLINE_SHADER): glowing outlines that draw
   * themselves. Count copies, each smaller by Spacing and later in the draw
   * by Delay (a part of a draw). Draw time is the seconds for one draw;
   * Length is the chased part (Chase only); Points is the star's. Width and
   * Glow size are pixels at 1080p. Color flow moves the colors along the
   * outline, in turns per second.
   */
  outlineAmount: { label: "Strength", min: 0, max: 3, step: 0.01, value: 0, drift: "wave", low: 0.6, high: 1.5, on: false },
  outlineCount: { label: "Count", min: 1, max: 24, step: 1, value: 1, drift: "wave", low: 1, high: 4, on: false },
  outlineRadius: { label: "Radius", min: 0.02, max: 1, step: 0.01, value: 0.3, drift: "wave", low: 0.2, high: 0.4, on: false },
  outlineSpacing: { label: "Spacing", min: 0, max: 1, step: 0.01, value: 0.5, drift: "wave", low: 0.3, high: 0.7, on: false },
  outlineDelay: { label: "Delay", min: 0, max: 1, step: 0.01, value: 0.15, drift: "wave", low: 0.05, high: 0.3, on: false },
  outlineDrawTime: { label: "Draw time", min: 0.25, max: 20, step: 0.01, scale: "log", value: 3, unit: "s", drift: "wave", low: 2, high: 5, on: false },
  outlineLength: { label: "Length", min: 0.02, max: 1, step: 0.01, value: 0.35, drift: "wave", low: 0.2, high: 0.6, on: false },
  outlinePoints: { label: "Points", min: 3, max: 12, step: 1, value: 5, drift: "wave", low: 4, high: 8, on: false },
  outlineWidth: { label: "Width", min: 0.5, max: 12, step: 0.1, value: 2, unit: "px", drift: "wave", low: 1, high: 3, on: false },
  outlineGlow: { label: "Glow", min: 0, max: 4, step: 0.01, value: 1, drift: "wave", low: 0.5, high: 1.5, on: false },
  outlineGlowSize: { label: "Glow size", min: 2, max: 80, step: 0.1, scale: "log", value: 16, unit: "px", drift: "wave", low: 8, high: 30, on: false },
  outlineFlow: { label: "Color flow", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  outlineTurn: { label: "Turn", min: -180, max: 180, step: 1, value: 0, unit: "°", drift: "spin", low: -180, high: 180, on: false },
  /** Light shapes in 3D: Spin turns each outline around its upright line, Tumble around its level line, as speeds (as the 3D object). Each copy turns later by its Delay. */
  outlineSpin: { label: "Spin", min: -60, max: 60, step: 0.1, value: 0, unit: " rpm", drift: "wave", low: 3, high: 12, on: false },
  outlineTumble: { label: "Tumble", min: -60, max: 60, step: 0.1, value: 0, unit: " rpm", drift: "wave", low: -3, high: 3, on: false },
  outlineX: { label: "X", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  outlineY: { label: "Y", min: -0.5, max: 0.5, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  /**
   * Image or Video (see PICTURE_SHADER): an image or a video of the scene's own
   * over the picture made so far, by its blend (pictureBlend). Size 1
   * covers the screen and keeps the media's shape; X and Y move its center,
   * as a part of the screen size from the screen center (0.5 is an edge);
   * Turn turns it about its center.
   */
  pictureAmount: { label: "Opacity", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1, on: false },
  pictureSize: { label: "Size", min: 0.05, max: 4, step: 0.01, value: 1, drift: "wave", low: 0.8, high: 1.2, on: false },
  pictureX: { label: "X", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  pictureY: { label: "Y", min: -1, max: 1, step: 0.01, value: 0, drift: "wave", low: -0.2, high: 0.2, on: false },
  pictureTurn: { label: "Turn", min: -180, max: 180, step: 1, value: 0, unit: "°", drift: "spin", low: -180, high: 180, on: false },
  /** The black key (0 = off): parts darker than this become clear. */
  pictureKey: { label: "Black key", min: 0, max: 1, step: 0.01, value: 0, drift: "wave", low: 0, high: 0.3, on: false },
  /**
   * Bloom (see BLOOM_SHADER): the bright parts of the picture glow into the
   * parts around them. Strength is how much glow is added; Threshold is the
   * brightness where the glow starts, and Softness how gradually it starts.
   * Size is how far the glow spreads: each step doubles the spread.
   */
  bloomAmount: { label: "Strength", min: 0, max: 3, step: 0.01, value: 0, drift: "wave", low: 0.5, high: 1.5, on: false },
  bloomThreshold: { label: "Threshold", min: 0, max: 1, step: 0.01, value: 0.6, drift: "wave", low: 0.4, high: 0.8, on: false },
  bloomSoftness: { label: "Softness", min: 0, max: 1, step: 0.01, value: 0.3, drift: "wave", low: 0.1, high: 0.6, on: false },
  bloomSize: { label: "Size", min: 1, max: 6, step: 0.1, value: 3, drift: "wave", low: 2, high: 5, on: false },
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
  warpCenterX: 0, warpCenterY: 0, cameraHeight: 0, cameraDolly: 0, cameraTruck: 0,
  mapScale: 1, juliaZoom: 1, mapPower: 1, mapArms: 0, mapTwist: 0, mapSpeed: 0, tunnelTwist: 0, mapPanX: 0, mapPanY: 0,
  mobiusPanX: 0, mobiusPanY: 0,
  centerX: 0, centerY: 0, zoom: 1, panX: 0, panY: 0, twirl: 0,
  blurMaskX: 0, blurMaskY: 0,
  trailTurn: 0, trailHue: 0, trailFlow: 0,
  particleGravity: 0,
  cyclesCenterX: 0, cyclesCenterY: 0,
  solidSpin: 0, solidTumble: 0, solidTilt: 0, solidX: 0, solidY: 0,
  outlineSpin: 0, outlineTumble: 0,
  raysX: 0, raysY: 0,
  exposure: 0
};

const rand = (min: number, max: number) => min + Math.random() * (max - min);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export function createParams(): Params {
  const params = {} as Params;
  PARAM_KEYS.forEach((key, index) => { params[key] = { ...SPECS[key], seed: index }; });
  return params;
}

/** The start-up orders: the fold, then the map bends the folded picture, then the warp; and blur, trails, time smear, contours, relief, driver, camera, 3D object, pixel sort, particles, light cycles, light rays, lasers, bloom, final effects. */
export const defaultShapeOrder = (): ShapeStep[] => ["kaleidoscope", "map", "warp"];
export const defaultPictureOrder = (): PictureStep[] => ["blur", "trails", "smear", "contours", "relief", "driver", "terrain", "camera", "solid", "sort", "particles", "cycles", "rays", "lasers", "bloom", "sharpen", "color", "levels", "picture", "outlines"];
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
    case "driver": return used("driverAmount");
    case "sort": return used("sortAmount");
    case "particles": return used("particleAmount");
    case "solid": return used("solidAmount");
    case "cycles": return used("cyclesAmount");
    case "rays": return used("raysAmount");
    case "lasers": return used("laserAmount");
    case "outlines": return used("outlineAmount");
    case "picture": return used("pictureAmount");
    case "bloom": return used("bloomAmount");
    case "sharpen": return used("sharpen");
    case "color": return used("overlayOpacity");
    case "levels": return used("exposure") || used("blackLevel");
    default: return true;
  }
}

export function createPlayState(): PlayState {
  return {
    /* No effect is in the list at start-up, so every effect group is off. */
    groups: { animation: true, source: true, warp: false, map: false, kaleidoscope: false, blur: false, trails: false, smear: false, contours: false, relief: false, driver: false, terrain: false, camera: false, solid: false, sort: false, particles: false, cycles: false, rays: false, lasers: false, bloom: false, sharpen: false, color: false, levels: false, picture: false, outlines: false },
    locks: { animation: false, source: false, warp: false, map: false, kaleidoscope: false, blur: false, trails: false, smear: false, contours: false, relief: false, driver: false, terrain: false, camera: false, solid: false, sort: false, particles: false, cycles: false, rays: false, lasers: false, bloom: false, sharpen: false, color: false, levels: false, picture: false, outlines: false },
    blendMode: 0, tiling: 0, warpMode: 1, warpType: 0, warpTime: 0, mandelFlowTime: 0, mapTravel: 0, cameraX: 0, cameraY: 0, mapMode: 8, mandelPlace: 0, foldMode: 2, fxOrder: [], layerBlend: { warp: 0, map: 0, kaleidoscope: 0 }, sound: {}, blurMask: 0, trailMode: 1, overlayColor: "#ff7a1a", colorBlend: 0, trailColor: "#2a6cff", smearShape: 0, contourTone: "hue", contourBlend: 0, cameraBlend: 0, viewBlend: 0, skyColor: "#7fa6e6", cameraRepeat: 0, cameraHeightSource: 2, cameraColors: 2, cameraStops: defaultTerrainStops(), sortOrder: 0, particleBlend: 0, particleShape: 0, pictureBlend: 1, particleStops: defaultGradientStops(), cyclesMove: 0, cyclesBlend: 7, cyclesPaint: 0, cyclesStops: defaultCycleStops(), outlineShape: 0, outlineDraw: 0, outlineStops: defaultOutlineStops(), outlineTime: 0, outlineFlowTime: 0, solidShape: 1, solidMap: 0, solidBlend: 0, solidKeep: false, solidSpinTurns: 0, solidTumbleTurns: 0, outlineSpinTurns: 0, outlineTumbleTurns: 0, driverSource: 0, driverMode: 0, driverTime: 0, videoCrossfade: false, paused: false, time: 0, clock: 0 };
}

/** The longest custom time a range can have, in seconds. */
export const MAX_CUSTOM_SECONDS = 60;

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
  /* A one-way curve plays whole on every trip; a wandering one goes on from trip to trip; the others go out on one trip and back on the next. */
  const travel = ONE_WAY.has(kind) ? (trips % 1 + 1) % 1 : (trips % 2 + 2) % 2;
  const part = WANDER.has(kind) ? wander(kind, trips, param.seed ?? 0) : easeCurve(kind, travel <= 1 ? travel : 2 - travel);
  return rangeAt(param, part);
}

/** The value "part" of the way from a range's start handle (0) to its end handle (1). */
export function rangeAt(param: Param, part: number): number {
  const start = clamp(param.low ?? param.min, param.min, param.max);
  const end = clamp(param.high ?? param.max, param.min, param.max);
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

/** One color stop of a gradient: its place from 0 to 1, and its color as "#rrggbb". */
export interface GradientStop {
  at: number;
  color: string;
}

/** The most color stops a gradient can have (the particle shader's arrays have this size). */
export const MAX_GRADIENT_STOPS = 8;

/** The gradient a new scene starts with: red to blue. */
export const defaultGradientStops = (): GradientStop[] => [{ at: 0, color: "#ff0000" }, { at: 1, color: "#0000ff" }];

/** The light cycles' gradient in a new scene: cyan to orange, the two colors of the film's cycles. */
export const defaultCycleStops = (): GradientStop[] => [{ at: 0, color: "#18e0ff" }, { at: 1, color: "#ff7a1a" }];
/** The camera's Height colors, from the lowest land to the highest: dark valley green, grass, rock brown, gray stone, snow. */
export const defaultTerrainStops = (): GradientStop[] => [
  { at: 0, color: "#2f4a24" }, { at: 0.28, color: "#5f8a3a" }, { at: 0.5, color: "#7d6748" }, { at: 0.68, color: "#8f8b85" }, { at: 0.8, color: "#f2f4f7" }
];
/** Light shapes' colors along the outline: the same color at both ends, so no seam shows at the top. */
export const defaultOutlineStops = (): GradientStop[] => [{ at: 0, color: "#18e0ff" }, { at: 0.5, color: "#ff2bd6" }, { at: 1, color: "#18e0ff" }];

/**
 * The gradient's color at a place from 0 to 1, as red, green and blue from
 * 0 to 1: the stops' colors mixed in a straight line between the two stops
 * around it, and the end stops' colors past them. The particle shader
 * mixes the same way (see lifeColor).
 */
export function gradientColorAt(stops: readonly GradientStop[], at: number): [number, number, number] {
  const sorted = [...stops].sort((a, b) => a.at - b.at);
  if (at <= sorted[0].at) return hexToRgb(sorted[0].color);
  for (let index = 1; index < sorted.length; index++) {
    const next = sorted[index];
    if (at <= next.at) {
      const before = sorted[index - 1];
      const t = next.at > before.at ? (at - before.at) / (next.at - before.at) : 1;
      const [a, b] = [hexToRgb(before.color), hexToRgb(next.color)];
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    }
  }
  return hexToRgb(sorted[sorted.length - 1].color);
}

/** Red, green and blue from 0 to 1, to "#rrggbb". */
export function rgbToHex([red, green, blue]: readonly [number, number, number]): string {
  return `#${[red, green, blue].map((value) => Math.round(clamp(value, 0, 1) * 255).toString(16).padStart(2, "0")).join("")}`;
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

/**
 * The range for a value that turns its range on, from "low" to "high". Both
 * ends on one value (a value of 0 with the low end at 0, as Color overlay
 * has at first) would put one handle on the other, so such a range opens to
 * a tenth of the slider's span: up from that value where there is room,
 * else down to it. Any other range stays as it is, also a reversed one.
 */
export function openRange(param: Param, low: number, high: number): [number, number] {
  if (Math.abs(high - low) >= param.step / 2) return [low, high];
  const decimals = (String(param.step).split(".")[1] ?? "").length;
  const width = Math.max(param.step, Math.round(((param.max - param.min) * 0.1) / param.step) * param.step);
  const round = (value: number) => Number(value.toFixed(decimals));
  return low + width <= param.max ? [round(low), round(low + width)] : [round(Math.max(param.min, low - width)), round(low)];
}

/** Half the height of a 35 mm film frame (24 mm tall), in millimeters. */
const FRAME_HALF_HEIGHT = 12;
/** The Lens setting's focal length (mm, on a 35 mm camera) as the view's vertical angle, in radians. */
export const lensAngle = (focal: number) => 2 * Math.atan(FRAME_HALF_HEIGHT / focal);
/** A vertical view angle in degrees (the Lens before millimeters) as a focal length in mm. */
export const lensFocal = (degrees: number) => FRAME_HALF_HEIGHT / Math.tan((degrees * Math.PI) / 360);

export function formatValue(param: Param, value: number): string {
  const decimals = (String(param.step).split(".")[1] ?? "").length;
  return value.toFixed(Math.max(decimals, param.step < 1 ? 2 : 0)) + (param.unit ?? "");
}

/** Picks a new random look. The range is on only for the values that move the picture most. */
/** How far Nudge moves each value: this part of its slider's full range. */
export const NUDGE = 0.025;

/**
 * The way each value went at its last nudge (1 up, -1 down), for the value
 * and each range handle. The next nudge goes on the same way: with a new
 * coin toss each time, about half the values would be back where they were
 * two nudges ago, so Nudge would seem to start from the first values.
 */
const nudgeWays = new WeakMap<Param, Partial<Record<"value" | "low" | "high", number>>>();

/**
 * Nudge: moves every value of the unlocked groups a little: NUDGE of its
 * slider's full range, kept inside the slider and on its steps. The first
 * nudge picks up or down at random; later nudges go on the same way, and a
 * value turns back at the end of its slider. A range moves both handles,
 * each on its own way; a whole-circle turn keeps its full range, and other
 * angles wrap around the circle. A value at 0 stays 0, so an effect that
 * is off stays off. As with Randomize, the scene length, the image blend
 * and the layer opacities stay; menus and colors do not change.
 */
export function nudgeParams(params: Params, state: PlayState, random = Math.random) {
  const skip = lockedKeys(state);
  for (const group of Object.keys(GROUP_PARAMS) as GroupKey[]) {
    if (group === "animation" || group === "source" || state.locks[group]) continue;
    for (const key of GROUP_PARAMS[group]) {
      if (OPACITY_KEYS.includes(key) || skip.has(key)) continue;
      skip.add(key);
      const param = params[key];
      const circle = param.drift === "spin" && param.min === 0 && param.max === 360;
      const ways = nudgeWays.get(param) ?? {};
      nudgeWays.set(param, ways);
      const nudge = (value: number, part: "value" | "low" | "high") => {
        if (value === 0) return 0;
        let way = ways[part] ?? (random() < 0.5 ? -1 : 1);
        /* A log slider moves the same part of its length. */
        const log = param.scale === "log";
        const from = log ? toSlider(param, value) : value;
        const size = log ? SLIDER_STEPS * NUDGE : (param.max - param.min) * NUDGE;
        const [min, max] = log ? [0, SLIDER_STEPS] : [param.min, param.max];
        /* At the end of the slider, the value turns back. */
        if (!circle && (from + way * size > max + 1e-9 || from + way * size < min - 1e-9)) way = -way;
        ways[part] = way;
        const moved = from + way * size;
        if (log) return fromSlider(param, clamp(moved, min, max));
        const inside = circle ? ((moved % 360) + 360) % 360 : clamp(moved, param.min, param.max);
        const stepped = param.min + Math.round((inside - param.min) / param.step) * param.step;
        return Number(clamp(stepped, param.min, param.max).toFixed(6));
      };
      param.value = nudge(param.value, "value");
      if (!param.drift || !param.on) continue;
      const low = param.low ?? param.min;
      const high = param.high ?? param.max;
      if (circle && Math.min(low, high) <= param.min && Math.max(low, high) >= param.max) continue;
      param.low = nudge(low, "low");
      param.high = nudge(high, "high");
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
    colorBlend: state.colorBlend,
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
    if (state.locks.color) {
      state.overlayColor = keptState.overlayColor;
      state.colorBlend = keptState.colorBlend;
    }
    if (state.locks.camera) state.skyColor = keptState.skyColor;
  }
}

/** The Radial look that differs from the start-up defaults: ten segments, a slow turn, a small pan. */
const RADIAL_START: Partial<Record<ParamKey, Partial<Param>>> = {
  segments: { value: 10 },
  rotation: { low: 0, high: 45, on: true, ease: "organic" },
  panX: { low: -0.15, high: 0.15, on: true },
  panY: { low: -0.15, high: 0.15, on: true }
};

/**
 * Picking Radial in the Kaleidoscope Type menu: the sliders that Radial
 * shows go to the start-up defaults with RADIAL_START on top. The tile
 * types keep the values they have.
 */
export function applyRadialStart(params: Params) {
  for (const key of ["segments", "panX", "panY", "rotation", "zoom", "twirl", "centerX", "centerY"] as const) {
    const { value, low, high, on, ease } = { ...SPECS[key], ...RADIAL_START[key] };
    Object.assign(params[key], { value, low, high, on, ease, custom: false, startTime: 0 });
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
  const keep = lockedKeys(state);
  for (const group of Object.keys(GROUP_PARAMS) as GroupKey[]) {
    if (group === "source" || group === "animation" || state.locks[group]) continue;
    for (const key of GROUP_PARAMS[group]) {
      if (keep.has(key)) continue;
      const { value, low, high, on, ease } = SPECS[key];
      Object.assign(params[key], { value, low, high, on, ease, custom: false, startTime: 0 });
    }
    state.groups[group] = false;
  }
  if (!state.locks.warp) {
    state.warpMode = fresh.warpMode;
    state.warpType = fresh.warpType;
  }
  if (!state.locks.map) {
    state.mapMode = fresh.mapMode;
    state.mandelPlace = fresh.mandelPlace;
  }
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
  if (!state.locks.camera) state.viewBlend = fresh.viewBlend;
  /* The camera's sky and repeat are shared: they stay while either effect is locked. */
  if (!state.locks.camera && !state.locks.terrain) {
    state.skyColor = fresh.skyColor;
    state.cameraRepeat = fresh.cameraRepeat;
  }
  if (!state.locks.terrain) {
    state.cameraBlend = fresh.cameraBlend;
    state.cameraHeightSource = fresh.cameraHeightSource;
    state.cameraColors = fresh.cameraColors;
    state.cameraStops = fresh.cameraStops;
  }
  if (!state.locks.sort) state.sortOrder = fresh.sortOrder;
  if (!state.locks.picture) state.pictureBlend = fresh.pictureBlend;
  if (!state.locks.particles) {
    state.particleBlend = fresh.particleBlend;
    state.particleShape = fresh.particleShape;
    state.particleStops = fresh.particleStops;
  }
  if (!state.locks.solid) {
    state.solidShape = fresh.solidShape;
    state.solidMap = fresh.solidMap;
    state.solidBlend = fresh.solidBlend;
    state.solidKeep = fresh.solidKeep;
  }
  if (!state.locks.cycles) {
    state.cyclesMove = fresh.cyclesMove;
    state.cyclesBlend = fresh.cyclesBlend;
    state.cyclesPaint = fresh.cyclesPaint;
    state.cyclesStops = fresh.cyclesStops;
  }
  if (!state.locks.outlines) {
    state.outlineShape = fresh.outlineShape;
    state.outlineDraw = fresh.outlineDraw;
    state.outlineStops = fresh.outlineStops;
  }
  if (!state.locks.driver) {
    state.driverSource = fresh.driverSource;
    state.driverMode = fresh.driverMode;
  }
  if (!state.locks.color) {
    state.overlayColor = fresh.overlayColor;
    state.colorBlend = fresh.colorBlend;
  }
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
  map: ["mapOpacity", "mapMix", "mapScale", "juliaZoom", "mapPower", "juliaShape", "juliaEdge", "juliaFog", "juliaFogSoftness", "mapSteps", "mapArms", "mapTwist", "mapAngle", "mapSpeed", "mapFog", "mapFogSoftness", "tunnelTwist", "mapPanX", "mapPanY", "mapRoll", "mapCurl", "mandelDepth", "mandelEnd", "mandelSpeed", "mandelFade", "mandelSpread", "mandelInvert", "mandelEdge", "mandelEdgeWidth", "mandelBands", "mandelFlow", "mandelTerraces", "mandelSoftness", "mandelLight", "mandelLightAngle", "drosteSize", "drosteSpirals", "drosteSoftness", "drosteRound", "drosteRotation", "drostePictureTurn",
    "mobiusPoint", "mobiusTurn", "mobiusRotation", "mobiusTwist", "mobiusZoom", "mobiusPanX", "mobiusPanY", "mobiusFog", "mobiusFogSoftness"],
  kaleidoscope: ["foldOpacity", "segments", "tileSize", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl"],
  blur: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle", "blurMaskLevel"],
  trails: ["trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint"],
  smear: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  contours: ["contourHue", "contourOpacity", "contourLines", "contourWidth", "contourResolution", "contourSteady"],
  relief: ["reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine"],
  driver: ["driverAmount", "driverStrength", "driverScale", "driverSpeed", "driverContrast"],
  terrain: ["cameraAmount", "cameraHeight", "cameraPan", "cameraTilt", "cameraPedestal", "cameraDolly", "cameraTruck", "cameraLens", "cameraLightTurn", "cameraLightHeight", "cameraShadow", "cameraFog", "cameraSky", "cameraShine", "cameraSmooth", "cameraTerrainScale", "cameraRoughness", "cameraRidges", "cameraSeed", "cameraDetail", "cameraDetailSize"],
  /** Camera shares its camera with Terrain (see SPECS). */
  camera: ["viewAmount", "cameraPan", "cameraTilt", "cameraPedestal", "cameraDolly", "cameraTruck", "cameraLens", "cameraFog", "cameraSky"],
  solid: ["solidAmount", "solidBackground", "solidSize", "solidRound", "solidMorph", "solidBlobs", "solidBumps", "solidWaves", "solidSpikes", "solidSpikeCount", "solidSpikeTip", "solidLevels", "solidSpin", "solidTumble", "solidTilt", "solidBend", "solidTiles", "solidLight", "solidShading", "solidShine", "solidShadow", "solidX", "solidY"],
  sort: ["sortAmount", "sortLow", "sortHigh", "sortAngle", "sortLength", "sortThickness"],
  particles: ["particleAmount", "particleBackground", "particleCount", "particleLevel", "particleSize", "particleLife", "particleSpeed", "particleGravity", "particleAngle", "particleTurbulence", "particleDrag", "particleFollow", "particleCling", "particleGradient", "particleBoost", "particleRingRadius"],
  cycles: ["cyclesAmount", "cyclesBackground", "cyclesCount", "cyclesSpeed", "cyclesWidth", "cyclesLength", "cyclesTurns", "cyclesFollow", "cyclesDodge", "cyclesGrid", "cyclesHead", "cyclesGradient", "cyclesShift", "cyclesRepeat", "cyclesAngle", "cyclesCenterX", "cyclesCenterY"],
  rays: ["raysAmount", "raysThreshold", "raysLength", "raysFade", "raysX", "raysY"],
  picture: ["pictureAmount", "pictureSize", "pictureX", "pictureY", "pictureTurn", "pictureKey"],
  lasers: ["laserAmount", "laserCount", "laserSpread", "laserSweep", "laserSweepDelay", "laserBase", "laserBaseAngle", "laserWidth", "laserGlow", "laserGlowSize", "laserEmitter", "laserFade", "laserHue", "laserRainbow", "laserX", "laserY"],
  outlines: ["outlineAmount", "outlineCount", "outlineRadius", "outlineSpacing", "outlineDelay", "outlineDrawTime", "outlineLength", "outlinePoints", "outlineWidth", "outlineGlow", "outlineGlowSize", "outlineFlow", "outlineTurn", "outlineSpin", "outlineTumble", "outlineX", "outlineY"],
  bloom: ["bloomAmount", "bloomThreshold", "bloomSoftness", "bloomSize"],
  sharpen: ["sharpen", "sharpenRadius"],
  color: ["overlayOpacity"],
  levels: ["exposure", "blackLevel"]
};

/** The settings of the locked groups. A setting can be in two groups (Camera shares its camera with Terrain), and a lock on either keeps it. */
function lockedKeys(state: PlayState): Set<ParamKey> {
  return new Set((Object.keys(GROUP_PARAMS) as GroupKey[]).filter((group) => state.locks[group]).flatMap((group) => GROUP_PARAMS[group]));
}

/** The play-state settings of each group that Randomize sets: a group's own Randomize changes these too. */
const GROUP_STATE: Partial<Record<GroupKey, (keyof PlayState)[]>> = {
  warp: ["warpType"],
  map: ["mapMode"],
  kaleidoscope: ["foldMode"],
  blur: ["blurMask"],
  trails: ["trailColor"],
  smear: ["smearShape"],
  contours: ["contourTone", "contourBlend"],
  terrain: ["skyColor", "cameraBlend", "cameraRepeat"],
  camera: ["skyColor", "viewBlend", "cameraRepeat"],
  sort: ["sortOrder"],
  particles: ["particleBlend", "particleShape"],
  outlines: ["outlineShape", "outlineDraw"],
  picture: ["pictureBlend"],
  cycles: ["cyclesMove", "cyclesBlend", "cyclesPaint"],
  solid: ["solidShape", "solidMap", "solidBlend"],
  driver: ["driverSource", "driverMode"],
  color: ["overlayColor", "colorBlend"]
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
  kaleidoscope: 0.9, map: 0.75, warp: 0.7, blur: 0, trails: 0.5, smear: 0.2, contours: 0.25, relief: 0.4, driver: 0.3, terrain: 0.3, camera: 0, solid: 0.2, sort: 0.2, particles: 0.25, cycles: 0.25, rays: 0.25, lasers: 0.15, bloom: 0.3, sharpen: 0.3, color: 0.15, levels: 0.25,
  /* An overlay needs an image or a video that the user picks. */
  picture: 0,
  outlines: 0.15
};

function randomizeAll(params: Params, state?: PlayState) {
  if (state) {
    state.overlayColor = hslToHex(rand(0, 360), rand(0.5, 1), rand(0.35, 0.6));
    state.colorBlend = (Math.random() < 0.5 ? 0 : Math.floor(Math.random() * 8)) as LayerBlend;
    state.skyColor = hslToHex(Math.random() < 0.6 ? rand(190, 250) : rand(0, 360), rand(0.3, 0.8), rand(0.45, 0.8));
    state.mapMode = (1 + Math.floor(Math.random() * 8)) as MapMode;
    /* Noise is the most common warp; the other kinds share the rest. */
    state.warpType = (Math.random() < 0.4 ? 0 : 1 + Math.floor(Math.random() * 5)) as WarpType;
    /**
     * Each unlocked effect is in the new list by its chance, in a random
     * order. A locked effect keeps its place (or stays out of the list).
     */
    /* Light shapes draws its chance at the end (see below), so the other effects' random values stay as they were before it. */
    /* Terrain draws the chance the one Camera drew before it, in its place, and the flat Camera draws none, so the other effects' random values stay as they were. */
    const chosen = defaultFxOrder().filter((step) => step !== "outlines" && step !== "camera" && !state.locks[step] && Math.random() < EFFECT_CHANCE[step]);
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
  set("mapScale", rand(0.3, 1.1), rand(0.05, 0.2));
  set("juliaZoom", rand(0.6, 1.2), rand(0.05, 0.2));
  set("mapPower", rand(1.5, 4), rand(0.2, 1));
  setAngle("juliaShape", 0.3);
  set("juliaEdge", rand(0.8, 1.2), rand(0.03, 0.1));
  set("mapSteps", Math.round(rand(2, 8)));
  set("drosteSize", rand(0.25, 0.6), rand(0.02, 0.1));
  set("drosteSpirals", [1, 1, 1, 2][Math.floor(Math.random() * 4)]);
  set("mapTwist", rand(-60, 60), rand(5, 25));
  set("mapSpeed", (Math.random() < 0.8 ? 1 : -1) * rand(0.1, 0.6), rand(0, 0.2));
  set("mapFog", rand(0.3, 0.8), rand(0, 0.15));
  set("mapFogSoftness", rand(0.3, 0.7), rand(0, 0.1));
  set("mobiusFog", rand(0.3, 0.8), rand(0, 0.15));
  set("juliaFog", rand(0.3, 0.8), rand(0, 0.15));
  set("juliaFogSoftness", rand(0.3, 0.7), rand(0, 0.1));
  set("mobiusFogSoftness", rand(0.3, 0.7), rand(0, 0.1));
  set("tunnelTwist", Math.random() < 0.4 ? 0 : rand(-1.5, 1.5), rand(0.1, 0.5));
  set("mapPanX", Math.random() < 0.5 ? 0 : rand(-0.4, 0.4), rand(0.05, 0.25));
  set("mapPanY", Math.random() < 0.5 ? 0 : rand(-0.4, 0.4), rand(0.05, 0.25));
  setAngle("mapRoll", 0.5);
  set("mapCurl", Math.random() < 0.5 ? 0 : rand(0.02, 0.3), rand(0.01, 0.05));
  set("mobiusPoint", rand(0.7, 0.95), rand(0.03, 0.1));
  setAngle("mobiusTurn", 0.5);
  setAngle("mobiusRotation", 0.5);
  set("mobiusTwist", Math.random() < 0.5 ? 0 : rand(0.01, 0.08), rand(0.005, 0.03));
  set("mobiusZoom", rand(1, 3), rand(0.2, 0.8));
  set("mobiusPanX", Math.random() < 0.5 ? 0 : rand(-0.4, 0.4), rand(0.05, 0.25));
  set("mobiusPanY", Math.random() < 0.5 ? 0 : rand(-0.4, 0.4), rand(0.05, 0.25));
  set("centerX", rand(-0.2, 0.2), rand(0.1, 0.35));
  set("centerY", rand(-0.15, 0.15), rand(0.08, 0.3));
  setAngle("rotation", 0.7);
  set("zoom", rand(0.4, 1.3), rand(0.05, 0.25));
  set("panX", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("panY", rand(-0.5, 0.5), rand(0.1, 0.4));
  set("twirl", Math.random() < 0.4 ? rand(-1.5, 1.5) : 0, rand(0.3, 1));
  /* Whether an effect shows is set by the list (see EFFECT_CHANCE), so its strength is never 0 here. */
  set("blurAmount", rand(5, 30), rand(3, 15));
  set("blurMaskSize", rand(0.15, 0.6), rand(0.05, 0.2));
  set("blurMaskSoft", rand(0.2, 0.9), rand(0, 0.2));
  if (state) state.blurMask = Math.floor(Math.random() * 6) as BlurMask;
  set("trailAmount", rand(0.6, 0.95), rand(0.03, 0.1));
  set("trailZoom", rand(1.004, 1.02), rand(0.002, 0.008));
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
    state.particleBlend = (Math.random() < 0.7 ? 0 : 1) as ParticleBlend;
    state.cyclesMove = (Math.random() < 0.6 ? 0 : 1) as CycleMove;
    state.cyclesBlend = (Math.random() < 0.7 ? 7 : Math.floor(Math.random() * 8)) as LayerBlend;
    state.cyclesPaint = Math.floor(Math.random() * 4) as CyclePaint;
    state.solidShape = Math.floor(Math.random() * 10) as SolidShape;
    state.solidMap = Math.floor(Math.random() * 3) as SolidMap;
    state.solidBlend = (Math.random() < 0.7 ? 0 : Math.floor(Math.random() * 8)) as LayerBlend;
    state.driverSource = Math.floor(Math.random() * 5) as DriverSource;
    state.driverMode = Math.floor(Math.random() * 3) as DriverMode;
    state.sortOrder = (Math.random() < 0.5 ? 0 : 1) as SortOrder;
  }
  set("reliefAmount", rand(0.3, 1), rand(0.1, 0.3));
  set("reliefDepth", rand(3, 12), rand(0, 3));
  set("reliefSize", rand(1, 3), rand(0, 0.8));
  setAngle("lightAngle", 0.5);
  set("shine", Math.random() < 0.5 ? 0 : rand(0.1, 0.6), rand(0, 0.2));
  set("cameraAmount", 1, rand(0, 0.1));
  set("viewAmount", 1);
  set("cameraHeight", (Math.random() < 0.8 ? 1 : -1) * rand(0.1, 0.5), rand(0.02, 0.15));
  /* The same random draws as the orbit camera's before it, so the effects after it keep their random values. */
  set("cameraTilt", rand(20, 75) - 90, rand(5, 20));
  setAngle("cameraPan", 0.6);
  set("cameraDolly", Math.random() < 0.5 ? 0 : (Math.random() < 0.8 ? 1 : -1) * rand(0.1, 0.6), rand(0, 0.3));
  set("cameraPedestal", rand(0.5, 1.8), rand(0.05, 0.4));
  set("cameraLens", lensFocal(rand(40, 100)), rand(0, 6));
  setAngle("cameraLightTurn", 0.3);
  set("cameraLightHeight", rand(15, 70), rand(0, 20));
  set("cameraShadow", rand(0.3, 1), rand(0, 0.2));
  set("cameraFog", Math.random() < 0.5 ? rand(0, 0.1) : rand(0.1, 0.6), rand(0, 0.15));
  set("cameraSky", rand(0, 1), rand(0, 0.2));
  set("cameraShine", Math.random() < 0.5 ? 0 : rand(0.1, 0.6), rand(0, 0.2));
  set("cameraSmooth", rand(1.5, 4), rand(0, 1));
  set("sortAmount", rand(0.7, 1), rand(0, 0.2));
  set("sortLow", rand(0.1, 0.4), rand(0.02, 0.1));
  set("sortHigh", rand(0.6, 0.95), rand(0.02, 0.1));
  setAngle("sortAngle", 0.15);
  set("sortLength", Math.random() < 0.5 ? 1 : rand(0.1, 0.6), rand(0.05, 0.2));
  set("sortThickness", Math.random() < 0.5 ? 1 : rand(2, 24), rand(0.5, 4));
  set("particleAmount", rand(0.6, 1), rand(0, 0.2));
  set("particleCount", Math.round(rand(1500, 15000)), rand(200, 2000));
  set("particleLevel", rand(0.3, 0.8), rand(0.05, 0.15));
  set("particleSize", rand(1.5, 10), rand(0.5, 3));
  set("particleLife", rand(1, 5), rand(0.2, 1));
  set("particleSpeed", rand(0.01, 0.2), rand(0, 0.05));
  set("particleGravity", Math.random() < 0.4 ? 0 : rand(-0.3, 0.3), rand(0.02, 0.1));
  setAngle("particleAngle", 0.2);
  set("particleTurbulence", rand(0, 1), rand(0.05, 0.3));
  set("particleDrag", rand(0.3, 2.5), rand(0, 0.5));
  set("cyclesAmount", rand(0.7, 1), rand(0, 0.2));
  set("cyclesBackground", Math.random() < 0.6 ? 1 : rand(0.2, 0.8), rand(0, 0.2));
  set("cyclesCount", Math.round(Math.random() < 0.7 ? rand(4, 40) : rand(40, 400)), rand(1, 10));
  set("cyclesSpeed", rand(0.15, 0.6), rand(0, 0.1));
  set("cyclesWidth", rand(1, 6), rand(0.2, 1));
  set("cyclesLength", Math.random() < 0.5 ? 30 : rand(1, 12), rand(0.5, 3));
  set("cyclesTurns", rand(0.2, 3), rand(0.1, 0.8));
  set("cyclesFollow", Math.random() < 0.5 ? 0 : rand(0.2, 1), rand(0.05, 0.2));
  set("cyclesDodge", rand(0.2, 1), rand(0.05, 0.2));
  set("cyclesGrid", rand(0.008, 0.06), rand(0.002, 0.01));
  set("cyclesHead", rand(0.2, 1), rand(0, 0.2));
  set("cyclesGradient", Math.random() < 0.4 ? 0 : rand(0.5, 1), rand(0, 0.3));
  set("cyclesShift", rand(0, 1), rand(0, 0.5));
  set("cyclesRepeat", rand(0.5, 3), rand(0.1, 0.5));
  setAngle("cyclesAngle", 0.4);
  set("cyclesCenterX", Math.random() < 0.5 ? 0 : rand(-0.3, 0.3), rand(0.05, 0.2));
  set("cyclesCenterY", Math.random() < 0.5 ? 0 : rand(-0.25, 0.25), rand(0.05, 0.2));
  set("solidAmount", 1, rand(0, 0.1));
  set("solidBackground", Math.random() < 0.6 ? 1 : rand(0.1, 0.7), rand(0, 0.2));
  set("solidSize", rand(0.4, 0.9), rand(0.05, 0.2));
  set("solidRound", Math.random() < 0.4 ? 0 : rand(0.05, 0.7), rand(0, 0.2));
  set("solidSpin", (Math.random() < 0.5 ? -1 : 1) * rand(2, 20), rand(0, 5));
  set("solidTumble", Math.random() < 0.5 ? 0 : rand(-8, 8), rand(0, 3));
  set("solidTilt", rand(-40, 40), rand(0, 20));
  set("solidBend", rand(0.2, 0.8), rand(0, 0.2));
  set("solidTiles", rand(0.75, 3), rand(0, 0.5));
  setAngle("solidLight", 0.3);
  set("solidShading", rand(0.3, 0.9), rand(0, 0.2));
  set("solidShine", rand(0, 0.8), rand(0, 0.2));
  set("solidShadow", rand(0.2, 0.8), rand(0, 0.2));
  set("solidX", Math.random() < 0.6 ? 0 : rand(-0.3, 0.3), rand(0.05, 0.2));
  set("solidY", Math.random() < 0.6 ? 0 : rand(-0.2, 0.2), rand(0.05, 0.15));
  set("driverAmount", rand(0.6, 1), rand(0, 0.2));
  set("driverStrength", rand(0.3, 0.9), rand(0.05, 0.2));
  set("driverScale", rand(0.6, 2), rand(0.1, 0.4));
  set("driverSpeed", rand(0.3, 1.5), rand(0.1, 0.4));
  set("driverContrast", rand(0.8, 1.8), rand(0.1, 0.3));
  /* Gentle light rays: strong or long rays from every bright area look like many lights. */
  set("raysAmount", rand(0.4, 1), rand(0.05, 0.2));
  set("raysThreshold", rand(0.65, 0.85), rand(0, 0.05));
  set("raysLength", rand(0.1, 0.35), rand(0.02, 0.08));
  set("raysFade", rand(0.2, 0.8), rand(0, 0.2));
  set("raysX", Math.random() < 0.5 ? 0 : rand(-0.3, 0.3), rand(0.05, 0.25));
  set("raysY", Math.random() < 0.5 ? 0 : rand(-0.25, 0.25), rand(0.05, 0.2));
  set("laserAmount", rand(0.6, 1.5), rand(0.1, 0.3));
  set("laserCount", Math.round(rand(4, 20)), rand(0, 4));
  set("laserSpread", rand(20, 120), rand(10, 50));
  set("laserSweep", rand(20, 90), rand(20, 60));
  set("laserSweepDelay", Math.random() < 0.5 ? 0 : rand(0.02, 0.2), rand(0, 0.05));
  set("laserWidth", rand(0.8, 3), rand(0, 1));
  set("laserBase", Math.random() < 0.6 ? 0 : rand(0.1, 1), rand(0, 0.2));
  set("laserBaseAngle", Math.random() < 0.6 ? 0 : rand(-30, 30), rand(0, 20));
  set("laserGlow", rand(0.2, 2), rand(0, 0.4));
  set("laserGlowSize", rand(5, 30), rand(0, 5));
  set("laserEmitter", Math.random() < 0.2 ? 0 : rand(0.4, 1.6), rand(0, 0.3));
  set("laserFade", rand(0, 0.7), rand(0, 0.2));
  setAngle("laserHue", 0.3);
  set("laserRainbow", Math.random() < 0.5 ? 0 : rand(0.1, 1), rand(0, 0.2));
  set("laserX", Math.random() < 0.6 ? 0 : rand(-0.4, 0.4), rand(0, 0.15));
  set("laserY", Math.random() < 0.6 ? -0.5 : rand(-0.5, 0.5), rand(0, 0.1));
  /* A gentle bloom, for the same reason. */
  set("bloomAmount", rand(0.3, 0.8), rand(0.05, 0.15));
  set("bloomThreshold", rand(0.6, 0.85), rand(0, 0.05));
  set("bloomSoftness", rand(0.1, 0.5), rand(0, 0.1));
  set("bloomSize", rand(1.5, 3.5), rand(0.2, 0.6));
  set("sharpen", rand(0, 1.2), rand(0, 0.3));
  set("sharpenRadius", rand(0.7, 2.5), rand(0, 0.8));
  set("exposure", Math.random() < 0.6 ? 0 : rand(-1, 0.3), rand(0, 0.5));
  set("overlayOpacity", Math.random() < 0.75 ? 0 : rand(0.1, 0.4), rand(0, 0.15));
  set("blackLevel", Math.random() < 0.6 ? 0 : rand(0.02, 0.25), rand(0, 0.1));
  /** Every range starts off; Randomize turns on the ones that move the picture most. */
  const moving: ParamKey[] = ["warpAmount", "warpMarble", "mapPower", "juliaShape", "mobiusPoint", "mapTwist", "mapSpeed", "lightAngle", "cameraPan",
    "centerX", "centerY", "rotation", "zoom", "panX", "panY"];
  for (const key of PARAM_KEYS) {
    const userOwned = GROUP_PARAMS.source.includes(key) || GROUP_PARAMS.animation.includes(key) || OPACITY_KEYS.includes(key);
    if (params[key].drift && !userOwned) params[key].on = moving.includes(key);
  }
  params.twirl.on = Math.random() < 0.5;
  /* Last, so the shapes added later (2026-10-24) do not change the random picks above. */
  set("solidMorph", rand(0.1, 1), rand(0, 0.3));
  set("solidBlobs", Math.round(rand(3, 7)), rand(0, 1));
  set("solidBumps", rand(0.2, 0.9), rand(0, 0.3));
  set("solidWaves", rand(2, 8), rand(0, 2));
  set("solidSpikes", rand(0.2, 1), rand(0, 0.3));
  set("solidSpikeTip", Math.random() < 0.6 ? 0 : rand(0.2, 1), rand(0, 0.3));
  set("solidSpikeCount", Math.random() < 0.5 ? 12 : Math.round(rand(6, 24)), rand(0, 2));
  set("solidLevels", Math.round(rand(2, 4)), rand(0, 1));
  /* Light rays and bloom together make every bright area shine; when Randomize picks both, each gets less. */
  if (state?.fxOrder.includes("rays") && state.fxOrder.includes("bloom")) {
    for (const key of ["raysAmount", "bloomAmount"] as const) {
      const param = params[key];
      param.value *= 0.6;
      if (param.low !== undefined) param.low *= 0.6;
      if (param.high !== undefined) param.high *= 0.6;
    }
  }
  /**
   * Light shapes, last: its random values come after every other effect's,
   * so the effects from before it get the same values from the same random
   * numbers. When Randomize picks it, it goes at the end of the list, over
   * the picture.
   */
  set("outlineAmount", rand(0.6, 1.5), rand(0.1, 0.3));
  set("outlineCount", Math.round(rand(1, 5)), 0);
  set("outlineRadius", rand(0.15, 0.45), rand(0, 0.08));
  set("outlineSpacing", rand(0.2, 0.8), rand(0, 0.2));
  set("outlineDelay", rand(0, 0.3), rand(0, 0.1));
  set("outlineDrawTime", rand(1.5, 6), rand(0, 1));
  set("outlineLength", rand(0.15, 0.6), rand(0, 0.15));
  set("outlinePoints", Math.round(rand(4, 8)), 0);
  set("outlineWidth", rand(1, 3), rand(0, 0.8));
  set("outlineGlow", rand(0.4, 1.8), rand(0, 0.4));
  set("outlineGlowSize", rand(8, 30), rand(0, 5));
  set("outlineFlow", Math.random() < 0.5 ? 0 : rand(-0.3, 0.3), rand(0, 0.1));
  if (state && !state.locks.outlines) {
    const on = Math.random() < EFFECT_CHANCE.outlines;
    state.groups.outlines = on;
    if (on) state.fxOrder = [...state.fxOrder, "outlines"];
    state.outlineShape = Math.floor(Math.random() * 4) as OutlineShape;
    state.outlineDraw = Math.floor(Math.random() * 3) as OutlineDraw;
  }
  /* Last, so the random values before them stay as they were before them. */
  set("outlineSpin", Math.random() < 0.6 ? 0 : (Math.random() < 0.5 ? -1 : 1) * rand(2, 12), rand(0, 3));
  set("outlineTumble", Math.random() < 0.7 ? 0 : rand(-6, 6), rand(0, 2));
}
