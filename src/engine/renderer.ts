import { GpuTimer } from "./gpuTimer";
import { CycleSim, INSTANCE_FLOATS, type CycleSettings, type Picture } from "./cycles";
import { trackTextureMemory, type TextureMemory } from "./textureMemory";
import { BLUR_SHADER, CAMERA_FIELD_SHADER, DRIVER_SHADER, CAMERA_SHADER, CONTOUR_FIELD_SHADER, CONTOUR_SHADER, COPY_SHADER, FINISH_SHADER, KALEIDO_SHADER, MAX_SHADER, OVERLAY_SHADER, BLOOM_BRIGHT_SHADER, BLOOM_DOWN_SHADER, BLOOM_SHADER, BLOOM_UP_SHADER, RAYS_MIX_SHADER, RAYS_SHADER, SORT_JUMP_SHADER, SORT_PACK_SHADER, SORT_SHADER, SORT_START_SHADER, SORT_STEP_SHADER, SORT_TURN_SHADER, PARTICLE_SHADER, PARTICLE_STEP_SHADER, PARTICLE_VERTEX_SHADER, CYCLE_MIX_SHADER, CYCLE_SAMPLE_SHADER, SOLID_SHADER, CYCLE_SHADER, CYCLE_VERTEX_SHADER, RELIEF_SHADER, SMEAR_SHADER, TRAILS_SHADER, VERTEX_SHADER } from "./shaders";

/** The blur mask: circle with a sharp or a blurred center, gradient, bright areas, dark areas, noise. */
export type BlurMask = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 = no trails, 1 = mix, 2 = lighten. */
export type TrailMode = 0 | 1 | 2;
/** 0 = none, 1 = power, 2 = Mobius, 3 = Julia, 4 = log spiral, 5 = sine, 6 = tunnel. */
export type MapMode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** The Mandelbrot map's places to dive into (see MANDEL_PLACES). */
export type MandelPlace = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 = no warp, 1 = warp the screen (breaks the symmetry), 2 = warp the image (keeps it). */
export type WarpMode = 0 | 1 | 2;
/** 0 = radial wedges around one center, 1 = triangle tiles, 2 = hexagon tiles. */
export type FoldMode = 0 | 1 | 2;
/** The steps that move pixels around, before anything is drawn. The user sets their order. */
export type ShapeStep = "warp" | "map" | "kaleidoscope";

/** The kind of warp: noise, ripple, waves, swirl, bulge and pinch, cells. */
export type WarpType = 0 | 1 | 2 | 3 | 4 | 5;
/** The steps that change the drawn picture. The user sets their order. */
export type PictureStep = "blur" | "trails" | "smear" | "contours" | "relief" | "driver" | "camera" | "solid" | "sort" | "particles" | "cycles" | "rays" | "bloom" | "sharpen" | "color" | "levels";
/**
 * Any effect step. The user sets one order for all of them. Shape steps
 * that are next to each other run in one pass; a shape step after a
 * picture step moves the picture made so far, not the source images.
 */
export type FxStep = ShapeStep | PictureStep;
export const SHAPE_STEPS: readonly ShapeStep[] = ["warp", "map", "kaleidoscope"];
export const PICTURE_STEPS: readonly PictureStep[] = ["blur", "trails", "smear", "contours", "relief", "driver", "camera", "solid", "sort", "particles", "cycles", "rays", "bloom", "sharpen", "color", "levels"];

/** Sharpen, Color and Levels, in the order FINISH_SHADER applies them (see drawFinish). */
type FinishPart = "sharpen" | "color" | "levels";
const FINISH_PARTS: readonly FinishPart[] = ["sharpen", "color", "levels"];
const isFinishPart = (step: FxStep): step is FinishPart => (FINISH_PARTS as readonly string[]).includes(step);
export const isShapeStep = (step: FxStep): step is ShapeStep => (SHAPE_STEPS as readonly FxStep[]).includes(step);
/** The time smear's pattern: 0 linear, 1 rings, 2 sweep, 3 brightness, 4 noise (see SMEAR_SHADER). */
export type SmearShape = 0 | 1 | 2 | 3 | 4;

const SHAPE_CODES: Record<ShapeStep, number> = { warp: 0, map: 1, kaleidoscope: 2 };
/** The Mandelbrot path texture's row length (see mandelPath). */
const MANDEL_ROW = 1024;
/** The Mandelbrot map's rounds: deeper views need more before their points escape (at most 1250, which keeps the cost down). */
export const mandelRounds = (depth: number) => Math.round(Math.min(1250, Math.max(250, 250 + 100 * depth)));
/** 0 normal, 1 screen, 2 multiply, 3 overlay, 4 difference, 5 lighten, 6 darken, 7 add. */
export type LayerBlend = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** How the camera's land goes on past the picture: 0 mirrored, 1 repeated as it is, 2 not at all (sky around the picture). */
export type CameraRepeat = 0 | 1 | 2;
/** The Driver effect's driver: 0 caustics, 1 smoke, 2 ink, 3 fire, 4 rain ripples, 5 the user's video (see DRIVER_SHADER). */
export type DriverSource = 0 | 1 | 2 | 3 | 4 | 5;
/** What the driver does to the picture: 0 bends it, 1 reveals it through the driver, 2 lights it. */
export type DriverMode = 0 | 1 | 2;
/** The pixel sort's order along each run: 0 dark to bright, 1 bright to dark. */
export type SortOrder = 0 | 1;
/** How the particles combine with the picture: 0 glow (they add their light), 1 normal (they cover it). */
export type ParticleBlend = 0 | 1;
/** How the light cycles move: 0 on grid lanes with right-angle turns, 1 in free curves. */
export type CycleMove = 0 | 1;
/**
 * Where the light cycles' gradient colors come from: 0 one color per cycle,
 * 1 along each trail (by age), 2 the place on the screen along a line, 3 the
 * distance from a center.
 */
export type CyclePaint = 0 | 1 | 2 | 3;
/** The 3D Object's shape: sphere, cube, cylinder, cone, torus, capsule, octahedron, icosahedron, pyramid (see SOLID_SHADER). */
export type SolidShape = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;
/** How the picture goes onto the 3D Object: 0 wrapped on its surface, 1 bent through it like a lens, 2 reflected in it like chrome. */
export type SolidMap = 0 | 1 | 2;
/** How the two images fade: 0 = crossfade, 1 = dissolve by brightness (light areas change first). */
export type BlendMode = 0 | 1;
/**
 * How the image goes on past its edges: 0 auto (repeated for a repeating
 * test pattern, mirrored for anything else), 1 mirrored, 2 repeated as it
 * is. Repeating keeps a seamless tile, such as a checkerboard, seamless.
 */
export type Tiling = 0 | 1 | 2;

/** The values for one frame. Angles are in radians. */
export interface FrameValues {
  /** Every effect step, in the order they act on the picture. */
  fxOrder: FxStep[];
  /** Which shape steps are on; a step that is off is left out, so it costs no pass. */
  shapeActive: Record<ShapeStep, boolean>;
  /** Each shape step's opacity, and how its result combines with the picture without it (see LayerBlend). */
  shapeOpacity: Record<ShapeStep, number>;
  layerBlend: Record<ShapeStep, LayerBlend>;
  segments: number;
  foldMode: FoldMode;
  /** The tile size in tile modes, in screen heights between neighbor cell centers. */
  tileSize: number;
  warpMode: WarpMode;
  warpType: WarpType;
  /** Ripple, swirl and bulge: the center, in screen heights. Waves: the direction (radians). */
  warpCenterX: number;
  warpCenterY: number;
  warpAngle: number;
  /** Warp strength, in screen heights. */
  warpAmount: number;
  warpScale: number;
  /** Cells warp: the cell size, in tenths of the screen height, and the turn of the cell pattern (radians). */
  warpCellSize: number;
  warpCellAngle: number;
  /** Cells warp: the number of sides, 3 to 6, and how far each cell point moves from its grid place, 0 to 1 (see params.ts). */
  warpCellSides: number;
  warpCellRandom: number;
  warpMarble: number;
  warpDetail: number;
  /** How far the warp noise has flowed. */
  warpTime: number;
  mapMode: MapMode;
  mapMix: number;
  /** The Mandelbrot map (map mode 9): depth in powers of ten, band width, terraces, their softness, light, and the light's angle (radians). */
  mandelDepth: number;
  mandelBands: number;
  /** Growth: the share of the view that shows; the rest, the points that escape last, turns black (see mandelGrowth). */
  mandelGrowth: number;
  mandelTerraces: number;
  mandelSoftness: number;
  mandelLight: number;
  mandelLightAngle: number;
  /** The bands moved so far by Band flow (in bands). */
  mandelFlow: number;
  /** The dive's crossfade (see frameValues in engine.ts): how much of the view at the second depth shows over the first. */
  mandelFade: number;
  mandelFadeDepth: number;
  mapScale: number;
  mapPower: number;
  mapPointX: number;
  mapPointY: number;
  mapSteps: number;
  /** Seamless spiral: the twist (negative turns the other way; 0 gives rings), and the whole number of image copies one turn holds. */
  mapArms: number;
  spiralCopies: number;
  /** Droste spiral: the size of the copy inside the picture (0 to 1), and the whole number of spiral arms. */
  drosteSize: number;
  drosteSpirals: number;
  drosteSoftness: number;
  drosteRound: number;
  drosteRotation: number;
  drostePictureTurn: number;
  mapTwist: number;
  /** The angle (radians) of the axis that power, log spiral and tunnel fold over. */
  mapAngle: number;
  mapPanX: number;
  mapPanY: number;
  mapRoll: number;
  mapCurl: number;
  /** Tunnel only: how far the wall turns per tube length, in radians. */
  tunnelTwist: number;
  /** How far the view has flown into the tunnel. */
  mapTravel: number;
  /** How much the far end of the tunnel fades to black. */
  mapFog: number;
  mapFogSoftness: number;
  /** Möbius only: the turn (radians), twist, zoom and pan applied after the map. */
  mobiusTurn: number;
  mobiusRotation: number;
  mobiusTwist: number;
  mobiusZoom: number;
  mobiusPanX: number;
  mobiusPanY: number;
  /** The kaleidoscope center, as a fraction of the screen size from the screen center. */
  centerX: number;
  centerY: number;
  rotation: number;
  zoom: number;
  twirl: number;
  panX: number;
  panY: number;
  trailMode: TrailMode;
  /** How much of the previous frame stays, per 1/60 s. */
  trailAmount: number;
  /** How much the previous frame grows, per 1/60 s. */
  trailZoom: number;
  /** How far the previous frame turns, per 1/60 s. */
  trailTurn: number;
  /** How far the previous frame's colors turn around the color wheel, per 1/60 s. */
  trailHue: number;
  /** How far the previous frame is pushed along (or around) its brightness slopes, in pixels per 1/60 s. */
  trailFlow: number;
  /** 0 pushes along the slopes, 1 around them. */
  trailSwirl: number;
  /** How strongly the old trails are multiplied by the trail color, per 1/60 s (0 = none), and that color (red, green, blue from 0 to 1). */
  trailTint: number;
  trailColor: [number, number, number];
  /** The animation time since the last frame, in 1/60 s units. 0 while paused. */
  frameScale: number;
  /**
   * How far the trails fade this frame, in 1/60 s units. It is the
   * animation time, or the real time while animation time stands still, so
   * a change made while stopped still shows instead of freezing in the trails.
   */
  fadeScale: number;
  /** Unsharp-mask strength (0 = off) and its radius in pixels. */
  sharpen: number;
  sharpenRadius: number;
  /** In stops; 0 = no change, -1 = half as bright. */
  exposure: number;
  /** 0 = no change; colors at or below it become black. */
  blackLevel: number;
  /** The color overlay color (red, green, blue from 0 to 1) and its opacity (0 = off). */
  overlayColor: [number, number, number];
  overlayOpacity: number;
  colorBlend: LayerBlend;
  /** Time smear: strength (0 = off), the longest delay in seconds, the pattern, its angle (radians) and how many bands it repeats. */
  smear: number;
  smearDelay: number;
  smearShape: SmearShape;
  smearAngle: number;
  smearBands: number;
  /** Seconds between smear restarts (0 = never), and the seconds the smear fades out before each one. */
  smearRestart: number;
  smearFade: number;
  /** Real seconds of play (the play clock); the smear restarts follow it. */
  playClock: number;
  /** Real seconds of play since the last frame (0 while paused), for the time smear's frame history. */
  playSeconds: number;
  /** Contour lines: strength (0 = off), lines across the brightness range, width in pixels, and blur (mip level). */
  contours: number;
  contourLines: number;
  contourWidth: number;
  contourSmooth: number;
  /** How much of the last contour brightness each 1/60 s keeps (0 to under 1), so the lines glide. */
  contourSteady: number;
  /** The lines' color, and how they combine with the picture (see LayerBlend). */
  contourColor: [number, number, number];
  contourBlend: LayerBlend;
  /**
   * Driver (see DRIVER_SHADER): opacity (0 = off), the driver and the mode,
   * how strongly it acts, its size, its contrast, and how far its motion
   * has run (seconds × speed).
   */
  driver: number;
  driverSource: DriverSource;
  driverMode: DriverMode;
  driverStrength: number;
  driverScale: number;
  driverContrast: number;
  driverTime: number;
  /** Relief lighting: strength (0 = off), height of the bumps, pixel size, light angle (radians) and gloss. */
  relief: number;
  reliefDepth: number;
  reliefSize: number;
  lightAngle: number;
  shine: number;
  /**
   * Camera (see CAMERA_SHADER): whether the camera is on (then its view
   * always shows, even of a flat floor), how much of the raised land shows
   * over the floor, the land's height, the camera's tilt and turn (radians), distance and lens
   * angle (radians), the sun's turn and height (radians), the shadows,
   * the fog, how much the sky and fog take the sky color, that color, the
   * shine of the land, and the blur of the height (a mip level).
   */
  cameraOn: boolean;
  /** How the raised land combines with the flat floor (see blendLayer), and how the land goes on past the picture. */
  cameraBlend: LayerBlend;
  cameraRepeat: CameraRepeat;
  camera: number;
  cameraHeight: number;
  cameraTilt: number;
  cameraTurn: number;
  /** Where the aim point is on the land (screen heights). */
  cameraX: number;
  cameraY: number;
  cameraDistance: number;
  cameraLens: number;
  cameraLightTurn: number;
  cameraLightHeight: number;
  cameraShadow: number;
  cameraFog: number;
  cameraSky: number;
  skyColor: [number, number, number];
  cameraShine: number;
  cameraSmooth: number;
  /**
   * 3D Object (see SOLID_SHADER): opacity (0 = off), the shape, the map, the
   * blend, the picture behind it, its size (screen heights), roundness, its
   * spin and tumble angles and its tilt (radians), bend, tiles, the light's
   * angle (radians), shading, shine, shadow, and its place (screen heights
   * from the screen center).
   */
  solid: number;
  solidShape: SolidShape;
  solidMap: SolidMap;
  /** Freeze background: the steps after the 3D Object change only the picture on the shape (see render). */
  solidKeep: boolean;
  solidBlend: LayerBlend;
  solidBackground: number;
  solidSize: number;
  solidRound: number;
  /** Morph's squareness (0 star-like, about 0.38 a ball, 1 a cube), how many blobs, the wobbly ball's bumps and waves, and the star's spike length. */
  solidMorph: number;
  solidBlobs: number;
  solidBumps: number;
  solidWaves: number;
  solidSpikes: number;
  /** The star's spike shape: 0 pointed, 1 capped (as wide at the top as at the foot). */
  solidSpikeTip: number;
  /** How many spikes the star has (4 to 32). */
  solidSpikeCount: number;
  /** The Menger sponge's levels of holes (1 to 5). */
  solidLevels: number;
  /** Animation seconds: the blobs drift and the bumps flow with it. */
  solidTime: number;
  solidSpin: number;
  solidTumble: number;
  solidTilt: number;
  solidBend: number;
  solidTiles: number;
  solidLight: number;
  solidShading: number;
  solidShine: number;
  solidShadow: number;
  solidX: number;
  solidY: number;
  /**
   * Pixel sort (see SORT_STEP_SHADER): opacity (0 = off), the order, the
   * brightness range that is sorted, the angle of the sort lines (radians),
   * the longest run, as a part of the screen's diagonal (1 = no cut), and
   * the width of each sort line in pixels at 1080p.
   */
  sort: number;
  sortOrder: SortOrder;
  sortLow: number;
  sortHigh: number;
  sortAngle: number;
  sortLength: number;
  sortThickness: number;
  /**
   * Particles (see PARTICLE_STEP_SHADER): opacity (0 = off), how they
   * combine with the picture, how many there are, the brightness a spot
   * needs to emit one, the size in pixels at 1080p, the life span and the
   * start speed (screen heights per second), gravity and its direction
   * (radians), turbulence and drag.
   */
  particles: number;
  particleBlend: ParticleBlend;
  /** The opacity of the picture under the particles: 1 shows it whole, 0 leaves only the particles, on black. */
  particleBackground: number;
  particleCount: number;
  particleLevel: number;
  particleSize: number;
  particleLife: number;
  particleSpeed: number;
  particleGravity: number;
  particleAngle: number;
  particleTurbulence: number;
  particleDrag: number;
  particleFollow: number;
  particleCling: number;
  particleGradient: number;
  particleBoost: number;
  /** The life gradient's stops, in order: their places, and their colors as red, green, blue (three numbers each). */
  particleStopAt: Float32Array;
  particleStopColor: Float32Array;
  /** Animation seconds since the last frame (0 while paused, so the particles stand still), and the animation time. */
  particleSeconds: number;
  particleTime: number;
  /**
   * Light Cycles (see cycles.ts): opacity (0 = off), how they move and
   * blend, the picture's opacity under the lines, how many there are, their
   * speed (screen heights per second), the line width (pixels at 1080p), the
   * fade time in seconds (Infinity: no fade), the turns per second, follow,
   * dodge, the lane spacing (screen heights), the head glow, and the
   * animation seconds since the last frame (0 while paused).
   */
  cycles: number;
  cyclesMove: CycleMove;
  cyclesBlend: LayerBlend;
  cyclesBackground: number;
  cyclesCount: number;
  cyclesSpeed: number;
  cyclesWidth: number;
  cyclesLength: number;
  cyclesTurns: number;
  cyclesFollow: number;
  cyclesDodge: number;
  cyclesGrid: number;
  cyclesHead: number;
  cyclesSeconds: number;
  /**
   * The cycles' gradient (see CYCLE_SHADER): where its colors come from, how
   * much it replaces the picture's color, its shift (a whole gradient trip
   * out and back is 1), how many times it repeats, the angle of a linear
   * gradient (radians), the center of a radial one (a part of the screen
   * size from the screen center), and its stops, as particleStopAt and
   * particleStopColor.
   */
  cyclesPaint: CyclePaint;
  cyclesGradient: number;
  cyclesShift: number;
  cyclesRepeat: number;
  cyclesAngle: number;
  cyclesCenterX: number;
  cyclesCenterY: number;
  cyclesStopAt: Float32Array;
  cyclesStopColor: Float32Array;
  /**
   * Light rays (see RAYS_SHADER): strength (0 = off), the brightness where
   * the light starts, the length (a part of the way to the center), the
   * fade along a ray, and the center (a part of the screen size from the
   * screen center).
   */
  rays: number;
  raysThreshold: number;
  raysLength: number;
  raysFade: number;
  raysX: number;
  raysY: number;
  /**
   * Bloom (see BLOOM_SHADER): strength (0 = off), the brightness where the
   * glow starts and how gradually, and its size (a mip level at 1080p).
   */
  bloom: number;
  bloomThreshold: number;
  bloomSoftness: number;
  bloomSize: number;
  /** 0 shows the first image, 1 the second; between, they fade into each other. */
  imageBlend: number;
  /**
   * Blur, in screen heights (0 = off), and its mask: the mask kind, its
   * size, softness, center (in screen heights from the screen center),
   * angle (radians) and level.
   */
  blur: number;
  blurMask: BlurMask;
  blurMaskSize: number;
  blurMaskSoft: number;
  blurMaskX: number;
  blurMaskY: number;
  blurMaskAngle: number;
  blurMaskLevel: number;
  blendMode: BlendMode;
  /** True to repeat the images past their edges, false to mirror them (see Tiling). */
  tileRepeat: boolean;
}

/** Sizes and counts that drive the GPU cost, for the performance display. */
export interface RenderInfo {
  width: number;
  height: number;
  /** The kaleidoscope texture, which includes the border for the blur. */
  textureWidth: number;
  textureHeight: number;
  blurSamples: number;
  /** How many versions of the picture each pixel mixes: 1, plus 1 for each shape step not at full opacity in normal mode. */
  shapeVersions: number;
}

interface Target {
  texture: WebGLTexture;
  framebuffer: WebGLFramebuffer;
}

/** How many points of the softer picture the blur reads for each pixel (see BLUR_SHADER). */
const BLUR_TAPS = 9;

export type ImageSource = HTMLImageElement | HTMLCanvasElement | HTMLVideoElement;

/** The pixel size of an image, a canvas or a video. */
export function sourceSize(source: ImageSource): [number, number] {
  if (source instanceof HTMLImageElement) return [source.naturalWidth, source.naturalHeight];
  if (source instanceof HTMLVideoElement) return [source.videoWidth, source.videoHeight];
  return [source.width, source.height];
}

/**
 * A video in an image slot. Its texture gets each new video frame (see
 * updateVideos). A second copy of the video (the partner) can fade in over
 * it, so the video's end crossfades into its start (see video.ts).
 */
interface VideoSlot {
  video: HTMLVideoElement;
  partner: HTMLVideoElement | null;
  /** The copy that shows (the video or its partner), and how much of the other one shows over it. */
  main: HTMLVideoElement;
  mix: number;
  /** A smaller copy for a video larger than MAX_IMAGE_SIDE, drawn again for each frame. */
  scaled: HTMLCanvasElement | null;
  /** Where the two copies are mixed during a fade, at the upload size. */
  mixed: HTMLCanvasElement | null;
  /** True when a copy has a frame that is not uploaded yet. */
  fresh: boolean;
  /** When a copy last reported a new frame, and the copy and video time of the last upload. */
  lastCallbackAt: number;
  uploadedTime: number;
  uploadedFrom: HTMLVideoElement | null;
  /** Stops each copy's frame reports. */
  unwatch: (() => void)[];
}

/** A playing video that has not reported a frame for this long is uploaded when its time changes. */
const VIDEO_CALLBACK_TIMEOUT_MS = 250;

interface Program {
  program: WebGLProgram;
  uniforms: Record<string, WebGLUniformLocation>;
}

/** The particles: one texel of the state textures per particle, so at most PARTICLE_SIDE² of them. */
const PARTICLE_SIDE = 1024;

/** One copy of the particle state: place and speed, age and life span, color (see PARTICLE_STEP_SHADER). */
interface ParticleState {
  framebuffer: WebGLFramebuffer;
  textures: [WebGLTexture, WebGLTexture, WebGLTexture];
}

/** The most line segments (and heads) Light Cycles draws in one frame. */
const MAX_CYCLE_INSTANCES = 262144;
/** The width of the small copy of the picture that the light cycles read. */
const CYCLE_PICTURE_WIDTH = 256;

/** Frames the time smear keeps, and the most GPU memory they may use (they get smaller on a large canvas). */
const SMEAR_SLOTS = 32;
const SMEAR_MEMORY = 320 * 1024 * 1024;

/** The longest image side that is uploaded. Larger images are scaled down first. */
const MAX_IMAGE_SIDE = 4096;

/**
 * Draws the kaleidoscope into an offscreen texture, then draws that texture
 * with motion blur. With trails on, the blurred frame is combined with the
 * previous output (two textures, used in turn), and the result is copied to
 * the canvas.
 */
export class KaleidoRenderer {
  private readonly gl: WebGL2RenderingContext;
  /** An estimate of the GPU memory the textures use (see trackTextureMemory). */
  readonly memory: TextureMemory;
  private readonly kaleido: Program;
  private readonly blur: Program;
  /** The first and the second image. */
  private readonly imageTextures: [WebGLTexture, WebGLTexture];
  private readonly frameTexture: WebGLTexture;
  /** GPU limits, read once: a read of a GPU setting waits for the GPU, so it is not done in each frame. */
  private readonly maxTextureSize: number;
  private readonly maxPointSize: number;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly trails: Program;
  private readonly copy: Program;
  private readonly finish: Program;
  private readonly relief: Program;
  private readonly driver: Program;
  /** The Driver effect's own video (driver 5), its texture, and the video time of the frame in it. */
  private driverVideo: HTMLVideoElement | null = null;
  private driverTexture: WebGLTexture | null = null;
  private driverVideoTime = -1;
  private readonly camera: Program;
  private readonly cameraField: Program;
  private readonly solidProgram: Program;
  private readonly maxPass: Program;
  private readonly contours: Program;
  private readonly contourField: Program;
  /** The contour brightness of the last frame and of this frame; they change roles each frame (see drawContours). */
  private readonly fieldTargets: [Target, Target];
  /** The camera's height field, and its pyramid of highest points with one mip level per square size (see drawCamera). */
  private readonly heightTarget: Target;
  private maxTexture: WebGLTexture | null = null;
  /** Separate output for reductions: never sample a texture while drawing into it. */
  private maxReduction: WebGLTexture | null = null;
  private readonly maxFramebuffer: WebGLFramebuffer;
  private maxLevels = 0;
  /** The pyramid's side: a power of two that covers the picture, so every level's squares cover it whole. */
  private maxSide = 0;
  private readonly maxFormat: number;
  private fieldIndex = 0;
  private contoursWereOn = false;
  private readonly smear: Program;
  /**
   * The time smear's frame history: SMEAR_SLOTS layers of one texture, at a
   * size that keeps it within SMEAR_MEMORY. "head" is the newest layer,
   * taken "since" seconds ago; "filled" layers hold frames. Made on first use.
   */
  private history: { texture: WebGLTexture; framebuffers: WebGLFramebuffer[]; size: [number, number]; head: number; filled: number; since: number; round: number } | null = null;
  private smearWasOn = false;
  private readonly particleStep: Program;
  private readonly particleDraw: Program;
  /** The particle state of the last frame and of this frame; they change roles each frame. Made on first use. */
  private particleStates: [ParticleState, ParticleState] | null = null;
  private particleIndex = 0;
  private particlesWereOn = false;
  /** Counts the frames that move the particles, so each frame gets new random numbers. */
  private particleFrame = 0;
  /** An empty vertex array: the particle points read their state from textures, not from attributes. */
  private readonly particleVertices: WebGLVertexArrayObject;
  /** True when the GPU can draw to 32-bit float textures, which the particle state needs. */
  private readonly floatTargets: boolean;
  /** Light Cycles: the cycles, and whether they were on in the last frame (when not, they start again). */
  private readonly cycleSim = new CycleSim();
  private cyclesWereOn = false;
  private readonly cycleSample: Program;
  private readonly cycleDraw: Program;
  private readonly cycleMix: Program;
  /** The lines of this frame, drawn here first and then over the picture. */
  private readonly cycleTarget: Target;
  /** The line instances (see writeInstances), and their GPU buffer and vertex array. Made on first use. */
  private cycleInstances = new Float32Array(4096 * INSTANCE_FLOATS);
  private cycleBuffer: { vertices: WebGLVertexArrayObject; instances: WebGLBuffer; capacity: number } | null = null;
  /**
   * The small copy of the picture for the cycles: its texture, the buffer the
   * GPU copies it into, and the fence of a copy that is not done yet. The
   * cycles read the last copy that is done ("cyclePicture").
   */
  private cycleRead: { texture: WebGLTexture; framebuffer: WebGLFramebuffer; buffer: WebGLBuffer; size: [number, number]; fence: WebGLSync | null } | null = null;
  private cyclePicture: Picture | null = null;
  /** The pixel sort's passes, in order (see drawSort). */
  private readonly sortPrograms: { turn: Program; start: Program; jump: Program; pack: Program; step: Program; show: Program };
  /** Three square pictures for the pixel sort, made on first use, and their side. */
  private sortTargets: [Target, Target, Target] | null = null;
  private sortSide = 0;
  private readonly rays: Program;
  private readonly raysMix: Program;
  /** Two half-size pictures for the light rays; the ray passes go back and forth between them. */
  private readonly raysTargets: [Target, Target];
  private readonly bloomBright: Program;
  private readonly bloomDown: Program;
  private readonly bloomUp: Program;
  private readonly bloomMix: Program;
  /** The bright parts of the picture, for the bloom. */
  /**
   * The bloom levels: the bright parts at half size, quarter size, and so
   * on (see drawBloom). Only the first "bloomLevels" fit this canvas; the
   * smallest of those is at least 8 pixels tall.
   */
  private readonly bloomChain: Target[] = [];
  private bloomLevels = 0;
  /** A second scratch picture, so a pass never reads the texture it draws to. */
  private readonly scratch: Target;
  /** A scratch picture between passes. */
  private readonly current: Target;
  /** The trail output of the last frame and of this frame; they change roles each frame. */
  private readonly trailTargets: [Target, Target];
  private trailIndex = 0;
  private trailSize: [number, number] = [0, 0];
  private trailsWereOn = false;
  /** Trails use half-float color when the GPU can draw to it, so long trails fade out cleanly. */
  private readonly trailFormat: { internal: number; type: number };
  readonly timer: GpuTimer;
  readonly info: RenderInfo = { width: 0, height: 0, textureWidth: 0, textureHeight: 0, blurSamples: 0, shapeVersions: 1 };
  private imageSizes: [[number, number], [number, number]] = [[1, 1], [1, 1]];
  /** The video in each image slot, if the slot holds one. */
  private readonly videos: [VideoSlot | null, VideoSlot | null] = [null, null];
  /** The canvas size in device pixels. */
  private frameSize: [number, number] = [0, 0];
  /**
   * The size of one pixel for the effects that work in pixels (trail flow,
   * relief, sharpen), in this canvas's pixels. Video export sets it, so the
   * effects look the same as on the screen at another size.
   */
  texelScale = 1;

  /** The canvas size in device pixels, as of the last frame. */
  get canvasSize(): [number, number] {
    return [...this.frameSize];
  }
  /** The border around the screen in the offscreen texture, in pixels. It only grows, until the canvas size changes. */
  private pad = -1;
  private textureSize: [number, number] = [0, 0];

  /**
   * "size" fixes the frame size in pixels, for a canvas that is not on the
   * screen (video export). Without it, the canvas follows its displayed size.
   */
  constructor(private readonly canvas: HTMLCanvasElement, private readonly size: [number, number] | null = null) {
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false });
    if (!gl) throw new Error("WebGL 2 is not available on this computer.");
    this.gl = gl;
    this.memory = trackTextureMemory(gl);
    /**
     * A lost context (the graphics driver gave up, often on a frame that took
     * too long) leaves the picture blank; say so in the console. A renderer
     * that dispose gave back (a preview, a video export) loses its context
     * on purpose, so that loss says nothing.
     */
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      if (!this.disposed) console.error("The WebGL context was lost. The picture stops until the app is restarted.");
    });
    this.kaleido = this.createProgram(KALEIDO_SHADER);
    this.blur = this.createProgram(BLUR_SHADER);
    this.trails = this.createProgram(TRAILS_SHADER);
    this.copy = this.createProgram(COPY_SHADER);
    this.finish = this.createProgram(FINISH_SHADER);
    this.relief = this.createProgram(RELIEF_SHADER);
    this.driver = this.createProgram(DRIVER_SHADER);
    this.camera = this.createProgram(CAMERA_SHADER);
    this.cameraField = this.createProgram(CAMERA_FIELD_SHADER);
    this.solidProgram = this.createProgram(SOLID_SHADER);
    this.maxPass = this.createProgram(MAX_SHADER);
    this.contours = this.createProgram(CONTOUR_SHADER);
    this.contourField = this.createProgram(CONTOUR_FIELD_SHADER);
    this.smear = this.createProgram(SMEAR_SHADER);
    this.particleStep = this.createProgram(PARTICLE_STEP_SHADER);
    this.particleDraw = this.createProgram(PARTICLE_SHADER, PARTICLE_VERTEX_SHADER);
    this.particleVertices = gl.createVertexArray()!;
    this.cycleSample = this.createProgram(CYCLE_SAMPLE_SHADER);
    this.cycleDraw = this.createProgram(CYCLE_SHADER, CYCLE_VERTEX_SHADER);
    this.cycleMix = this.createProgram(CYCLE_MIX_SHADER);
    this.bloomBright = this.createProgram(BLOOM_BRIGHT_SHADER);
    this.bloomDown = this.createProgram(BLOOM_DOWN_SHADER);
    this.rays = this.createProgram(RAYS_SHADER);
    this.sortPrograms = {
      turn: this.createProgram(SORT_TURN_SHADER),
      start: this.createProgram(SORT_START_SHADER),
      jump: this.createProgram(SORT_JUMP_SHADER),
      pack: this.createProgram(SORT_PACK_SHADER),
      step: this.createProgram(SORT_STEP_SHADER),
      show: this.createProgram(SORT_SHADER)
    };
    this.raysMix = this.createProgram(RAYS_MIX_SHADER);
    this.bloomUp = this.createProgram(BLOOM_UP_SHADER);
    this.bloomMix = this.createProgram(BLOOM_SHADER);

    /** One triangle that covers the whole screen. */
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    this.imageTextures = [gl.createTexture()!, gl.createTexture()!];
    /* The second image starts as one black pixel, so its sampler is always complete. */
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[1]);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    this.maxPointSize = (gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE) as Float32Array)[1];
    this.frameTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.framebuffer = gl.createFramebuffer()!;

    this.floatTargets = Boolean(gl.getExtension("EXT_color_buffer_float"));
    this.trailFormat = this.floatTargets
      ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    this.current = this.createTarget();
    this.scratch = this.createTarget();
    this.trailTargets = [this.createTarget(), this.createTarget()];
    this.fieldTargets = [this.createTarget(), this.createTarget()];
    this.heightTarget = this.createTarget();
    this.raysTargets = [this.createTarget(), this.createTarget()];
    this.cycleTarget = this.createTarget();
    this.maxFramebuffer = gl.createFramebuffer()!;
    this.maxFormat = this.trailFormat.internal === gl.RGBA16F ? gl.R16F : gl.R8;
    this.timer = new GpuTimer(gl);
  }

  /** Uploads the first (slot 0) or the second (slot 1) image. A video keeps its texture up to date (see updateVideos). */
  setImage(source: ImageSource, slot: 0 | 1 = 0) {
    const gl = this.gl;
    const maxSide = Math.min(gl.getParameter(gl.MAX_TEXTURE_SIZE) as number, MAX_IMAGE_SIDE);
    let [width, height] = sourceSize(source);
    if (width < 1 || height < 1) throw new Error("The image is empty.");
    let upload: ImageSource = source;
    let scaled: HTMLCanvasElement | null = null;
    if (Math.max(width, height) > maxSide) {
      const scale = maxSide / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
      scaled = document.createElement("canvas");
      scaled.width = width;
      scaled.height = height;
      scaled.getContext("2d")!.drawImage(source, 0, 0, width, height);
      upload = scaled;
    }
    this.stopVideo(slot);
    this.uploadTexture(slot, upload);
    this.imageSizes[slot] = [width, height];
    if (source instanceof HTMLVideoElement) this.watchVideo(slot, source, scaled);
  }

  /** Stops updating the slot's texture from its video, if it has one. The last frame stays. */
  stopVideo(slot: 0 | 1) {
    const entry = this.videos[slot];
    if (!entry) return;
    for (const stop of entry.unwatch) stop();
    this.videos[slot] = null;
  }

  /** Gives the slot's video its second copy, which fades in at the video's loop point (see showVideo). */
  setVideoPartner(slot: 0 | 1, partner: HTMLVideoElement) {
    const entry = this.videos[slot];
    if (!entry || entry.partner) return;
    entry.partner = partner;
    entry.unwatch.push(this.watch(entry, partner));
  }

  /** Which copy of the slot's video shows ("main", the video or its partner), and how much of the other copy shows over it. */
  showVideo(slot: 0 | 1, main: HTMLVideoElement, mix: number) {
    const entry = this.videos[slot];
    if (!entry) return;
    entry.main = main;
    entry.mix = entry.partner ? mix : 0;
  }

  /**
   * Uploads the newest frame of each video. Called once per frame, before
   * drawing. "force" uploads the current frame even when no new frame was
   * reported (after a seek). Returns true when it uploaded a frame.
   */
  updateVideos(force = false) {
    const now = performance.now();
    let uploaded = false;
    for (const slot of [0, 1] as const) {
      const entry = this.videos[slot];
      if (!entry) continue;
      const { main, scaled } = entry;
      const other = main === entry.video ? entry.partner : entry.video;
      /* During a fade both copies change, so every frame is uploaded. */
      const fading = Boolean(other && entry.mix > 0 && other.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);
      /* A video that stops reporting frames (for example while it is not on screen) is checked by its time. */
      const quiet = !main.paused && now - entry.lastCallbackAt > VIDEO_CALLBACK_TIMEOUT_MS && main.currentTime !== entry.uploadedTime;
      if (!entry.fresh && !quiet && !force && !fading && main === entry.uploadedFrom) continue;
      if (main.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) continue;
      entry.fresh = false;
      entry.uploadedTime = main.currentTime;
      entry.uploadedFrom = main;
      uploaded = true;
      if (fading && other) {
        const [width, height] = this.imageSizes[slot];
        if (!entry.mixed) {
          entry.mixed = document.createElement("canvas");
          entry.mixed.width = width;
          entry.mixed.height = height;
        }
        const context = entry.mixed.getContext("2d")!;
        context.globalAlpha = 1;
        context.drawImage(main, 0, 0, width, height);
        context.globalAlpha = entry.mix;
        context.drawImage(other, 0, 0, width, height);
        context.globalAlpha = 1;
        this.uploadTexture(slot, entry.mixed);
      } else {
        if (scaled) scaled.getContext("2d")!.drawImage(main, 0, 0, scaled.width, scaled.height);
        this.uploadTexture(slot, scaled ?? main);
      }
    }
    return uploaded;
  }

  private watchVideo(slot: 0 | 1, video: HTMLVideoElement, scaled: HTMLCanvasElement | null) {
    const entry: VideoSlot = {
      video, partner: null, main: video, mix: 0, scaled, mixed: null, fresh: false,
      lastCallbackAt: performance.now(), uploadedTime: video.currentTime, uploadedFrom: null, unwatch: []
    };
    entry.unwatch.push(this.watch(entry, video));
    this.videos[slot] = entry;
  }

  /** Marks the slot fresh each time the video element has a new frame. Returns a function that stops it. */
  private watch(entry: VideoSlot, video: HTMLVideoElement) {
    let callbackId = 0;
    const next = () => {
      callbackId = video.requestVideoFrameCallback(() => {
        entry.fresh = true;
        entry.lastCallbackAt = performance.now();
        next();
      });
    };
    next();
    return () => video.cancelVideoFrameCallback(callbackId);
  }

  private uploadTexture(slot: 0 | 1, upload: ImageSource) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[slot]);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, upload);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    this.setWrap(this.tileRepeat);
  }

  /** True while the images repeat past their edges (see setTiling). */
  private tileRepeat = false;

  /**
   * Sets how the bound texture's filter reads past its edges: around to the
   * other side for a repeated image, so the repeat has no seam, or the edge
   * pixel for a mirrored one.
   */
  private setWrap(repeat: boolean) {
    const gl = this.gl;
    const wrap = repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
  }

  /** Repeats the images past their edges, or mirrors them. */
  private setTiling(repeat: boolean) {
    if (repeat === this.tileRepeat) return;
    this.tileRepeat = repeat;
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    for (const texture of this.imageTextures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      this.setWrap(repeat);
    }
  }

  render(v: FrameValues) {
    const gl = this.gl;
    this.resizeCanvas();
    this.timer.collect();
    const [width, height] = this.frameSize;
    if (width === 0 || height === 0) return;

    const opacity = (step: ShapeStep) => Math.min(1, Math.max(0, v.shapeOpacity[step]));
    /**
     * The picture steps that do something. A shape step that is off does
     * nothing either, and neither does one at opacity 0: the shader would
     * mix all of it away.
     */
    const active: Record<FxStep, boolean> = {
      warp: v.shapeActive.warp && opacity("warp") > 0,
      map: v.shapeActive.map && opacity("map") > 0,
      kaleidoscope: v.shapeActive.kaleidoscope && opacity("kaleidoscope") > 0,
      blur: v.blur > 0,
      trails: v.trailMode !== 0,
      smear: v.smear > 0,
      contours: v.contours > 0,
      relief: v.relief > 0,
      driver: v.driver > 0,
      /* The camera's view always shows while it is on: at opacity 0 it is the flat floor, seen by the camera. */
      camera: v.cameraOn,
      particles: v.particles > 0 && this.floatTargets,
      cycles: v.cycles > 0,
      solid: v.solid > 0,
      /* The sort keeps column numbers in half floats, so it needs float textures. */
      sort: v.sort > 0 && this.floatTargets,
      rays: v.rays > 0,
      bloom: v.bloom > 0,
      sharpen: v.sharpen > 0,
      color: v.overlayOpacity > 0,
      levels: v.exposure !== 0 || v.blackLevel > 0
    };
    /**
     * The steps in the user's order, with shape steps that are next to each
     * other (once the steps that do nothing are left out) joined into one
     * pass. The shape steps before the first picture step read the source
     * images; a later group of shape steps reads the picture made so far.
     */
    /**
     * Sharpen, Color and Levels next to each other, in that order, join into
     * one pass of FINISH_SHADER, which applies them in that order.
     */
    const passes: (PictureStep | ShapeStep[] | { finish: FinishPart[] })[] = [];
    for (const step of v.fxOrder.filter((candidate) => active[candidate])) {
      const previous = passes[passes.length - 1];
      if (isFinishPart(step)) {
        const group = typeof previous === "object" && !Array.isArray(previous) ? previous.finish : null;
        if (group && FINISH_PARTS.indexOf(step) > FINISH_PARTS.indexOf(group[group.length - 1])) group.push(step);
        else passes.push({ finish: [step] });
      } else if (!isShapeStep(step)) passes.push(step);
      else if (Array.isArray(previous)) previous.push(step);
      else passes.push([step]);
    }
    const first = Array.isArray(passes[0]) ? passes.shift() as ShapeStep[] : [];
    /**
     * Freeze background (docs/LAYERS.md, phase 2): with a step after the 3D
     * Object, the steps after it change only the picture on the shape. The
     * 3D Object's place keeps the picture as it is there in keptTarget, and
     * passes it on unchanged; the steps after it change it as usual, but the
     * last one draws into a picture, not onto the screen. Then the 3D Object
     * is drawn last, painted with that picture, over the kept one.
     */
    const solidAt = passes.indexOf("solid");
    const layered = v.solidKeep && solidAt >= 0 && solidAt < passes.length - 1;

    const shapeSteps = v.fxOrder.filter((step): step is ShapeStep => isShapeStep(step) && active[step]);
    this.info.shapeVersions = 1 + shapeSteps.filter((step) => opacity(step) < 1 || v.layerBlend[step] !== 0).length;

    if (passes.length > 0) this.ensureTrailTargets(width, height);
    for (const step of PICTURE_STEPS) if (!active[step]) delete this.timer.times[step];
    /* A joined Sharpen, Color and Levels pass is timed under its first part. */
    for (const pass of passes) if (typeof pass === "object" && !Array.isArray(pass)) for (const part of pass.finish.slice(1)) delete this.timer.times[part];
    if (!passes.some(Array.isArray)) delete this.timer.times.refold;
    /** A scratch picture that is not the one being read. */
    const scratchFor = (input: WebGLTexture) => (input === this.current.texture ? this.scratch : this.current);

    /**
     * The kaleidoscope picture. Only a Blur that comes first reads past the
     * screen's edge (up to about its radius), so then the picture is drawn
     * into a texture with a border that wide. Otherwise it is drawn at the
     * screen's size straight into the picture for the next step, or onto
     * the screen when no step follows.
     */
    let source: WebGLTexture;
    let padded = false;
    const blurFirst = passes[0] === "blur";
    if (blurFirst) {
      this.ensurePad(v.blur * height);
      const [textureWidth, textureHeight] = this.textureSize;
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
      gl.viewport(0, 0, textureWidth, textureHeight);
      this.timer.begin("fold");
      this.drawShapes(v, first, null, width, height, this.pad);
      this.timer.end();
      source = this.frameTexture;
      padded = true;
    } else {
      const target = passes.length > 0 ? this.current : null;
      gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
      gl.viewport(0, 0, width, height);
      this.timer.begin("fold");
      this.drawShapes(v, first, null, width, height, 0);
      this.timer.end();
      source = target ? target.texture : this.current.texture;
    }
    const [textureWidth, textureHeight] = blurFirst ? this.textureSize : [width, height];
    Object.assign(this.info, { width, height, textureWidth, textureHeight, blurSamples: v.blur > 0 ? BLUR_TAPS : 0 });

    passes.forEach((step, index) => {
      const last = index === passes.length - 1 && !layered;
      if (typeof step === "object" && !Array.isArray(step)) {
        const target = last ? null : scratchFor(source);
        this.timer.begin(step.finish[0]);
        this.drawFinish(v, step.finish, source, target, width, height);
        this.timer.end();
        if (target) source = target.texture;
        padded = false;
        return;
      }
      if (Array.isArray(step)) {
        /* Shape steps after a picture step move the picture made so far. */
        const target = last ? null : scratchFor(source);
        gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
        gl.viewport(0, 0, width, height);
        this.timer.begin("refold");
        this.drawShapes(v, step, source, width, height);
        this.timer.end();
        if (target) source = target.texture;
        return;
      }
      this.timer.begin(step);
      if (step === "trails") {
        /* Trails draw into their own pair of textures, which the next frame reads back. */
        source = this.drawTrails(v, source, width, height);
        if (last) this.drawCopy(source);
      } else {
        const target = last ? null : scratchFor(source);
        if (step === "blur") this.drawBlur(v, source, padded, target, true);
        else if (step === "relief") this.drawRelief(v, source, target, width, height);
        else if (step === "driver") this.drawDriver(v, source, target, width, height);
        else if (step === "camera") this.drawCamera(v, source, target, width, height);
        else if (step === "solid" && layered) {
          /* The picture goes on as it is; the shape comes at the end (see after this loop). */
          this.drawCopy(source, this.keptTarget(width, height));
          this.timer.end();
          return;
        } else if (step === "solid") this.drawSolid(v, source, target, width, height, source);
        else if (step === "contours") this.drawContours(v, source, target, width, height);
        else if (step === "smear") this.drawSmear(v, source, target, width, height);
        else if (step === "particles") this.drawParticles(v, source, target, width, height);
        else if (step === "cycles") this.drawCycles(v, source, target, width, height);
        else if (step === "rays") this.drawRays(v, source, target, width, height);
        else if (step === "sort") this.drawSort(v, source, target, width, height);
        else if (step === "bloom") this.drawBloom(v, source, target, width, height);
        if (target) source = target.texture;
        padded = false;
      }
      this.timer.end();
    });
    if (layered) {
      this.timer.begin("solid");
      this.drawSolid(v, source, null, width, height, this.keptTarget(width, height).texture);
      this.timer.end();
    }
    this.trailsWereOn = active.trails;
    this.contoursWereOn = active.contours;
    this.smearWasOn = active.smear;
    this.particlesWereOn = active.particles;
    this.cyclesWereOn = active.cycles;
  }

  /**
   * Draws one group of shape steps into the bound framebuffer. With no
   * "picture", it reads the source images and draws the bordered
   * kaleidoscope texture. With a picture (the result of the steps before,
   * the size of the screen), it moves that picture, with no border.
   */
  private drawShapes(v: FrameValues, steps: ShapeStep[], picture: WebGLTexture | null, width: number, height: number, pad = 0) {
    const gl = this.gl;
    const k = this.kaleido;
    gl.useProgram(k.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[1]);
    gl.uniform1i(k.uniforms.u_img2, 1);
    gl.uniform2f(k.uniforms.u_imgRes2, this.imageSizes[1][0], this.imageSizes[1][1]);
    gl.uniform1f(k.uniforms.u_blend, Math.min(1, Math.max(0, v.imageBlend)));
    gl.uniform1i(k.uniforms.u_blendMode, v.blendMode);
    this.setTiling(v.tileRepeat);
    gl.uniform1i(k.uniforms.u_tileRepeat, v.tileRepeat ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, picture ?? this.imageTextures[0]);
    /* The picture gets smaller copies (mip levels), so a step that shrinks it does not shimmer. */
    if (picture) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.uniform1i(k.uniforms.u_img, 0);
    gl.uniform1i(k.uniforms.u_picture, picture ? 1 : 0);
    gl.uniform2f(k.uniforms.u_res, width, height);
    gl.uniform1f(k.uniforms.u_pad, picture ? 0 : pad);
    gl.uniform2f(k.uniforms.u_center, v.centerX, v.centerY);
    gl.uniform1i(k.uniforms.u_warpMode, v.warpMode);
    gl.uniform1f(k.uniforms.u_warpAmount, v.warpAmount);
    gl.uniform1f(k.uniforms.u_warpScale, v.warpScale);
    gl.uniform1f(k.uniforms.u_warpCellSize, Math.max(0.01, v.warpCellSize));
    gl.uniform1f(k.uniforms.u_warpCellAngle, v.warpCellAngle);
    gl.uniform1f(k.uniforms.u_warpCellSides, Math.min(6, Math.max(3, v.warpCellSides)));
    /* At most half a cell, so the nearest point is always in the 3 by 3 cells the shader looks at. */
    gl.uniform1f(k.uniforms.u_warpCellRandom, 0.5 * Math.min(1, Math.max(0, v.warpCellRandom)));
    gl.uniform1f(k.uniforms.u_warpMarble, v.warpMarble);
    gl.uniform1i(k.uniforms.u_warpDetail, Math.round(v.warpDetail));
    gl.uniform1f(k.uniforms.u_warpTime, v.warpTime);
    gl.uniform1i(k.uniforms.u_warpType, v.warpType);
    gl.uniform2f(k.uniforms.u_warpCenter, v.warpCenterX, v.warpCenterY);
    gl.uniform2f(k.uniforms.u_warpDir, Math.cos(v.warpAngle), Math.sin(v.warpAngle));
    gl.uniform1i(k.uniforms.u_mapMode, v.mapMode);
    gl.uniform1f(k.uniforms.u_mapMix, v.mapMix);
    gl.uniform1f(k.uniforms.u_mapScale, v.mapScale);
    gl.uniform1f(k.uniforms.u_mapPower, v.mapPower);
    gl.uniform2f(k.uniforms.u_mapPoint, v.mapPointX, v.mapPointY);
    gl.uniform1i(k.uniforms.u_mapSteps, Math.round(v.mapSteps));
    const mandelDepth = (depth: number) => {
      gl.uniform1f(k.uniforms.u_mandelDepth, depth);
      gl.uniform1i(k.uniforms.u_mandelRounds, mandelRounds(depth));
      gl.uniform1f(k.uniforms.u_mandelGrowth, v.mapMode === 9 ? this.mandelGrowth(v, depth, width / height) : 1e9);
    };
    mandelDepth(v.mandelDepth);
    if (v.mapMode === 9) {
      /* The deep zoom's exact path (see mandelPath), in slot 2; the source images use 0 and 1. */
      const path = this.mandelPath(v.mapPointX, v.mapPointY, mandelRounds(Infinity));
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, path.texture);
      gl.uniform1i(k.uniforms.u_mandelPath, 2);
      gl.uniform1i(k.uniforms.u_mandelLength, path.length);
      gl.activeTexture(gl.TEXTURE0);
    }
    gl.uniform1f(k.uniforms.u_mandelBands, v.mandelBands);
    gl.uniform1f(k.uniforms.u_mandelFlow, v.mandelFlow);
    gl.uniform1f(k.uniforms.u_mandelTerraces, v.mandelTerraces);
    gl.uniform1f(k.uniforms.u_mandelSoftness, v.mandelSoftness);
    gl.uniform1f(k.uniforms.u_mandelLight, v.mandelLight);
    gl.uniform2f(k.uniforms.u_mandelLightDir, Math.cos(v.mandelLightAngle), Math.sin(v.mandelLightAngle));
    gl.uniform1f(k.uniforms.u_mapArms, v.mapArms);
    gl.uniform1f(k.uniforms.u_spiralCopies, v.spiralCopies);
    gl.uniform1f(k.uniforms.u_drosteSize, v.drosteSize);
    gl.uniform1f(k.uniforms.u_drosteSpirals, v.drosteSpirals);
    gl.uniform1f(k.uniforms.u_drosteSoftness, v.drosteSoftness);
    gl.uniform1f(k.uniforms.u_drosteRound, v.drosteRound);
    gl.uniform1f(k.uniforms.u_drosteRotation, v.drosteRotation);
    gl.uniform1f(k.uniforms.u_drostePictureTurn, v.drostePictureTurn);
    gl.uniform1f(k.uniforms.u_mapTwist, v.mapTwist);
    gl.uniform2f(k.uniforms.u_mapAxis, Math.cos(v.mapAngle), Math.sin(v.mapAngle));
    gl.uniform1f(k.uniforms.u_mapTravel, v.mapTravel);
    gl.uniform2f(k.uniforms.u_mapPan, v.mapPanX, v.mapPanY);
    gl.uniform1f(k.uniforms.u_mapRoll, v.mapRoll);
    gl.uniform1f(k.uniforms.u_mapCurl, v.mapCurl);
    gl.uniform1f(k.uniforms.u_tunnelTwist, v.tunnelTwist);
    gl.uniform1f(k.uniforms.u_mapFog, v.mapFog);
    gl.uniform1f(k.uniforms.u_mapFogSoftness, v.mapFogSoftness);
    gl.uniform1f(k.uniforms.u_mobiusTurn, v.mobiusTurn);
    gl.uniform1f(k.uniforms.u_mobiusRotation, v.mobiusRotation);
    gl.uniform1f(k.uniforms.u_mobiusTwist, v.mobiusTwist);
    gl.uniform1f(k.uniforms.u_mobiusZoom, Math.max(0.01, v.mobiusZoom));
    gl.uniform2f(k.uniforms.u_mobiusPan, v.mobiusPanX, v.mobiusPanY);
    if (picture) gl.uniform2f(k.uniforms.u_imgRes, width, height);
    else gl.uniform2f(k.uniforms.u_imgRes, this.imageSizes[0][0], this.imageSizes[0][1]);
    /* The panel order is the order the steps act on the picture; the shader moves the screen point, which is the reverse. */
    const codes = [...steps].reverse().map((step) => SHAPE_CODES[step]);
    gl.uniform1iv(k.uniforms["u_shapeOrder[0]"], new Int32Array([...codes, 0, 0, 0].slice(0, 3)));
    gl.uniform1i(k.uniforms.u_shapeCount, codes.length);
    const opacity = (step: ShapeStep) => Math.min(1, Math.max(0, v.shapeOpacity[step]));
    gl.uniform1fv(k.uniforms["u_shapeOpacity[0]"], new Float32Array([opacity("warp"), opacity("map"), opacity("kaleidoscope")]));
    gl.uniform1iv(k.uniforms["u_shapeBlend[0]"], new Int32Array([v.layerBlend.warp, v.layerBlend.map, v.layerBlend.kaleidoscope]));
    gl.uniform1f(k.uniforms.u_segments, v.segments);
    gl.uniform1i(k.uniforms.u_foldMode, v.foldMode);
    gl.uniform1f(k.uniforms.u_tileSize, Math.max(0.01, v.tileSize));
    gl.uniform1f(k.uniforms.u_rotation, v.rotation);
    gl.uniform1f(k.uniforms.u_zoom, v.zoom);
    gl.uniform1f(k.uniforms.u_twirl, v.twirl);
    /**
     * The kaleidoscope's pan moves what it reads, so it belongs to the pass
     * that holds the kaleidoscope. With the kaleidoscope off, the pan is 0.
     */
    const panned = steps.includes("kaleidoscope");
    gl.uniform2f(k.uniforms.u_offset, panned ? v.panX : 0, panned ? v.panY : 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (v.mapMode === 9 && v.mandelFade > 0 && steps.includes("map")) {
      /**
       * The Mandelbrot dive's crossfade: the same steps again at the second
       * depth, mixed over the first by the blend's constant share (colors
       * and cover alike). It costs a second pass only while it fades.
       */
      mandelDepth(v.mandelFadeDepth);
      gl.enable(gl.BLEND);
      gl.blendColor(0, 0, 0, v.mandelFade);
      gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.BLEND);
    }
    /* The picture textures are also drawn to and read without mip levels, so they go back to plain reads. */
    if (picture) gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  /**
   * Blur, from a picture with the blur border (the kaleidoscope texture) or
   * without it (after another step). It reads smaller, softer copies of the
   * picture (mip levels), so it needs them made first. With blurring off, it
   * is a plain copy.
   */
  private drawBlur(v: FrameValues, source: WebGLTexture, padded: boolean, target: Target | null, blurring: boolean) {
    const gl = this.gl;
    const [width, height] = this.frameSize;
    const b = this.blur;
    const radius = blurring ? v.blur : 0;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    if (radius > 0) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(b.program);
    gl.uniform1i(b.uniforms.u_tex, 0);
    gl.uniform2f(b.uniforms.u_res, width, height);
    if (padded) gl.uniform2f(b.uniforms.u_texSize, this.textureSize[0], this.textureSize[1]);
    else gl.uniform2f(b.uniforms.u_texSize, width, height);
    gl.uniform1f(b.uniforms.u_pad, padded ? this.pad : 0);
    gl.uniform1f(b.uniforms.u_radius, radius);
    gl.uniform1i(b.uniforms.u_maskMode, v.blurMask);
    gl.uniform1f(b.uniforms.u_maskSize, Math.max(0.01, v.blurMaskSize));
    gl.uniform1f(b.uniforms.u_maskSoft, v.blurMaskSoft);
    gl.uniform2f(b.uniforms.u_maskCenter, v.blurMaskX, v.blurMaskY);
    gl.uniform2f(b.uniforms.u_maskDir, Math.cos(v.blurMaskAngle), Math.sin(v.blurMaskAngle));
    gl.uniform1f(b.uniforms.u_maskLevel, v.blurMaskLevel);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    /* The picture textures are also drawn to and read without mip levels, so they go back to plain reads. */
    if (radius > 0) {
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
  }

  /** Driver: a moving pattern drawn in the shader (DRIVER_SHADER) bends, reveals or lights the picture. */
  private drawDriver(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const d = this.driver;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(d.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(d.uniforms.u_tex, 0);
    gl.uniform2f(d.uniforms.u_res, width, height);
    gl.uniform1i(d.uniforms.u_source, v.driverSource);
    gl.uniform1i(d.uniforms.u_mode, v.driverMode);
    gl.uniform1f(d.uniforms.u_amount, Math.min(1, Math.max(0, v.driver)));
    gl.uniform1f(d.uniforms.u_strength, v.driverStrength);
    gl.uniform1f(d.uniforms.u_scale, Math.max(0.05, v.driverScale));
    gl.uniform1f(d.uniforms.u_contrast, v.driverContrast);
    gl.uniform1i(d.uniforms.u_video, 1);
    gl.uniform1i(d.uniforms.u_hasVideo, v.driverSource === 5 ? this.uploadDriverVideo() : 0);
    gl.uniform1f(d.uniforms.u_videoAspect, this.driverVideo && this.driverVideo.videoHeight > 0 ? this.driverVideo.videoWidth / this.driverVideo.videoHeight : 1);
    /* The shader's noise loses detail at large times, so the time wraps; a wrap shows as one small jump every few hours. */
    gl.uniform1f(d.uniforms.u_time, v.driverTime % 10000);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The Driver effect's own video, or null. The engine plays it; the renderer only reads its frames. */
  setDriverVideo(video: HTMLVideoElement | null) {
    this.driverVideo = video;
    this.driverVideoTime = -1;
  }

  /**
   * Puts the driver video's frame in its texture (on texture unit 1) when
   * the frame changed. Returns 1 when the texture holds a frame, else 0. It
   * repeats mirrored past the video's edges, for a small Size.
   */
  private uploadDriverVideo() {
    const gl = this.gl;
    const video = this.driverVideo;
    gl.activeTexture(gl.TEXTURE1);
    if (!this.driverTexture) {
      this.driverTexture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, this.driverTexture);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
    }
    gl.bindTexture(gl.TEXTURE_2D, this.driverTexture);
    let ready = 0;
    if (video && video.readyState >= 2 && video.videoWidth > 0) {
      if (video.currentTime !== this.driverVideoTime) {
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
        this.driverVideoTime = video.currentTime;
      }
      ready = 1;
    } else if (this.driverVideoTime >= 0 && video) {
      ready = 1;
    }
    gl.activeTexture(gl.TEXTURE0);
    return ready;
  }

  private drawRelief(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const r = this.relief;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(r.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(r.uniforms.u_tex, 0);
    gl.uniform2f(r.uniforms.u_texel, this.texelScale / width, this.texelScale / height);
    gl.uniform1f(r.uniforms.u_relief, v.relief);
    gl.uniform1f(r.uniforms.u_reliefDepth, v.reliefDepth);
    gl.uniform1f(r.uniforms.u_reliefSize, v.reliefSize);
    gl.uniform1f(r.uniforms.u_lightAngle, v.lightAngle);
    gl.uniform1f(r.uniforms.u_shine, v.shine);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Camera: the picture as a landscape under a virtual camera (see
   * CAMERA_SHADER), in three steps. First the height field: the picture's
   * brightness from a smaller copy (mip level Smooth), read with smooth
   * cubic curves (CAMERA_FIELD_SHADER). Then the pyramid of highest points
   * (MAX_SHADER): level 0 is the field widened by a pixel, and each next
   * level holds the highest point of squares twice as large, so the rays
   * can skip land they cannot hit. Then the view, which reads the field,
   * the pyramid, and the picture for color. The picture gets mip levels
   * here and loses them again after, because the picture textures are
   * also read without them.
   */
  private drawCamera(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

    const f = this.cameraField;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.heightTarget.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(f.program);
    gl.uniform1i(f.uniforms.u_tex, 0);
    gl.uniform1f(f.uniforms.u_smooth, Math.max(0, v.cameraSmooth));
    gl.uniform1f(f.uniforms.u_sign, v.cameraHeight < 0 ? -1 : 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const m = this.maxPass;
    const pyramid = this.maxTexture!;
    gl.useProgram(m.program);
    gl.uniform1i(m.uniforms.u_src, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.maxFramebuffer);
    for (let level = 0; level < this.maxLevels; level++) {
      const side = this.maxSide >> level;
      gl.bindTexture(gl.TEXTURE_2D, level === 0 ? this.heightTarget.texture : pyramid);
      /* Keep the sampled pyramid's base at zero. Reading and writing different
       * mips of the same texture with a changing base produced invalid bounds
       * on ANGLE/D3D11; reduce into a separate texture, then copy the result. */
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D,
        level === 0 ? pyramid : this.maxReduction, 0);
      gl.viewport(0, 0, side, side);
      gl.uniform1i(m.uniforms.u_step, level === 0 ? 1 : 2);
      gl.uniform1i(m.uniforms.u_level, Math.max(0, level - 1));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (level > 0) gl.copyTexSubImage2D(gl.TEXTURE_2D, level, 0, 0, 0, 0, side, side);
    }

    const c = this.camera;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(c.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(c.uniforms.u_tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.heightTarget.texture);
    gl.uniform1i(c.uniforms.u_fine, 1);
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, pyramid);
    gl.uniform1i(c.uniforms.u_max, 2);
    gl.uniform1i(c.uniforms.u_levels, this.maxLevels);
    /* Enough for a ray that runs along a wall of a grid picture seen straight along the grid (Turn 0°, 90°, 180°, 270°). */
    gl.uniform1i(c.uniforms.u_visits, 1024);
    gl.uniform2f(c.uniforms.u_res, width, height);
    gl.uniform1f(c.uniforms.u_amount, Math.min(1, Math.max(0, v.camera)));
    gl.uniform1i(c.uniforms.u_blend, v.cameraBlend);
    gl.uniform1i(c.uniforms.u_repeat, v.cameraRepeat);
    gl.uniform1f(c.uniforms.u_height, v.cameraHeight);
    gl.uniform1f(c.uniforms.u_tilt, v.cameraTilt);
    gl.uniform1f(c.uniforms.u_turn, v.cameraTurn);
    gl.uniform2f(c.uniforms.u_offset, v.cameraX, v.cameraY);
    gl.uniform1f(c.uniforms.u_distance, Math.max(0.1, v.cameraDistance));
    gl.uniform1f(c.uniforms.u_lens, v.cameraLens);
    gl.uniform1f(c.uniforms.u_lightTurn, v.cameraLightTurn);
    gl.uniform1f(c.uniforms.u_lightHeight, v.cameraLightHeight);
    gl.uniform1f(c.uniforms.u_shadow, Math.min(1, Math.max(0, v.cameraShadow)));
    gl.uniform1f(c.uniforms.u_fog, Math.max(0, v.cameraFog));
    gl.uniform1f(c.uniforms.u_sky, Math.min(1, Math.max(0, v.cameraSky)));
    gl.uniform3f(c.uniforms.u_skyColor, ...v.skyColor);
    gl.uniform1f(c.uniforms.u_shine, Math.max(0, v.cameraShine));
    gl.uniform1f(c.uniforms.u_smooth, Math.max(0, v.cameraSmooth));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  }

  /**
   * The pyramid of highest points: a square texture whose side is the power
   * of two at or above the picture's larger side, with fixed storage for
   * every level so the levels can be drawn to. Each level then halves
   * exactly, and its squares cover the whole picture. A new size needs a
   * new texture.
   */
  private allocateMax(width: number, height: number) {
    const gl = this.gl;
    const side = 2 ** Math.ceil(Math.log2(Math.max(2, width, height)));
    if (this.maxTexture && side === this.maxSide) return;
    if (this.maxTexture) gl.deleteTexture(this.maxTexture);
    if (this.maxReduction) gl.deleteTexture(this.maxReduction);
    this.maxSide = side;
    this.maxLevels = Math.log2(side) + 1;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, this.maxLevels, this.maxFormat, side, side);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.maxTexture = texture;
    this.maxReduction = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.maxReduction);
    gl.texStorage2D(gl.TEXTURE_2D, 1, this.maxFormat, side / 2, side / 2);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  }

  /**
   * Contour lines, in two passes. First the contour brightness: blurred
   * from smaller copies of the picture (mip levels, made here and dropped
   * after) and eased toward the last frame's brightness, which it keeps for
   * the next frame. Then the lines, drawn where that brightness crosses a level.
   */
  private drawContours(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    /* A video frame is smaller than the screen, so it blurs less in its own pixels and draws thinner lines, to look the same. */
    const smooth = Math.max(0, v.contourSmooth + Math.log2(this.texelScale));
    const previous = this.fieldTargets[this.fieldIndex];
    const next = this.fieldTargets[1 - this.fieldIndex];
    /** The first frame after contours start has no last brightness to ease from. */
    const keep = this.contoursWereOn ? Math.pow(Math.min(v.contourSteady, 0.995), v.fadeScale) : 0;

    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    if (smooth > 0) {
      gl.generateMipmap(gl.TEXTURE_2D);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    }
    const f = this.contourField;
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(f.program);
    gl.uniform1i(f.uniforms.u_tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture);
    gl.uniform1i(f.uniforms.u_previous, 1);
    gl.uniform1f(f.uniforms.u_smooth, smooth);
    gl.uniform1f(f.uniforms.u_keep, keep);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (smooth > 0) {
      gl.activeTexture(gl.TEXTURE0);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    this.fieldIndex = 1 - this.fieldIndex;

    const c = this.contours;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(c.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(c.uniforms.u_tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, next.texture);
    gl.uniform1i(c.uniforms.u_field, 1);
    gl.uniform2f(c.uniforms.u_texel, 1 / width, 1 / height);
    gl.uniform1f(c.uniforms.u_amount, v.contours);
    gl.uniform1f(c.uniforms.u_lines, v.contourLines);
    gl.uniform1f(c.uniforms.u_width, v.contourWidth * this.texelScale);
    gl.uniform3f(c.uniforms.u_color, ...v.contourColor);
    gl.uniform1i(c.uniforms.u_blend, v.contourBlend);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Time smear. The frame so far goes into the history when a slot's time
   * has passed (the slots are spaced so all of them span the delay), then
   * each pixel reads the history at its own delay.
   */
  private drawSmear(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const history = this.ensureHistory(width, height);
    const interval = v.smearDelay / (SMEAR_SLOTS - 1);
    /**
     * A restart every "smearRestart" seconds of the play clock: the kept
     * frames are forgotten, so the picture is sharp again. Over the last
     * "smearFade" seconds before it, the smear fades out.
     */
    const restart = v.smearRestart;
    const round = restart > 0 ? Math.floor(v.playClock / restart) : 0;
    let fade = 1;
    if (restart > 0 && v.smearFade > 0) fade = Math.min(1, Math.max(0, ((round + 1) * restart - v.playClock) / v.smearFade));
    if (!this.smearWasOn || round !== history.round) {
      history.filled = 0;
      history.since = 0;
      history.round = round;
    }
    history.since += v.playSeconds;
    if (history.filled === 0 || history.since >= interval) {
      history.head = (history.head + 1) % SMEAR_SLOTS;
      gl.bindFramebuffer(gl.FRAMEBUFFER, history.framebuffers[history.head]);
      gl.viewport(0, 0, history.size[0], history.size[1]);
      gl.useProgram(this.copy.program);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform1i(this.copy.uniforms.u_tex, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      history.filled = Math.min(SMEAR_SLOTS, history.filled + 1);
      history.since = 0;
    }
    const s = this.smear;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(s.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(s.uniforms.u_tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, history.texture);
    gl.uniform1i(s.uniforms.u_history, 1);
    gl.uniform2f(s.uniforms.u_res, width, height);
    gl.uniform1i(s.uniforms.u_head, history.head);
    gl.uniform1i(s.uniforms.u_filled, history.filled);
    gl.uniform1i(s.uniforms.u_slots, SMEAR_SLOTS);
    gl.uniform1f(s.uniforms.u_interval, interval);
    gl.uniform1f(s.uniforms.u_since, history.since);
    gl.uniform1f(s.uniforms.u_delay, v.smearDelay);
    gl.uniform1i(s.uniforms.u_shape, v.smearShape);
    gl.uniform1f(s.uniforms.u_angle, v.smearAngle);
    gl.uniform1f(s.uniforms.u_bands, v.smearBands);
    gl.uniform1f(s.uniforms.u_amount, v.smear * fade);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /**
   * Particles, in two steps: first PARTICLE_STEP_SHADER moves them one
   * frame on (and gives each particle that is born its place and color from
   * the picture), then the picture is copied and the particles are drawn
   * over it as soft dots (PARTICLE_VERTEX_SHADER and PARTICLE_SHADER), with
   * glow (add) or normal blending. The copy is dimmed toward black by the
   * background opacity; the particles still read the whole picture. While
   * paused, they stand still.
   */
  private drawParticles(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const states = this.ensureParticles();
    if (v.particleSeconds > 0 || !this.particlesWereOn) {
      const previous = states[this.particleIndex];
      const next = states[1 - this.particleIndex];
      const s = this.particleStep;
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer);
      gl.viewport(0, 0, PARTICLE_SIDE, PARTICLE_SIDE);
      /**
       * Only the rows that hold the particles in use move; the rows past
       * them keep their last state until the count grows into them again.
       */
      const rows = Math.min(PARTICLE_SIDE, Math.max(1, Math.ceil(v.particleCount / PARTICLE_SIDE)));
      gl.enable(gl.SCISSOR_TEST);
      gl.scissor(0, 0, PARTICLE_SIDE, rows);
      gl.useProgram(s.program);
      this.bindParticleState(s, previous);
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, source);
      gl.uniform1i(s.uniforms.u_picture, 3);
      gl.uniform1i(s.uniforms.u_reset, this.particlesWereOn ? 0 : 1);
      gl.uniform1ui(s.uniforms.u_frame, this.particleFrame);
      this.particleFrame = (this.particleFrame + 1) >>> 0;
      gl.uniform1i(s.uniforms.u_side, PARTICLE_SIDE);
      gl.uniform1f(s.uniforms.u_dt, v.particleSeconds);
      gl.uniform1f(s.uniforms.u_time, v.particleTime);
      gl.uniform1f(s.uniforms.u_aspect, width / height);
      gl.uniform1f(s.uniforms.u_level, v.particleLevel);
      gl.uniform1f(s.uniforms.u_lifeTime, Math.max(0.05, v.particleLife));
      gl.uniform1f(s.uniforms.u_speed, v.particleSpeed);
      gl.uniform2f(s.uniforms.u_gravity, Math.cos(v.particleAngle) * v.particleGravity, Math.sin(v.particleAngle) * v.particleGravity);
      gl.uniform1f(s.uniforms.u_turbulence, v.particleTurbulence);
      gl.uniform1f(s.uniforms.u_drag, Math.max(0, v.particleDrag));
      gl.uniform1f(s.uniforms.u_follow, Math.min(1, Math.max(0, v.particleFollow)));
      gl.uniform1f(s.uniforms.u_cling, Math.min(1, Math.max(0, v.particleCling)));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      gl.disable(gl.SCISSOR_TEST);
      this.particleIndex = 1 - this.particleIndex;
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(this.copy.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(this.copy.uniforms.u_tex, 0);
    /* The blend constant scales the copy's color and keeps its alpha (the picture's cover, see COVER_GLSL). */
    const background = Math.min(1, Math.max(0, v.particleBackground));
    gl.enable(gl.BLEND);
    gl.blendColor(background, background, background, 1);
    gl.blendFunc(gl.CONSTANT_COLOR, gl.ZERO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);

    const d = this.particleDraw;
    gl.useProgram(d.program);
    this.bindParticleState(d, states[this.particleIndex]);
    gl.uniform1i(d.uniforms.u_side, PARTICLE_SIDE);
    gl.uniform1f(d.uniforms.u_size, v.particleSize * height / 1080);
    gl.uniform1f(d.uniforms.u_maxSize, this.maxPointSize);
    gl.uniform1f(d.uniforms.u_opacity, Math.min(1, Math.max(0, v.particles)));
    gl.uniform1f(d.uniforms.u_gradient, Math.min(1, Math.max(0, v.particleGradient)));
    gl.uniform1f(d.uniforms.u_boost, Math.max(1, v.particleBoost));
    gl.uniform1i(d.uniforms.u_stopCount, v.particleStopAt.length);
    gl.uniform1fv(d.uniforms["u_stopAt[0]"], v.particleStopAt);
    gl.uniform3fv(d.uniforms["u_stopColor[0]"], v.particleStopColor);
    gl.bindVertexArray(this.particleVertices);
    gl.enable(gl.BLEND);
    /* Glow adds the particles' light; either way their cover goes over the picture's, so it stays at most 1 (see COVER_GLSL). */
    gl.blendFuncSeparate(gl.ONE, v.particleBlend === 0 ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.POINTS, 0, Math.round(Math.min(PARTICLE_SIDE * PARTICLE_SIDE, Math.max(0, v.particleCount))));
    gl.disable(gl.BLEND);
    gl.bindVertexArray(null);
  }

  /**
   * 3D Object: one pass of SOLID_SHADER, which draws the shape over the
   * picture. The shape's turn is a matrix from its own frame to the view:
   * first its spin about its own axis (y), then a turn about the screen's x
   * axis by Tilt plus the tumble.
   */
  /**
   * The 3D Object: the shape painted with "source", over "back" (the same
   * picture, or with Freeze background the picture kept at the 3D Object's
   * place, see render).
   */
  private drawSolid(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number, back: WebGLTexture) {
    const gl = this.gl;
    const s = this.solidProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(s.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(s.uniforms.u_tex, 0);
    gl.uniform1f(s.uniforms.u_aspect, width / height);
    gl.uniform1f(s.uniforms.u_pixel, 1 / height);
    gl.uniform1i(s.uniforms.u_shape, v.solidShape);
    gl.uniform1i(s.uniforms.u_map, v.solidMap);
    gl.uniform1i(s.uniforms.u_blend, v.solidBlend);
    gl.uniform1f(s.uniforms.u_opacity, Math.min(1, Math.max(0, v.solid)));
    gl.uniform1f(s.uniforms.u_background, Math.min(1, Math.max(0, v.solidBackground)));
    gl.uniform1f(s.uniforms.u_size, Math.max(0.01, v.solidSize));
    gl.uniform1f(s.uniforms.u_round, Math.min(1, Math.max(0, v.solidRound)));
    gl.uniform1f(s.uniforms.u_morph, v.solidMorph);
    gl.uniform1f(s.uniforms.u_blobs, v.solidBlobs);
    gl.uniform1f(s.uniforms.u_bumps, v.solidBumps);
    gl.uniform1f(s.uniforms.u_waves, Math.max(0, v.solidWaves));
    gl.uniform1f(s.uniforms.u_spikes, v.solidSpikes);
    gl.uniform1f(s.uniforms.u_spikeTip, v.solidSpikeTip);
    gl.uniform1f(s.uniforms.u_spikeCount, v.solidSpikeCount);
    gl.uniform1f(s.uniforms.u_levels, v.solidLevels);
    gl.uniform1f(s.uniforms.u_time, v.solidTime);
    const [cs, ss] = [Math.cos(v.solidSpin), Math.sin(v.solidSpin)];
    const tilt = v.solidTilt + v.solidTumble;
    const [ct, st] = [Math.cos(tilt), Math.sin(tilt)];
    /* Rows of (turn about x by tilt) times (spin about y), given by columns for GLSL. */
    const rows = [[cs, 0, ss], [st * ss, ct, -st * cs], [-ct * ss, st, ct * cs]];
    gl.uniformMatrix3fv(s.uniforms.u_turn, false, [0, 1, 2].flatMap((column) => rows.map((row) => row[column])));
    gl.uniform2f(s.uniforms.u_center, v.solidX, v.solidY);
    gl.uniform1f(s.uniforms.u_bend, Math.max(0, v.solidBend));
    gl.uniform1f(s.uniforms.u_tiles, Math.max(0.01, v.solidTiles));
    const light = [Math.cos(v.solidLight), Math.sin(v.solidLight), 1.2];
    const length = Math.hypot(...light);
    gl.uniform3f(s.uniforms.u_light, light[0] / length, light[1] / length, light[2] / length);
    gl.uniform1f(s.uniforms.u_shading, Math.min(1, Math.max(0, v.solidShading)));
    gl.uniform1f(s.uniforms.u_shine, Math.min(1, Math.max(0, v.solidShine)));
    gl.uniform1f(s.uniforms.u_shadow, Math.min(1, Math.max(0, v.solidShadow)));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, back);
    gl.uniform1i(s.uniforms.u_back, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  /**
   * The Mandelbrot map's exact path for a place (the deep zoom, see
   * docs/MANDELBROT.md): z = z^2 + c from 0, worked out here with 64-bit
   * numbers, until it escapes or for "rounds" rounds (always the most, so
   * the dive's two depths share it). The graphics card reads it from a
   * two-channel float texture, 1024 values a row, and works only with each
   * pixel's small difference from it. It is made again only when the place
   * changes.
   */
  private mandel: { texture: WebGLTexture; key: string; length: number } | null = null;

  /**
   * Growth's escape count: the points that take more rounds than this to
   * escape turn black, so only the Growth share of the escaping view shows.
   * It is read at that share of the sorted escape counts of a grid of 32 by
   * 18 points across the view (worked out here with 64-bit numbers, the
   * shader's smooth count), between two of them, and averaged over five
   * depths around the view's, 0.04 apart: points that join or leave the
   * escaping ones would make a single reading jump. So it is the same share
   * at any depth, and as the view dives or Growth moves, the black edge
   * moves smoothly: the branches seem to grow out of it or draw back into
   * it. 1e9 means none. About 1 ms a frame.
   */
  private mandelGrowth(v: FrameValues, depth: number, aspect: number) {
    if (v.mandelGrowth >= 1) return 1e9;
    let sum = 0;
    let readings = 0;
    for (let k = -2; k <= 2; k++) {
      const reading = this.mandelGrowthAt(v, depth + 0.04 * k, aspect);
      if (reading !== null) {
        sum += reading;
        readings++;
      }
    }
    return readings > 0 ? sum / readings : 1e9;
  }

  private mandelGrowthAt(v: FrameValues, depth: number, aspect: number) {
    const span = 1.5 * Math.pow(10, -Math.min(10, Math.max(0, depth)));
    const rounds = mandelRounds(depth);
    const cos = Math.cos(v.mapAngle);
    const sin = Math.sin(v.mapAngle);
    const counts: number[] = [];
    for (let row = 0; row < 18; row++) {
      for (let column = 0; column < 32; column++) {
        const px = ((column + 0.5) / 32 - 0.5) * aspect - v.mapPanX;
        const py = (row + 0.5) / 18 - 0.5 - v.mapPanY;
        const cx = v.mapPointX + (px * cos + py * sin) * span;
        const cy = v.mapPointY + (py * cos - px * sin) * span;
        let x = 0;
        let y = 0;
        for (let n = 1; n <= rounds; n++) {
          const next = x * x - y * y + cx;
          y = 2 * x * y + cy;
          x = next;
          const size = x * x + y * y;
          if (size > 65536) {
            counts.push(n - Math.log2(Math.log(Math.sqrt(size))));
            break;
          }
        }
      }
    }
    if (counts.length === 0) return null;
    counts.sort((a, b) => a - b);
    const at = Math.max(0, v.mandelGrowth) * (counts.length - 1);
    const low = counts[Math.floor(at)];
    const high = counts[Math.ceil(at)];
    return low + (high - low) * (at - Math.floor(at));
  }

  private mandelPath(cx: number, cy: number, rounds: number) {
    const key = `${cx},${cy},${rounds}`;
    if (this.mandel?.key === key) return this.mandel;
    const gl = this.gl;
    const rows = Math.ceil((rounds + 1) / MANDEL_ROW);
    const data = new Float32Array(MANDEL_ROW * rows * 2);
    let x = 0;
    let y = 0;
    let length = 0;
    for (let n = 0; n <= rounds; n++) {
      data[2 * n] = x;
      data[2 * n + 1] = y;
      length = n + 1;
      if (x * x + y * y > 4) break;
      const next = x * x - y * y + cx;
      y = 2 * x * y + cy;
      x = next;
    }
    const texture = this.mandel?.texture ?? gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, MANDEL_ROW, rows, 0, gl.RG, gl.FLOAT, data);
    gl.activeTexture(gl.TEXTURE0);
    this.mandel = { texture, key, length };
    return this.mandel;
  }

  /** Freeze background's picture behind the 3D Object (see render), made at the screen's size when first needed. */
  private kept: { target: Target; size: [number, number] } | null = null;
  private keptTarget(width: number, height: number) {
    this.kept ??= { target: this.createTarget(), size: [0, 0] };
    if (this.kept.size[0] !== width || this.kept.size[1] !== height) {
      this.allocate(this.kept.target, width, height);
      this.kept.size = [width, height];
    }
    return this.kept.target;
  }


  /**
   * Light Cycles (see cycles.ts). The cycles drive on the CPU, with a small
   * copy of the picture from a frame or two before (see readCyclePicture).
   * Their lines are drawn into cycleTarget as instances (CYCLE_SHADER), with
   * MAX blending, so joins and crossings do not get brighter. Then
   * CYCLE_MIX_SHADER puts the lines over the picture (dimmed by the
   * background opacity) with the cycles' blend mode. While paused, the
   * cycles stand still.
   */
  private drawCycles(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const sim = this.cycleSim;
    const settings: CycleSettings = {
      move: v.cyclesMove, count: v.cyclesCount, speed: v.cyclesSpeed, width: v.cyclesWidth / 1080, length: v.cyclesLength,
      turns: v.cyclesTurns, follow: v.cyclesFollow, dodge: v.cyclesDodge, grid: v.cyclesGrid,
      paint: v.cyclesPaint, repeat: v.cyclesRepeat
    };
    if (!this.cyclesWereOn) sim.reset();
    this.readCyclePicture();
    /* A frame that starts the cycles moves them a little, so they show at once, even while paused. */
    sim.step(this.cyclesWereOn ? v.cyclesSeconds : Math.max(v.cyclesSeconds, 1e-3), settings, width / height, this.cyclePicture);
    this.startCyclePicture(source, width, height);

    const head = Math.min(1, Math.max(0, v.cyclesHead));
    let capacity = this.cycleInstances.length / INSTANCE_FLOATS;
    let count = sim.writeInstances(this.cycleInstances, capacity, settings, head);
    if (count >= capacity && capacity < MAX_CYCLE_INSTANCES) {
      capacity = Math.min(MAX_CYCLE_INSTANCES, capacity * 4);
      this.cycleInstances = new Float32Array(capacity * INSTANCE_FLOATS);
      count = sim.writeInstances(this.cycleInstances, capacity, settings, head);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.cycleTarget.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (count > 0) {
      const buffer = this.ensureCycleBuffer(capacity);
      gl.bindVertexArray(buffer.vertices);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer.instances);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.cycleInstances, 0, count * INSTANCE_FLOATS);
      const d = this.cycleDraw;
      gl.useProgram(d.program);
      gl.uniform1f(d.uniforms.u_aspect, width / height);
      gl.uniform1f(d.uniforms.u_pixel, 1 / height);
      gl.uniform1i(d.uniforms.u_paint, v.cyclesPaint);
      gl.uniform1f(d.uniforms.u_gradient, Math.min(1, Math.max(0, v.cyclesGradient)));
      gl.uniform1f(d.uniforms.u_shift, v.cyclesShift);
      gl.uniform1f(d.uniforms.u_repeat, v.cyclesRepeat);
      gl.uniform2f(d.uniforms.u_direction, Math.cos(v.cyclesAngle), Math.sin(v.cyclesAngle));
      gl.uniform2f(d.uniforms.u_center, width / height * (0.5 + v.cyclesCenterX), 0.5 + v.cyclesCenterY);
      gl.uniform1i(d.uniforms.u_stopCount, v.cyclesStopAt.length);
      gl.uniform1fv(d.uniforms["u_stopAt[0]"], v.cyclesStopAt);
      gl.uniform3fv(d.uniforms["u_stopColor[0]"], v.cyclesStopColor);
      gl.enable(gl.BLEND);
      gl.blendEquation(gl.MAX);
      gl.blendFunc(gl.ONE, gl.ONE);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count);
      gl.blendEquation(gl.FUNC_ADD);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(null);
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    const m = this.cycleMix;
    gl.useProgram(m.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(m.uniforms.u_picture, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.cycleTarget.texture);
    gl.uniform1i(m.uniforms.u_lines, 1);
    gl.uniform1f(m.uniforms.u_background, Math.min(1, Math.max(0, v.cyclesBackground)));
    gl.uniform1f(m.uniforms.u_opacity, Math.min(1, Math.max(0, v.cycles)));
    gl.uniform1i(m.uniforms.u_blend, v.cyclesBlend);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.activeTexture(gl.TEXTURE0);
  }

  /** The vertex array for the line instances: a quad's four corners, and the instance buffer, made at least "capacity" instances big. */
  private ensureCycleBuffer(capacity: number) {
    const gl = this.gl;
    if (this.cycleBuffer && this.cycleBuffer.capacity >= capacity) return this.cycleBuffer;
    if (this.cycleBuffer) {
      gl.bindBuffer(gl.ARRAY_BUFFER, this.cycleBuffer.instances);
      gl.bufferData(gl.ARRAY_BUFFER, capacity * INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW);
      this.cycleBuffer.capacity = capacity;
      return this.cycleBuffer;
    }
    const vertices = gl.createVertexArray()!;
    gl.bindVertexArray(vertices);
    const corners = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, corners);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    const instances = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, instances);
    gl.bufferData(gl.ARRAY_BUFFER, capacity * INSTANCE_FLOATS * 4, gl.DYNAMIC_DRAW);
    const stride = INSTANCE_FLOATS * 4;
    ([[1, 4, 0], [2, 4, 16], [3, 4, 32], [4, 4, 48]] as const).forEach(([location, size, offset]) => {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
      gl.vertexAttribDivisor(location, 1);
    });
    gl.bindVertexArray(null);
    this.cycleBuffer = { vertices, instances, capacity };
    return this.cycleBuffer;
  }

  /**
   * Starts a copy of the picture into the small texture and on into memory,
   * without waiting for the GPU (see readCyclePicture). Only one copy is on
   * its way at a time.
   */
  private startCyclePicture(source: WebGLTexture, width: number, height: number) {
    const gl = this.gl;
    const size: [number, number] = [CYCLE_PICTURE_WIDTH, Math.max(1, Math.round(CYCLE_PICTURE_WIDTH * height / width))];
    if (this.cycleRead?.fence) return;
    if (!this.cycleRead || this.cycleRead.size[0] !== size[0] || this.cycleRead.size[1] !== size[1]) {
      if (this.cycleRead) {
        gl.deleteTexture(this.cycleRead.texture);
        gl.deleteFramebuffer(this.cycleRead.framebuffer);
        gl.deleteBuffer(this.cycleRead.buffer);
      }
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, size[0], size[1]);
      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      const buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, size[0] * size[1] * 4, gl.STREAM_READ);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      this.cycleRead = { texture, framebuffer, buffer, size, fence: null };
      this.cyclePicture = null;
    }
    const read = this.cycleRead;
    gl.bindFramebuffer(gl.FRAMEBUFFER, read.framebuffer);
    gl.viewport(0, 0, size[0], size[1]);
    const c = this.cycleSample;
    gl.useProgram(c.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(c.uniforms.u_tex, 0);
    gl.uniform2f(c.uniforms.u_step, 1 / size[0], 1 / size[1]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, read.buffer);
    gl.readPixels(0, 0, size[0], size[1], gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    read.fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  }

  /** Takes the small copy of the picture into memory when the GPU has finished it (see startCyclePicture). */
  private readCyclePicture() {
    const gl = this.gl;
    const read = this.cycleRead;
    if (!read?.fence) return;
    const status = gl.clientWaitSync(read.fence, 0, 0);
    if (status !== gl.ALREADY_SIGNALED && status !== gl.CONDITION_SATISFIED) return;
    gl.deleteSync(read.fence);
    read.fence = null;
    const [width, height] = read.size;
    if (!this.cyclePicture || this.cyclePicture.data.length !== width * height * 4) this.cyclePicture = { width, height, data: new Uint8Array(width * height * 4) };
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, read.buffer);
    gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, this.cyclePicture.data);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
  }

  /**
   * Pixel sort. The picture is turned so the sort lines are the rows of a
   * square buffer (SORT_TURN_SHADER). Its side is the power of two nearest
   * the screen's diagonal, at most 2048, so the bitonic sort works and the
   * half-float column numbers stay exact. Then each pixel finds the start
   * of its run (SORT_START_SHADER, then log2(side) passes of
   * SORT_JUMP_SHADER), takes it as its key (SORT_PACK_SHADER), and the rows
   * are sorted by key and brightness in log2(side) * (log2(side) + 1) / 2
   * passes (SORT_STEP_SHADER): 66 at 2048. Last, the buffer is turned back
   * and mixed over the picture (SORT_SHADER). With thick lines, only the
   * first rows of the buffer are used, one for each line.
   */
  private drawSort(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const p = this.sortPrograms;
    const diagonal = Math.hypot(width, height);
    const side = Math.min(2048, 2 ** Math.round(Math.log2(diagonal)));
    const [turned, first, second] = this.ensureSortTargets(side);
    const direction: [number, number] = [Math.cos(v.sortAngle), Math.sin(v.sortAngle)];
    const band = Math.max(1, v.sortThickness * height / 1080);
    const rows = Math.max(1, Math.min(side, Math.round(diagonal / band)));
    const low = Math.min(v.sortLow, v.sortHigh);
    const high = Math.max(v.sortLow, v.sortHigh);
    const run = (program: Program, to: Target | null, textures: [string, WebGLTexture][], uniforms: () => void = () => {}) => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, to ? to.framebuffer : null);
      gl.useProgram(program.program);
      textures.forEach(([name, texture], unit) => {
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(program.uniforms[name], unit);
      });
      uniforms();
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    };

    gl.viewport(0, 0, side, rows);
    run(p.turn, turned, [["u_tex", source]], () => {
      gl.uniform2f(p.turn.uniforms.u_res, width, height);
      gl.uniform1f(p.turn.uniforms.u_diag, diagonal);
      gl.uniform2f(p.turn.uniforms.u_dir, ...direction);
      gl.uniform1f(p.turn.uniforms.u_band, diagonal / rows);
    });
    run(p.start, first, [["u_tex", turned.texture]], () => {
      gl.uniform1f(p.start.uniforms.u_low, low);
      gl.uniform1f(p.start.uniforms.u_high, high);
      gl.uniform1f(p.start.uniforms.u_length, v.sortLength >= 1 ? 1e6 : Math.max(2, v.sortLength * side));
    });
    let links = first;
    let spare = second;
    for (let reach = 1; reach < side; reach *= 2) {
      run(p.jump, spare, [["u_tex", links.texture]]);
      [links, spare] = [spare, links];
    }
    run(p.pack, spare, [["u_tex", turned.texture], ["u_start", links.texture]]);
    let sorted = spare;
    let free = turned;
    gl.useProgram(p.step.program);
    gl.uniform1f(p.step.uniforms.u_sign, v.sortOrder === 1 ? -1 : 1);
    for (let k = 2; k <= side; k *= 2) {
      for (let j = k / 2; j >= 1; j /= 2) {
        run(p.step, free, [["u_tex", sorted.texture]], () => {
          gl.uniform1i(p.step.uniforms.u_k, k);
          gl.uniform1i(p.step.uniforms.u_j, j);
        });
        [sorted, free] = [free, sorted];
      }
    }

    gl.viewport(0, 0, width, height);
    run(p.show, target, [["u_sorted", sorted.texture], ["u_links", links.texture], ["u_picture", source]], () => {
      gl.uniform2f(p.show.uniforms.u_res, width, height);
      gl.uniform1f(p.show.uniforms.u_diag, diagonal);
      gl.uniform2f(p.show.uniforms.u_dir, ...direction);
      gl.uniform1f(p.show.uniforms.u_amount, Math.min(1, Math.max(0, v.sort)));
      gl.uniform1f(p.show.uniforms.u_rows, rows);
      gl.uniform1f(p.show.uniforms.u_side, side);
      gl.uniform1f(p.show.uniforms.u_band, band);
      gl.uniform1f(p.show.uniforms.u_low, low);
      gl.uniform1f(p.show.uniforms.u_high, high);
    });
  }

  /** The pixel sort's three square pictures at "side" pixels; a new side makes them again. */
  private ensureSortTargets(side: number) {
    if (this.sortTargets && this.sortSide === side) return this.sortTargets;
    this.sortTargets ??= [this.createTarget(), this.createTarget(), this.createTarget()];
    for (const target of this.sortTargets) this.allocate(target, side, side);
    this.sortSide = side;
    return this.sortTargets;
  }

  /**
   * Light rays, at half size: the bright parts of the picture (the bloom's
   * BLOOM_BRIGHT_SHADER), then four ray passes (RAYS_SHADER) of 1/512,
   * 1/64, 1/8 and all of the length. Each pass covers more than one step of the
   * next one, so together they smear each bright pixel smoothly along its
   * ray, with no beads, then the picture plus the rays (RAYS_MIX_SHADER).
   */
  private drawRays(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const [first, second] = this.raysTargets;
    const half: [number, number] = [Math.max(1, width >> 1), Math.max(1, height >> 1)];
    const b = this.bloomBright;
    gl.bindFramebuffer(gl.FRAMEBUFFER, first.framebuffer);
    gl.viewport(0, 0, ...half);
    gl.useProgram(b.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(b.uniforms.u_tex, 0);
    gl.uniform1f(b.uniforms.u_threshold, v.raysThreshold);
    gl.uniform1f(b.uniforms.u_softness, 0.2);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    const r = this.rays;
    gl.useProgram(r.program);
    gl.uniform1i(r.uniforms.u_tex, 0);
    gl.uniform2f(r.uniforms.u_center, 0.5 + v.raysX, 0.5 + v.raysY);
    /* The fade is per whole way to the center: at Fade 1, a ray's far end counts about 2% as much as its start. */
    gl.uniform1f(r.uniforms.u_fade, 4 * Math.max(0, v.raysFade));
    const length = Math.min(1, Math.max(0, v.raysLength));
    const passes = [length / 512, length / 64, length / 8, length];
    passes.forEach((span, index) => {
      const [from, to] = index % 2 === 0 ? [first, second] : [second, first];
      gl.bindFramebuffer(gl.FRAMEBUFFER, to.framebuffer);
      gl.bindTexture(gl.TEXTURE_2D, from.texture);
      gl.uniform1f(r.uniforms.u_span, span);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    });
    const rays = passes.length % 2 === 1 ? second : first;

    const m = this.raysMix;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(m.program);
    gl.bindTexture(gl.TEXTURE_2D, rays.texture);
    gl.uniform1i(m.uniforms.u_tex, 0);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(m.uniforms.u_picture, 1);
    gl.uniform1f(m.uniforms.u_amount, Math.max(0, v.rays));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** The size of bloom level "index": half the canvas for level 0, and half again for each next level. */
  private bloomSize(index: number, width: number, height: number): [number, number] {
    return [Math.max(1, width >> (index + 1)), Math.max(1, height >> (index + 1))];
  }

  /**
   * Bloom: the bright parts of the picture (BLOOM_BRIGHT_SHADER), then
   * levels of half, quarter, eighth size and so on, each a soft copy of the
   * one before (BLOOM_DOWN_SHADER). Then, from the smallest level up, each
   * level adds the next smaller one, enlarged (BLOOM_UP_SHADER), and the
   * picture adds the first level (BLOOM_SHADER). Size 1 uses 3 levels at
   * 1080p, and each step adds a level twice as large; the last level counts
   * by the part of the size past the level before. The count moves with
   * the picture height, so the glow covers the same part of the screen at
   * any size.
   */
  private drawBloom(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const size = Math.max(1, v.bloomSize + 2 + Math.log2(height / 1080));
    const count = Math.min(this.bloomLevels, Math.ceil(size));
    const lastWeight = count < Math.ceil(size) ? 1 : size - (count - 1);
    /* The first, half-size level reads the picture and keeps only its bright parts (see BLOOM_DOWN_SHADER). */
    const d = this.bloomDown;
    gl.useProgram(d.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.uniform1i(d.uniforms.u_tex, 0);
    gl.uniform1f(d.uniforms.u_softness, v.bloomSoftness);
    let input = source;
    let inputSize: [number, number] = [width, height];
    for (let index = 0; index < count; index++) {
      const levelSize = this.bloomSize(index, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomChain[index].framebuffer);
      gl.viewport(0, 0, ...levelSize);
      gl.bindTexture(gl.TEXTURE_2D, input);
      gl.uniform2f(d.uniforms.u_texel, 1 / inputSize[0], 1 / inputSize[1]);
      gl.uniform1f(d.uniforms.u_threshold, index === 0 ? v.bloomThreshold : -1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      input = this.bloomChain[index].texture;
      inputSize = levelSize;
    }

    const u = this.bloomUp;
    gl.useProgram(u.program);
    gl.uniform1i(u.uniforms.u_tex, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let index = count - 2; index >= 0; index--) {
      const smaller = this.bloomSize(index + 1, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomChain[index].framebuffer);
      gl.viewport(0, 0, ...this.bloomSize(index, width, height));
      gl.bindTexture(gl.TEXTURE_2D, this.bloomChain[index + 1].texture);
      gl.uniform2f(u.uniforms.u_texel, 1 / smaller[0], 1 / smaller[1]);
      gl.uniform1f(u.uniforms.u_weight, index + 1 === count - 1 ? lastWeight : 1);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);

    const m = this.bloomMix;
    const first = this.bloomSize(0, width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(m.program);
    gl.bindTexture(gl.TEXTURE_2D, this.bloomChain[0].texture);
    gl.uniform1i(m.uniforms.u_tex, 0);
    gl.uniform2f(m.uniforms.u_texel, 1 / first[0], 1 / first[1]);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(m.uniforms.u_picture, 1);
    /* With one level only, its weight scales the whole glow. */
    gl.uniform1f(m.uniforms.u_amount, Math.max(0, v.bloom) * (count === 1 ? lastWeight : 1));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Binds one copy of the particle state to texture units 0, 1 and 2 of the program. */
  private bindParticleState(program: Program, state: ParticleState) {
    const gl = this.gl;
    ["u_motion", "u_life", "u_color"].forEach((name, index) => {
      gl.activeTexture(gl.TEXTURE0 + index);
      gl.bindTexture(gl.TEXTURE_2D, state.textures[index]);
      gl.uniform1i(program.uniforms[name], index);
    });
  }

  /** The two copies of the particle state: three 32-bit float textures each, drawn to together. */
  private ensureParticles() {
    if (this.particleStates) return this.particleStates;
    const gl = this.gl;
    const make = (): ParticleState => {
      const textures = [0, 1, 2].map(() => {
        const texture = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, PARTICLE_SIDE, PARTICLE_SIDE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        return texture;
      }) as ParticleState["textures"];
      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      textures.forEach((texture, index) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + index, gl.TEXTURE_2D, texture, 0));
      gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1, gl.COLOR_ATTACHMENT2]);
      return { framebuffer, textures };
    };
    this.particleStates = [make(), make()];
    this.particlesWereOn = false;
    return this.particleStates;
  }

  /** The time smear's history at the size for this canvas; a new canvas size starts it empty. */
  private ensureHistory(width: number, height: number) {
    const gl = this.gl;
    const scale = Math.min(1, Math.sqrt(SMEAR_MEMORY / (SMEAR_SLOTS * width * height * 4)));
    const size: [number, number] = [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
    if (this.history && this.history.size[0] === size[0] && this.history.size[1] === size[1]) return this.history;
    if (this.history) {
      gl.deleteTexture(this.history.texture);
      for (const framebuffer of this.history.framebuffers) gl.deleteFramebuffer(framebuffer);
    }
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D_ARRAY, texture);
    gl.texStorage3D(gl.TEXTURE_2D_ARRAY, 1, gl.RGBA8, size[0], size[1], SMEAR_SLOTS);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const framebuffers = Array.from({ length: SMEAR_SLOTS }, (_, layer) => {
      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, texture, 0, layer);
      return framebuffer;
    });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    this.history = { texture, framebuffers, size, head: 0, filled: 0, since: 0, round: 0 };
    return this.history;
  }

  /** Video export: the overlay pass, the title box texture, and the frame reader (made when first used). */
  private overlayProgram: Program | null = null;
  private overlayTexture: WebGLTexture | null = null;
  private reader: { framebuffer: WebGLFramebuffer; texture: WebGLTexture; size: [number, number]; free: WebGLBuffer[] } | null = null;

  /** Video export: a copy of the picture now on the canvas, as a texture. Free it with releaseFrame. */
  captureFrame(): WebGLTexture {
    const gl = this.gl;
    const [width, height] = this.frameSize;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const framebuffer = gl.createFramebuffer()!;
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, framebuffer);
    gl.framebufferTexture2D(gl.DRAW_FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteFramebuffer(framebuffer);
    return texture;
  }

  releaseFrame(texture: WebGLTexture) {
    this.gl.deleteTexture(texture);
  }

  /** Video export: sets the title box (a canvas the size of the frame), or removes it. */
  setOverlay(source: HTMLCanvasElement | null) {
    const gl = this.gl;
    if (this.overlayTexture) gl.deleteTexture(this.overlayTexture);
    this.overlayTexture = null;
    if (!source) return;
    const texture = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.overlayTexture = texture;
  }

  /** Video export: draws a captured frame (see captureFrame) over the canvas at "alpha". */
  drawFrameOver(texture: WebGLTexture, alpha: number) {
    this.drawOver(texture, alpha, true);
  }

  /** Video export: draws the title box over the canvas at "alpha". */
  drawOverlay(alpha: number) {
    if (this.overlayTexture) this.drawOver(this.overlayTexture, alpha, false);
  }

  private drawOver(texture: WebGLTexture, alpha: number, opaque: boolean) {
    const gl = this.gl;
    this.overlayProgram ??= this.createProgram(OVERLAY_SHADER);
    const o = this.overlayProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.frameSize[0], this.frameSize[1]);
    gl.useProgram(o.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(o.uniforms.u_tex, 0);
    gl.uniform1f(o.uniforms.u_alpha, alpha);
    gl.uniform1i(o.uniforms.u_opaque, opaque ? 1 : 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.disable(gl.BLEND);
  }

  /**
   * Video export: starts copying the picture now on the canvas into memory,
   * without waiting for the GPU. The copy is turned upright on the GPU, then
   * read into a buffer in the background. The returned function waits until
   * the copy is done and writes the pixels (RGBA, top row first) into "into".
   */
  startRead(): (into: Uint8Array) => Promise<void> {
    const gl = this.gl;
    const [width, height] = this.frameSize;
    if (!this.reader || this.reader.size[0] !== width || this.reader.size[1] !== height) {
      if (this.reader) {
        gl.deleteFramebuffer(this.reader.framebuffer);
        gl.deleteTexture(this.reader.texture);
        for (const buffer of this.reader.free) gl.deleteBuffer(buffer);
      }
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA8, width, height);
      const framebuffer = gl.createFramebuffer()!;
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      this.reader = { framebuffer, texture, size: [width, height], free: [] };
    }
    const reader = this.reader;
    /* The canvas has its first row at the bottom; the copy flips it, so the read gives the top row first. */
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, reader.framebuffer);
    gl.blitFramebuffer(0, 0, width, height, 0, height, width, 0, gl.COLOR_BUFFER_BIT, gl.NEAREST);
    let buffer = reader.free.pop();
    if (!buffer) {
      buffer = gl.createBuffer()!;
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
      gl.bufferData(gl.PIXEL_PACK_BUFFER, width * height * 4, gl.STREAM_READ);
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, reader.framebuffer);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, buffer);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, 0);
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)!;
    gl.flush();
    const pixels = buffer;
    return async (into: Uint8Array) => {
      for (;;) {
        const status = gl.clientWaitSync(fence, 0, 0);
        if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
        if (status === gl.WAIT_FAILED) throw new Error("The GPU could not read the video frame.");
        await new Promise((resolve) => setTimeout(resolve, 1));
      }
      gl.deleteSync(fence);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, pixels);
      gl.getBufferSubData(gl.PIXEL_PACK_BUFFER, 0, into);
      gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
      reader.free.push(pixels);
    };
  }

  /** Drops the old trail frames, so the next frame starts the trails again. */
  resetTrails() {
    this.contoursWereOn = false;
    this.smearWasOn = false;
    this.particlesWereOn = false;
    this.cyclesWereOn = false;
    this.trailsWereOn = false;
  }

  /** Gives the GPU context back at once, so a short-lived renderer does not wait for garbage collection. */
  dispose() {
    this.disposed = true;
    this.stopVideo(0);
    this.stopVideo(1);
    this.gl.getExtension("WEBGL_lose_context")?.loseContext();
  }

  /** True after dispose: the context is lost on purpose. */
  private disposed = false;

  /**
   * Sharpen, Color and Levels: one pass of FINISH_SHADER with the settings
   * of the parts in "parts" (one, or several that are next to each other in
   * the list, see render). With its settings at 0, a part of the shader
   * leaves the picture as it is.
   */
  private drawFinish(v: FrameValues, parts: readonly FinishPart[], source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const f = this.finish;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(f.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(f.uniforms.u_tex, 0);
    gl.uniform2f(f.uniforms.u_texel, this.texelScale / width, this.texelScale / height);
    gl.uniform1f(f.uniforms.u_sharpen, parts.includes("sharpen") ? v.sharpen : 0);
    gl.uniform1f(f.uniforms.u_radius, v.sharpenRadius);
    gl.uniform1f(f.uniforms.u_exposure, parts.includes("levels") ? v.exposure : 0);
    gl.uniform1f(f.uniforms.u_black, parts.includes("levels") ? v.blackLevel : 0);
    gl.uniform3f(f.uniforms.u_overlay, ...v.overlayColor);
    gl.uniform1f(f.uniforms.u_overlayOpacity, parts.includes("color") ? v.overlayOpacity : 0);
    gl.uniform1i(f.uniforms.u_overlayBlend, v.colorBlend);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Copies a picture onto the screen, or into "target" (at the size the viewport is set to). */
  private drawCopy(source: WebGLTexture, target: Target | null = null) {
    const gl = this.gl;
    const c = this.copy;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.useProgram(c.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(c.uniforms.u_tex, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /** Combines the blurred frame with the previous output, and returns the texture that holds the result. */
  private drawTrails(v: FrameValues, input: WebGLTexture, width: number, height: number): WebGLTexture {
    const gl = this.gl;
    const previous = this.trailTargets[this.trailIndex];
    const next = this.trailTargets[1 - this.trailIndex];
    /** The first frame after trails start has no previous frame, so it is the new frame alone. */
    const fresh = !this.trailsWereOn;
    const scale = v.frameScale;

    const t = this.trails;
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer);
    gl.viewport(0, 0, width, height);
    gl.useProgram(t.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, input);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, previous.texture);
    gl.uniform1i(t.uniforms.u_current, 0);
    gl.uniform1i(t.uniforms.u_previous, 1);
    gl.uniform2f(t.uniforms.u_res, width, height);
    gl.uniform1i(t.uniforms.u_mode, v.trailMode);
    gl.uniform1f(t.uniforms.u_amount, fresh ? 0 : Math.pow(v.trailAmount, v.fadeScale));
    gl.uniform1f(t.uniforms.u_zoom, Math.pow(v.trailZoom, scale));
    gl.uniform1f(t.uniforms.u_turn, v.trailTurn * scale);
    gl.uniform1f(t.uniforms.u_hue, v.trailHue * scale);
    gl.uniform2f(t.uniforms.u_texel, this.texelScale / width, this.texelScale / height);
    const flowing = !fresh && v.trailFlow * scale !== 0;
    gl.uniform1f(t.uniforms.u_flow, flowing ? v.trailFlow * scale : 0);
    gl.uniform1f(t.uniforms.u_lodShift, Math.log2(this.texelScale));
    gl.uniform1f(t.uniforms.u_swirl, v.trailSwirl);
    /* The tint adds up frame after frame, so it is scaled to the real frame time like the fade. */
    gl.uniform1f(t.uniforms.u_tint, fresh ? 0 : Math.min(1, v.trailTint * 0.1 * v.fadeScale));
    gl.uniform3f(t.uniforms.u_tintColor, ...v.trailColor);
    /**
     * The flow measures slopes on blurred copies of the old frame (mip
     * levels), made fresh each frame. The old frame uses them only for this
     * pass; afterwards it reads its full-size picture again.
     */
    if (flowing) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
      gl.generateMipmap(gl.TEXTURE_2D);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (flowing) {
      gl.activeTexture(gl.TEXTURE1);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    }
    this.trailIndex = 1 - this.trailIndex;
    return next.texture;
  }

  /** Sizes the trail textures to the canvas. A new size starts the trails again. */
  private ensureTrailTargets(width: number, height: number) {
    if (width === this.trailSize[0] && height === this.trailSize[1]) return;
    this.trailSize = [width, height];
    for (const target of [this.current, this.scratch, ...this.trailTargets, ...this.fieldTargets, this.heightTarget, this.cycleTarget]) this.allocate(target, width, height);
    for (const target of this.raysTargets) this.allocate(target, Math.max(1, width >> 1), Math.max(1, height >> 1));
    this.bloomLevels = Math.max(1, Math.floor(Math.log2(Math.min(width, height))) - 3);
    while (this.bloomChain.length < this.bloomLevels) this.bloomChain.push(this.createTarget());
    this.bloomChain.slice(0, this.bloomLevels).forEach((target, index) => this.allocate(target, ...this.bloomSize(index, width, height)));
    this.allocateMax(width, height);
    this.contoursWereOn = false;
    this.trailsWereOn = false;
  }

  private createTarget(): Target {
    const gl = this.gl;
    const texture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return { texture, framebuffer: gl.createFramebuffer()! };
  }

  private allocate(target: Target, width: number, height: number) {
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, target.texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, this.trailFormat.internal, width, height, 0, gl.RGBA, this.trailFormat.type, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0);
  }

  /** Matches the canvas to the displayed size (or the fixed size). A new size also resets the border. */
  private resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const [width, height] = this.size ?? [Math.round(this.canvas.clientWidth * dpr), Math.round(this.canvas.clientHeight * dpr)];
    if (width === this.frameSize[0] && height === this.frameSize[1]) return;
    this.frameSize = [width, height];
    this.pad = -1;
    if (width === 0 || height === 0) return;
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /**
   * Makes the offscreen texture's border at least "reach" pixels wide. The
   * border grows in 64-pixel steps and never shrinks, so a drifting blur does
   * not make a new texture every frame.
   */
  private ensurePad(reach: number) {
    const gl = this.gl;
    const [width, height] = this.frameSize;
    const maxPad = Math.max(0, Math.floor((this.maxTextureSize - Math.max(width, height)) / 2));
    const needed = Math.min(maxPad, Math.ceil((reach + 2) / 64) * 64);
    if (needed <= this.pad) return;
    this.pad = needed;
    this.textureSize = [width + needed * 2, height + needed * 2];
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.textureSize[0], this.textureSize[1], 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.frameTexture, 0);
  }

  private compile(type: number, source: string) {
    const gl = this.gl;
    const shader = gl.createShader(type)!;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? "Shader error");
    return shader;
  }

  private createProgram(fragmentSource: string, vertexSource = VERTEX_SHADER): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, vertexSource));
    gl.attachShader(program, this.compile(gl.FRAGMENT_SHADER, fragmentSource));
    gl.bindAttribLocation(program, 0, "a_pos");
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? "Shader link error");
    const uniforms: Record<string, WebGLUniformLocation> = {};
    const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) as number;
    for (let index = 0; index < count; index++) {
      const name = gl.getActiveUniform(program, index)!.name;
      uniforms[name] = gl.getUniformLocation(program, name)!;
    }
    return { program, uniforms };
  }
}
