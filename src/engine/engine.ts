import { PARAM_KEYS, REFERENCE_CYCLE, createParams, createPlayState, hexToRgb, liveValue, rangeClock, startRangeAt, type ParamKey } from "./params";
import { KaleidoRenderer, type ImageSource } from "./renderer";

const DEGREES = Math.PI / 180;

/** Dev only: a running Engine keeps its old code after a hot update, so engine edits reload the window. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

/** Owns the parameters, the animation clock and the render loop. */
export class Engine {
  readonly params = createParams();
  readonly state = createPlayState();
  private readonly renderer: KaleidoRenderer;
  private readonly frameListeners = new Set<() => void>();
  private snapshotWaiters: ((blob: Blob | null) => void)[] = [];
  private frameId = 0;
  private lastTime = 0;
  /** Smoothed time between frames and smoothed CPU time of one render call, in milliseconds. */
  readonly stats = { frameMs: 0, cpuMs: 0 };

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.renderer = new KaleidoRenderer(canvas);
  }

  start() {
    if (this.frameId) return;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
  }

  /** True when a second image is loaded; only then does the image blend have an effect. */
  hasSecondImage = false;

  /** Sets the first (slot 0) or the second (slot 1) image. */
  setImage(source: ImageSource, slot: 0 | 1 = 0) {
    this.renderer.setImage(source, slot);
    if (slot === 1) this.hasSecondImage = true;
  }

  /** Removes the second image; the picture shows only the first. */
  clearSecondImage() {
    this.hasSecondImage = false;
  }

  /** GPU pass times, render sizes and whether GPU timing is measured. */
  get timer() {
    return this.renderer.timer;
  }

  get renderInfo() {
    return this.renderer.info;
  }

  /**
   * How fast animation time runs: the shared cycle sets it. A
   * REFERENCE_CYCLE-second cycle runs at 1×, and a shorter cycle runs
   * faster by the same ratio, the motion with no range included.
   */
  get speed() {
    return REFERENCE_CYCLE / Math.max(1e-3, this.params.cycle.value);
  }

  /**
   * The seamless spiral's copy count: the whole number nearest the middle
   * of the twist's range (or the twist itself, with no range). It stays the
   * same while the twist moves inside its range, so the spiral only
   * stretches and never jumps. A twist that comes within 0.5 of 0 gets 0:
   * the spiral then slants the image instead, which can pass through 0.
   */
  get spiralCopies() {
    const twist = this.params.mapArms;
    const [low, high] = twist.on ? [twist.low ?? twist.min, twist.high ?? twist.max] : [twist.value, twist.value];
    const nearest = Math.min(Math.abs(low), Math.abs(high));
    if (low * high <= 0 || nearest < 0.5) return 0;
    return Math.max(1, Math.round(Math.abs((low + high) / 2)));
  }

  live(key: ParamKey) {
    return liveValue(this.params[key], this.state);
  }

  /** Starts a range from its start handle now, for example the fade of a new second image. */
  startRangeNow(key: ParamKey) {
    const param = this.params[key];
    startRangeAt(param, rangeClock(param, this.state));
  }

  /**
   * Stop: pauses and goes back to time 0, where every drifting value is at
   * its start handle. A range that was started mid-animation (such as the
   * image blend of a new second image) or that has its own time has its
   * timing reset, so it is at its start too. The trails start again from the still picture.
   */
  rewind() {
    this.state.paused = true;
    this.state.time = 0;
    this.state.clock = 0;
    for (const key of PARAM_KEYS) if (this.params[key].drift) startRangeAt(this.params[key], 0);
    this.state.warpTime = 0;
    this.state.mapTravel = 0;
    this.renderer.resetTrails();
  }

  /** Starts the trails again from the still picture, for example after a new scene. */
  resetTrails() {
    this.renderer.resetTrails();
  }

  /** Stops the render loop and frees the GPU context. The engine cannot be used after this. */
  dispose() {
    this.stop();
    this.renderer.dispose();
  }

  /** Calls the listener after each frame. Returns a function that removes it. */
  onFrame(listener: () => void) {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  /** A PNG of the next frame. It is read right after drawing, while the canvas still holds it. */
  snapshot(): Promise<Blob | null> {
    return new Promise((resolve) => this.snapshotWaiters.push(resolve));
  }

  private readonly frame = (now: number) => {
    const interval = now - this.lastTime;
    if (interval > 0) this.stats.frameMs += (Math.min(interval, 1000) - this.stats.frameMs) * 0.1;
    const elapsed = Math.min(interval / 1000, 0.1);
    this.lastTime = now;
    if (!this.state.paused) this.state.clock += elapsed;
    const animated = this.state.paused ? 0 : elapsed * this.speed;
    this.state.time += animated;
    /** Flow is a speed, so its live value is added up over time; a drifting flow speeds up and slows down smoothly. */
    this.state.warpTime += animated * this.live("warpFlow");
    /* Tunnel speed is a speed too, so the distance flown is added up the same way. */
    this.state.mapTravel += animated * this.live("mapSpeed");

    const renderStart = performance.now();
    /** A group that is off gets neutral values, so it has no effect. */
    const on = this.state.groups;
    const kaleidoscope = (key: ParamKey, neutral: number) => on.kaleidoscope ? this.live(key) : neutral;
    this.renderer.render({
      shapeOrder: this.state.shapeOrder,
      /* A group that is off does nothing, so full opacity in normal mode costs no extra picture. */
      shapeOpacity: {
        warp: on.warp ? this.live("warpOpacity") : 1,
        map: on.map ? this.live("mapOpacity") : 1,
        kaleidoscope: on.kaleidoscope ? this.live("foldOpacity") : 1
      },
      layerBlend: {
        warp: on.warp ? this.state.layerBlend.warp : 0,
        map: on.map ? this.state.layerBlend.map : 0,
        kaleidoscope: on.kaleidoscope ? this.state.layerBlend.kaleidoscope : 0
      },
      pictureOrder: this.state.pictureOrder,
      /* Where the warp acts is set by the shape order; here it is only on or off. */
      warpMode: on.warp ? 1 : 0,
      warpAmount: this.live("warpAmount"),
      warpScale: this.live("warpScale"),
      warpMarble: this.live("warpMarble"),
      warpDetail: this.params.warpDetail.value,
      warpTime: this.state.warpTime,
      warpType: this.state.warpType,
      warpCenterX: this.live("warpCenterX"),
      warpCenterY: this.live("warpCenterY"),
      warpAngle: this.live("warpAngle") * DEGREES,
      mapMode: on.map ? this.state.mapMode : 0,
      mapMix: this.live("mapMix"),
      mapScale: this.live("mapScale"),
      mapPower: this.live("mapPower"),
      mapPointX: this.live("mapPointX"),
      mapPointY: this.live("mapPointY"),
      mapSteps: this.params.mapSteps.value,
      mapArms: this.live("mapArms"),
      spiralCopies: this.spiralCopies,
      mapTwist: this.live("mapTwist") * DEGREES,
      mapAngle: this.live("mapAngle") * DEGREES,
      mapTravel: this.state.mapTravel,
      tunnelTwist: this.live("tunnelTwist") * DEGREES,
      mapFog: this.live("mapFog"),
      segments: on.kaleidoscope ? this.live("segments") : 0,
      foldMode: on.kaleidoscope ? this.state.foldMode : 0,
      tileSize: this.live("tileSize"),
      centerX: kaleidoscope("centerX", 0),
      centerY: kaleidoscope("centerY", 0),
      rotation: kaleidoscope("rotation", 0) * DEGREES,
      zoom: kaleidoscope("zoom", 1),
      twirl: kaleidoscope("twirl", 0),
      panX: kaleidoscope("panX", 0),
      panY: kaleidoscope("panY", 0),
      blur: on.blur ? this.live("blurAmount") / 1080 : 0,
      blurMask: this.state.blurMask,
      blurMaskSize: this.live("blurMaskSize"),
      blurMaskSoft: this.live("blurMaskSoft"),
      blurMaskX: this.live("blurMaskX"),
      blurMaskY: this.live("blurMaskY"),
      blurMaskAngle: this.live("blurMaskAngle") * DEGREES,
      blurMaskLevel: this.live("blurMaskLevel"),
      trailMode: on.trails ? this.state.trailMode : 0,
      trailAmount: this.live("trailAmount"),
      trailZoom: this.live("trailZoom"),
      trailTurn: this.live("trailTurn") * DEGREES,
      trailHue: this.live("trailHue") * DEGREES,
      trailFlow: this.live("trailFlow"),
      trailSwirl: this.live("trailSwirl"),
      trailTint: this.live("trailTint"),
      trailColor: hexToRgb(this.state.trailColor),
      frameScale: animated * 60,
      fadeScale: (animated > 0 ? animated : elapsed) * 60,
      sharpen: on.finish ? this.live("sharpen") : 0,
      sharpenRadius: this.live("sharpenRadius"),
      exposure: on.finish ? this.live("exposure") : 0,
      blackLevel: on.finish ? this.live("blackLevel") : 0,
      overlayColor: hexToRgb(this.state.overlayColor),
      overlayOpacity: on.finish ? this.live("overlayOpacity") : 0,
      relief: on.relief ? this.live("reliefAmount") : 0,
      reliefDepth: this.live("reliefDepth"),
      reliefSize: this.live("reliefSize"),
      lightAngle: this.live("lightAngle") * DEGREES,
      shine: this.live("shine"),
      imageBlend: this.hasSecondImage ? this.live("imageBlend") : 0,
      blendMode: this.state.blendMode
    });

    this.stats.cpuMs += (performance.now() - renderStart - this.stats.cpuMs) * 0.1;

    if (this.snapshotWaiters.length) {
      const waiters = this.snapshotWaiters;
      this.snapshotWaiters = [];
      this.canvas.toBlob((blob) => waiters.forEach((resolve) => resolve(blob)), "image/png");
    }
    for (const listener of this.frameListeners) listener();
    this.frameId = requestAnimationFrame(this.frame);
  };
}
