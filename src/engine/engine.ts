import { PARAM_KEYS, REFERENCE_CYCLE, createParams, createPlayState, hexToRgb, liveValue, rangeClock, startRangeAt, type ParamKey } from "./params";
import { KaleidoRenderer, type ImageSource } from "./renderer";
import { copyVideo, cueVideo, releaseVideo, seekVideo, syncVideo, videoLoopPlan, videoLoopTime } from "./video";

const DEGREES = Math.PI / 180;

/** A fully saturated color at "degrees" around the color wheel (0 red, 120 green, 240 blue), as red, green and blue from 0 to 1. */
function fullHue(degrees: number): [number, number, number] {
  const turn = (((degrees / 360) % 1) + 1) % 1;
  const channel = (offset: number) => Math.min(1, Math.max(0, Math.abs(((turn + offset) % 1) * 6 - 3) - 1));
  return [channel(0), channel(2 / 3), channel(1 / 3)];
}

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

  /** "size" fixes the picture size in pixels, for an engine that renders off the screen (see forExport). */
  constructor(readonly canvas: HTMLCanvasElement, size: [number, number] | null = null) {
    this.renderer = new KaleidoRenderer(canvas, size);
  }

  /**
   * A copy of this engine that renders off the screen at a fixed size, for
   * video export: the same settings and images, its own clock and trails.
   * A video gets its own copy, so the export can move it frame by frame
   * while the picture on the screen plays on. Dispose it when done.
   */
  async forExport(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const copy = new Engine(canvas, [width, height]);
    /* Effects that work in pixels use the screen's pixel size, so the video looks like the screen. */
    const screenHeight = this.renderer.canvasSize[1];
    if (screenHeight > 0) copy.renderer.texelScale = height / screenHeight;
    Object.assign(copy.params, structuredClone(this.params));
    Object.assign(copy.state, structuredClone(this.state));
    try {
      for (const slot of [0, 1] as const) {
        const source = this.sources[slot];
        if (!source) continue;
        if (source instanceof HTMLVideoElement) {
          const video = await copyVideo(source);
          copy.ownVideos.push(video);
          copy.setImage(video, slot);
          await copy.partnerReady[slot];
        } else {
          copy.setImage(source, slot);
        }
      }
    } catch (error) {
      copy.dispose();
      throw error;
    }
    copy.hasSecondImage = this.hasSecondImage;
    return copy;
  }

  /** Videos this engine made itself (see forExport); dispose lets them go. */
  private readonly ownVideos: HTMLVideoElement[] = [];

  start() {
    if (this.frameId) return;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    for (const video of [...this.videos, ...this.partners]) video?.pause();
  }

  /** True when a second image is loaded; only then does the image blend have an effect. */
  hasSecondImage = false;

  /** The image in each slot, as set. */
  private readonly sources: [ImageSource | null, ImageSource | null] = [null, null];

  /** The video in each image slot, if the slot holds one (experimental). */
  private readonly videos: [HTMLVideoElement | null, HTMLVideoElement | null] = [null, null];
  /** A second copy of each slot's video, which fades in at the video's loop point (see video.ts). */
  private readonly partners: [HTMLVideoElement | null, HTMLVideoElement | null] = [null, null];
  /** Settles when the slot's partner is ready, or when making it failed (the video then loops with a jump). */
  private readonly partnerReady: [Promise<void>, Promise<void>] = [Promise.resolve(), Promise.resolve()];
  private disposed = false;

  /** True when an image slot holds a video. */
  get hasVideo() {
    return this.videos.some(Boolean);
  }

  /** Sets the first (slot 0) or the second (slot 1) image. A video plays in step with the loop. */
  setImage(source: ImageSource, slot: 0 | 1 = 0) {
    this.renderer.setImage(source, slot);
    this.sources[slot] = source;
    this.setVideo(slot, source instanceof HTMLVideoElement ? source : null);
    if (slot === 1) this.hasSecondImage = true;
  }

  /** Removes the second image; the picture shows only the first. */
  clearSecondImage() {
    this.hasSecondImage = false;
    this.sources[1] = null;
    this.renderer.stopVideo(1);
    this.setVideo(1, null);
  }

  /** A video that leaves its slot pauses, unless it is still in the other slot (after a swap). */
  private setVideo(slot: 0 | 1, video: HTMLVideoElement | null) {
    const previous = this.videos[slot];
    this.videos[slot] = video;
    if (previous && previous !== video && !this.videos.includes(previous)) previous.pause();
    const partner = this.partners[slot];
    this.partners[slot] = null;
    if (partner) releaseVideo(partner);
    if (!video) return;
    this.partnerReady[slot] = copyVideo(video).then((copy) => {
      if (this.disposed || this.videos[slot] !== video) {
        releaseVideo(copy);
        return;
      }
      this.partners[slot] = copy;
      this.renderer.setVideoPartner(slot, copy);
    }).catch(() => { /* Without a partner, the video loops with a jump. */ });
  }

  /**
   * Places the slot's video copies for the current time: the copy that shows
   * and, near the video's loop point, the copy that fades in (see
   * videoLoopPlan). "place" moves one copy; it returns a promise when it waits.
   */
  private placeVideo(slot: 0 | 1, place: (video: HTMLVideoElement, target: number, waiting: boolean) => Promise<void> | void) {
    const video = this.videos[slot];
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return [];
    const partner = this.partners[slot];
    if (!this.state.videoCrossfade) {
      /* The old way: the video starts again at the start of each loop, and repeats inside a loop that is longer than it. */
      const waits = [place(video, videoLoopTime(this.state.time, this.params.cycle.value) % video.duration, false)];
      if (partner) waits.push(place(partner, 0, true));
      this.renderer.showVideo(slot, video, 0);
      return waits;
    }
    const plan = videoLoopPlan(this.state.time, this.params.cycle.value, video.duration);
    const copies = partner ? [video, partner] : [video];
    const main = copies[((plan.round % copies.length) + copies.length) % copies.length];
    const other = copies.find((copy) => copy !== main) ?? null;
    const waits = [place(main, plan.main, false)];
    if (other) waits.push(place(other, plan.fadeIn ?? 0, plan.fadeIn === null));
    this.renderer.showVideo(slot, main, plan.mix);
    return waits;
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

  /**
   * Extra warp flow, in warp time per second of animation time. A seamless
   * video export sets it, so the warp comes back to its start at the loop's end.
   */
  warpFlowOffset = 0;

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
    this.disposed = true;
    for (const video of [...this.ownVideos, ...this.partners]) if (video) releaseVideo(video);
  }

  /** Video export: GPU steps on the picture after draw (see KaleidoRenderer). */
  captureFrame() { return this.renderer.captureFrame(); }
  releaseFrame(texture: WebGLTexture) { this.renderer.releaseFrame(texture); }
  setOverlay(source: HTMLCanvasElement | null) { this.renderer.setOverlay(source); }
  drawFrameOver(texture: WebGLTexture, alpha: number) { this.renderer.drawFrameOver(texture, alpha); }
  drawOverlay(alpha: number) { this.renderer.drawOverlay(alpha); }
  startRead() { return this.renderer.startRead(); }

  /** Calls the listener after each frame. Returns a function that removes it. */
  onFrame(listener: () => void) {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  /** A PNG of the next frame. It is read right after drawing, while the canvas still holds it. */
  snapshot(): Promise<Blob | null> {
    return new Promise((resolve) => this.snapshotWaiters.push(resolve));
  }

  /**
   * Moves the clocks on by "elapsed" real seconds (nothing moves while
   * paused). Returns the animation time that passed.
   */
  step(elapsed: number) {
    if (!this.state.paused) this.state.clock += elapsed;
    const animated = this.state.paused ? 0 : elapsed * this.speed;
    this.state.time += animated;
    /** Flow is a speed, so its live value is added up over time; a drifting flow speeds up and slows down smoothly. */
    this.state.warpTime += animated * (this.live("warpFlow") + this.warpFlowOffset);
    /* Tunnel speed is a speed too, so the distance flown is added up the same way. */
    this.state.mapTravel += animated * this.live("mapSpeed");
    return animated;
  }

  /** For video export: moves each video copy to its exact place, waits for it, and uploads its frame. */
  async seekVideos() {
    for (const slot of [0, 1] as const) await Promise.all(this.placeVideo(slot, (video, target) => seekVideo(video, target)));
    this.renderer.updateVideos(true);
  }

  private readonly frame = (now: number) => {
    const interval = now - this.lastTime;
    if (interval > 0) this.stats.frameMs += (Math.min(interval, 1000) - this.stats.frameMs) * 0.1;
    const elapsed = Math.min(interval / 1000, 0.1);
    this.lastTime = now;
    const animated = this.step(elapsed);

    const paused = this.state.paused;
    for (const slot of [0, 1] as const) {
      this.placeVideo(slot, (video, target, waiting) => waiting ? cueVideo(video, target) : syncVideo(video, target, paused));
    }
    this.renderer.updateVideos();

    const renderStart = performance.now();
    this.draw(animated, elapsed);
    this.stats.cpuMs += (performance.now() - renderStart - this.stats.cpuMs) * 0.1;

    if (this.snapshotWaiters.length) {
      const waiters = this.snapshotWaiters;
      this.snapshotWaiters = [];
      this.canvas.toBlob((blob) => waiters.forEach((resolve) => resolve(blob)), "image/png");
    }
    for (const listener of this.frameListeners) listener();
    this.frameId = requestAnimationFrame(this.frame);
  };

  /** Draws the picture for the current time. "animated" and "elapsed" are the times since the last frame (see step). */
  draw(animated: number, elapsed: number) {
    /** A group that is off gets neutral values, so it has no effect. */
    const on = this.state.groups;
    const kaleidoscope = (key: ParamKey, neutral: number) => on.kaleidoscope ? this.live(key) : neutral;
    this.renderer.render({
      fxOrder: this.state.fxOrder,
      shapeActive: { warp: on.warp, map: on.map, kaleidoscope: on.kaleidoscope },
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
      /* Where the warp acts is set by the shape order; here it is only on or off. */
      warpMode: on.warp ? 1 : 0,
      warpAmount: this.live("warpAmount"),
      warpScale: this.live("warpScale"),
      warpCellSize: this.live("warpCellSize"),
      warpCellAngle: this.live("warpCellAngle") * DEGREES,
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
      branchCount: this.params.branchCount.value,
      branchSize: this.live("branchSize"),
      branchSpread: this.live("branchSpread") * DEGREES,
      branchTurn: this.live("branchTurn") * DEGREES,
      branchJoint: this.live("branchJoint"),
      branchTrunk: this.live("branchTrunk"),
      branchWidth: this.live("branchWidth"),
      branchTaper: this.live("branchTaper"),
      branchHide: this.params.branchHide.value,
      branchBackground: this.live("branchBackground"),
      branchFade: this.live("branchFade"),
      branchOpacity: on.branches ? this.live("branchOpacity") : 0,
      branchHue: this.live("branchHue") * DEGREES,
      branchBaseX: this.live("branchBaseX"),
      branchBaseY: this.live("branchBaseY"),
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
      smear: on.smear ? this.live("smearAmount") : 0,
      smearDelay: this.live("smearDelay"),
      smearShape: this.state.smearShape,
      smearAngle: this.live("smearAngle") * DEGREES,
      smearBands: this.live("smearBands"),
      smearRestart: this.params.smearRestart.value,
      smearFade: this.params.smearFade.value,
      playSeconds: animated / this.speed,
      playClock: this.state.clock,
      contours: on.contours ? this.live("contourOpacity") : 0,
      contourLines: this.live("contourLines"),
      contourWidth: this.live("contourWidth"),
      /* Resolution is the blur turned around: the most resolution is no blur. */
      contourSmooth: this.params.contourResolution.max - this.live("contourResolution"),
      contourSteady: this.live("contourSteady"),
      contourColor: this.state.contourTone === "black" ? [0, 0, 0] : this.state.contourTone === "white" ? [1, 1, 1] : fullHue(this.live("contourHue")),
      contourBlend: this.state.contourBlend,
      imageBlend: this.hasSecondImage ? this.live("imageBlend") : 0,
      blendMode: this.state.blendMode
    });
  }
}
