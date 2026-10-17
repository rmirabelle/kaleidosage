import { GpuTimer } from "./gpuTimer";
import { BLUR_SHADER, CAMERA_FIELD_SHADER, CAMERA_SHADER, CONTOUR_FIELD_SHADER, CONTOUR_SHADER, COPY_SHADER, FINISH_SHADER, KALEIDO_SHADER, MAX_SHADER, OVERLAY_SHADER, RELIEF_SHADER, SMEAR_SHADER, TRAILS_SHADER, VERTEX_SHADER } from "./shaders";

/** The blur mask: circle with a sharp or a blurred center, gradient, bright areas, dark areas, noise. */
export type BlurMask = 0 | 1 | 2 | 3 | 4 | 5;
/** 0 = no trails, 1 = mix, 2 = lighten. */
export type TrailMode = 0 | 1 | 2;
/** 0 = none, 1 = power, 2 = Mobius, 3 = Julia, 4 = log spiral, 5 = sine, 6 = tunnel. */
export type MapMode = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** 0 = no warp, 1 = warp the screen (breaks the symmetry), 2 = warp the image (keeps it). */
export type WarpMode = 0 | 1 | 2;
/** 0 = radial wedges around one center, 1 = triangle tiles, 2 = hexagon tiles. */
export type FoldMode = 0 | 1 | 2;
/** The steps that move pixels around, before anything is drawn. The user sets their order. */
export type ShapeStep = "warp" | "map" | "kaleidoscope";

/** The kind of warp: noise, ripple, waves, swirl, bulge and pinch, cells. */
export type WarpType = 0 | 1 | 2 | 3 | 4 | 5;
/** The steps that change the drawn picture. The user sets their order. */
export type PictureStep = "blur" | "trails" | "smear" | "contours" | "relief" | "camera" | "finish";
/**
 * Any effect step. The user sets one order for all of them. Shape steps
 * that are next to each other run in one pass; a shape step after a
 * picture step moves the picture made so far, not the source images.
 */
export type FxStep = ShapeStep | PictureStep;
export const SHAPE_STEPS: readonly ShapeStep[] = ["warp", "map", "kaleidoscope"];
export const PICTURE_STEPS: readonly PictureStep[] = ["blur", "trails", "smear", "contours", "relief", "camera", "finish"];
export const isShapeStep = (step: FxStep): step is ShapeStep => (SHAPE_STEPS as readonly FxStep[]).includes(step);
/** The time smear's pattern: 0 linear, 1 rings, 2 sweep, 3 brightness, 4 noise (see SMEAR_SHADER). */
export type SmearShape = 0 | 1 | 2 | 3 | 4;

const SHAPE_CODES: Record<ShapeStep, number> = { warp: 0, map: 1, kaleidoscope: 2 };
/** 0 normal, 1 screen, 2 multiply, 3 overlay, 4 difference, 5 lighten, 6 darken, 7 add. */
export type LayerBlend = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;
/** How the camera's land goes on past the picture: 0 mirrored, 1 repeated as it is, 2 not at all (sky around the picture). */
export type CameraRepeat = 0 | 1 | 2;
/** How the two images fade: 0 = crossfade, 1 = dissolve by brightness (light areas change first). */
export type BlendMode = 0 | 1;

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
  warpMarble: number;
  warpDetail: number;
  /** How far the warp noise has flowed. */
  warpTime: number;
  mapMode: MapMode;
  mapMix: number;
  mapScale: number;
  mapPower: number;
  mapPointX: number;
  mapPointY: number;
  mapSteps: number;
  /** Seamless spiral: the twist (negative turns the other way; 0 gives rings), and the whole number of image copies one turn holds. */
  mapArms: number;
  spiralCopies: number;
  mapTwist: number;
  /** The angle (radians) of the axis that power, log spiral and tunnel fold over. */
  mapAngle: number;
  /** Tunnel only: how far the wall turns per tube length, in radians. */
  tunnelTwist: number;
  /** How far the view has flown into the tunnel. */
  mapTravel: number;
  /** How much the far end of the tunnel fades to black. */
  mapFog: number;
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
  private readonly kaleido: Program;
  private readonly blur: Program;
  /** The first and the second image. */
  private readonly imageTextures: [WebGLTexture, WebGLTexture];
  private readonly frameTexture: WebGLTexture;
  private readonly framebuffer: WebGLFramebuffer;
  private readonly trails: Program;
  private readonly copy: Program;
  private readonly finish: Program;
  private readonly relief: Program;
  private readonly camera: Program;
  private readonly cameraField: Program;
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
    this.camera = this.createProgram(CAMERA_SHADER);
    this.cameraField = this.createProgram(CAMERA_FIELD_SHADER);
    this.maxPass = this.createProgram(MAX_SHADER);
    this.contours = this.createProgram(CONTOUR_SHADER);
    this.contourField = this.createProgram(CONTOUR_FIELD_SHADER);
    this.smear = this.createProgram(SMEAR_SHADER);

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
    this.frameTexture = gl.createTexture()!;
    gl.bindTexture(gl.TEXTURE_2D, this.frameTexture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.framebuffer = gl.createFramebuffer()!;

    this.trailFormat = gl.getExtension("EXT_color_buffer_float")
      ? { internal: gl.RGBA16F, type: gl.HALF_FLOAT }
      : { internal: gl.RGBA8, type: gl.UNSIGNED_BYTE };
    this.current = this.createTarget();
    this.scratch = this.createTarget();
    this.trailTargets = [this.createTarget(), this.createTarget()];
    this.fieldTargets = [this.createTarget(), this.createTarget()];
    this.heightTarget = this.createTarget();
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

  /** Uploads the newest frame of each video. Called once per frame, before drawing. "force" uploads the current frame even when no new frame was reported (after a seek). */
  updateVideos(force = false) {
    const now = performance.now();
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
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(v: FrameValues) {
    const gl = this.gl;
    this.resizeCanvas();
    this.timer.collect();
    const [width, height] = this.frameSize;
    if (width === 0 || height === 0) return;

    /* The blur reads up to about its radius past each pixel, so the kaleidoscope picture gets a border that wide. */
    this.ensurePad(v.blur * height);
    const [textureWidth, textureHeight] = this.textureSize;

    /** The picture steps that do something. A shape step that is off does nothing either. */
    const active: Record<FxStep, boolean> = {
      ...v.shapeActive,
      blur: v.blur > 0,
      trails: v.trailMode !== 0,
      smear: v.smear > 0,
      contours: v.contours > 0,
      relief: v.relief > 0,
      /* The camera's view always shows while it is on: at opacity 0 it is the flat floor, seen by the camera. */
      camera: v.cameraOn,
      finish: v.sharpen > 0 || v.exposure !== 0 || v.blackLevel > 0 || v.overlayOpacity > 0
    };
    /**
     * The steps in the user's order, with shape steps that are next to each
     * other (once the steps that do nothing are left out) joined into one
     * pass. The shape steps before the first picture step read the source
     * images; a later group of shape steps reads the picture made so far.
     */
    const passes: (PictureStep | ShapeStep[])[] = [];
    for (const step of v.fxOrder.filter((candidate) => active[candidate])) {
      const previous = passes[passes.length - 1];
      if (!isShapeStep(step)) passes.push(step);
      else if (Array.isArray(previous)) previous.push(step);
      else passes.push([step]);
    }
    const first = Array.isArray(passes[0]) ? passes.shift() as ShapeStep[] : [];

    const opacity = (step: ShapeStep) => Math.min(1, Math.max(0, v.shapeOpacity[step]));
    const shapeSteps = v.fxOrder.filter((step): step is ShapeStep => isShapeStep(step) && active[step]);
    this.info.shapeVersions = 1 + shapeSteps.filter((step) => opacity(step) < 1 || v.layerBlend[step] !== 0).length;

    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer);
    gl.viewport(0, 0, textureWidth, textureHeight);
    this.timer.begin("fold");
    this.drawShapes(v, first, null, width, height);
    this.timer.end();

    Object.assign(this.info, { width, height, textureWidth, textureHeight, blurSamples: v.blur > 0 ? BLUR_TAPS : 0 });

    if (passes.length > 0) this.ensureTrailTargets(width, height);
    for (const step of PICTURE_STEPS) if (!active[step]) delete this.timer.times[step];
    if (!passes.some(Array.isArray)) delete this.timer.times.refold;
    /** A scratch picture that is not the one being read. */
    const scratchFor = (input: WebGLTexture) => (input === this.current.texture ? this.scratch : this.current);

    /**
     * The picture so far. It starts in the bordered kaleidoscope texture.
     * Blur reads the border, so it can be first; any other first step gets a
     * plain copy without the border (the blur shader with no blur). With no
     * steps, that copy goes straight to the screen.
     */
    let source: WebGLTexture = this.frameTexture;
    let padded = true;
    if (passes[0] !== "blur") {
      const target = passes.length > 0 ? scratchFor(source) : null;
      this.timer.begin("blur");
      this.drawBlur(v, source, true, target, false);
      this.timer.end();
      if (target) {
        source = target.texture;
        padded = false;
      }
    }
    passes.forEach((step, index) => {
      const last = index === passes.length - 1;
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
        else if (step === "camera") this.drawCamera(v, source, target, width, height);
        else if (step === "contours") this.drawContours(v, source, target, width, height);
        else if (step === "smear") this.drawSmear(v, source, target, width, height);
        else this.drawFinish(v, source, target, width, height);
        if (target) source = target.texture;
        padded = false;
      }
      this.timer.end();
    });
    this.trailsWereOn = active.trails;
    this.contoursWereOn = active.contours;
    this.smearWasOn = active.smear;
  }

  /**
   * Draws one group of shape steps into the bound framebuffer. With no
   * "picture", it reads the source images and draws the bordered
   * kaleidoscope texture. With a picture (the result of the steps before,
   * the size of the screen), it moves that picture, with no border.
   */
  private drawShapes(v: FrameValues, steps: ShapeStep[], picture: WebGLTexture | null, width: number, height: number) {
    const gl = this.gl;
    const k = this.kaleido;
    gl.useProgram(k.program);
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.imageTextures[1]);
    gl.uniform1i(k.uniforms.u_img2, 1);
    gl.uniform2f(k.uniforms.u_imgRes2, this.imageSizes[1][0], this.imageSizes[1][1]);
    gl.uniform1f(k.uniforms.u_blend, Math.min(1, Math.max(0, v.imageBlend)));
    gl.uniform1i(k.uniforms.u_blendMode, v.blendMode);
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
    gl.uniform1f(k.uniforms.u_pad, picture ? 0 : this.pad);
    gl.uniform2f(k.uniforms.u_center, v.centerX, v.centerY);
    gl.uniform1i(k.uniforms.u_warpMode, v.warpMode);
    gl.uniform1f(k.uniforms.u_warpAmount, v.warpAmount);
    gl.uniform1f(k.uniforms.u_warpScale, v.warpScale);
    gl.uniform1f(k.uniforms.u_warpCellSize, Math.max(0.01, v.warpCellSize));
    gl.uniform1f(k.uniforms.u_warpCellAngle, v.warpCellAngle);
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
    gl.uniform1f(k.uniforms.u_mapArms, v.mapArms);
    gl.uniform1f(k.uniforms.u_spiralCopies, v.spiralCopies);
    gl.uniform1f(k.uniforms.u_mapTwist, v.mapTwist);
    gl.uniform2f(k.uniforms.u_mapAxis, Math.cos(v.mapAngle), Math.sin(v.mapAngle));
    gl.uniform1f(k.uniforms.u_mapTravel, v.mapTravel);
    gl.uniform1f(k.uniforms.u_tunnelTwist, v.tunnelTwist);
    gl.uniform1f(k.uniforms.u_mapFog, v.mapFog);
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

  /** Applies the final effects to the picture and draws it on the screen. */
  private drawFinish(v: FrameValues, source: WebGLTexture, target: Target | null, width: number, height: number) {
    const gl = this.gl;
    const f = this.finish;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.framebuffer : null);
    gl.viewport(0, 0, width, height);
    gl.useProgram(f.program);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, source);
    gl.uniform1i(f.uniforms.u_tex, 0);
    gl.uniform2f(f.uniforms.u_texel, this.texelScale / width, this.texelScale / height);
    gl.uniform1f(f.uniforms.u_sharpen, v.sharpen);
    gl.uniform1f(f.uniforms.u_radius, v.sharpenRadius);
    gl.uniform1f(f.uniforms.u_exposure, v.exposure);
    gl.uniform1f(f.uniforms.u_black, v.blackLevel);
    gl.uniform3f(f.uniforms.u_overlay, ...v.overlayColor);
    gl.uniform1f(f.uniforms.u_overlayOpacity, v.overlayOpacity);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  private drawCopy(source: WebGLTexture) {
    const gl = this.gl;
    const c = this.copy;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
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
    for (const target of [this.current, this.scratch, ...this.trailTargets, ...this.fieldTargets, this.heightTarget]) this.allocate(target, width, height);
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
    const maxSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const maxPad = Math.max(0, Math.floor((maxSize - Math.max(width, height)) / 2));
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

  private createProgram(fragmentSource: string): Program {
    const gl = this.gl;
    const program = gl.createProgram()!;
    gl.attachShader(program, this.compile(gl.VERTEX_SHADER, VERTEX_SHADER));
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
