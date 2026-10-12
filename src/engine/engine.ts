import { createParams, createPlayState, liveValue, type ParamKey } from "./params";
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

  setImage(source: ImageSource) {
    this.renderer.setImage(source);
  }

  /** GPU pass times, render sizes and whether GPU timing is measured. */
  get timer() {
    return this.renderer.timer;
  }

  get renderInfo() {
    return this.renderer.info;
  }

  live(key: ParamKey) {
    return liveValue(this.params[key], this.state);
  }

  /**
   * Stop: pauses and goes back to time 0, where every drifting value is at
   * its range minimum. The trails start again from the still picture.
   */
  rewind() {
    this.state.paused = true;
    this.state.time = 0;
    this.state.warpTime = 0;
    this.renderer.resetTrails();
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
    const animated = this.state.paused ? 0 : elapsed * this.state.speed;
    this.state.time += animated;
    /** Flow is a speed, so its live value is added up over time; a drifting flow speeds up and slows down smoothly. */
    this.state.warpTime += animated * this.live("warpFlow");

    const renderStart = performance.now();
    /** A group that is off gets neutral values, so it has no effect. */
    const on = this.state.groups;
    const kaleidoscope = (key: ParamKey, neutral: number) => on.kaleidoscope ? this.live(key) : neutral;
    this.renderer.render({
      warpMode: on.warp ? this.state.warpMode : 0,
      warpAmount: this.live("warpAmount"),
      warpScale: this.live("warpScale"),
      warpMarble: this.live("warpMarble"),
      warpDetail: this.params.warpDetail.value,
      warpTime: this.state.warpTime,
      mapMode: on.map ? this.state.mapMode : 0,
      mapMix: this.live("mapMix"),
      mapScale: this.live("mapScale"),
      mapPower: this.live("mapPower"),
      mapPointX: this.live("mapPointX"),
      mapPointY: this.live("mapPointY"),
      mapSteps: this.params.mapSteps.value,
      mapTwist: this.live("mapTwist") * DEGREES,
      segments: on.kaleidoscope ? this.params.segments.value : 0,
      centerX: kaleidoscope("centerX", 0),
      centerY: kaleidoscope("centerY", 0),
      rotation: kaleidoscope("rotation", 0) * DEGREES,
      zoom: kaleidoscope("zoom", 1),
      twirl: kaleidoscope("twirl", 0),
      hue: kaleidoscope("hue", 0) * DEGREES,
      panX: kaleidoscope("panX", 0),
      panY: kaleidoscope("panY", 0),
      blurMode: this.state.blurMode,
      blurAngle: this.live("blurAngle") * DEGREES,
      blurDistance: on.blur ? this.live("blurDist") : 0,
      focusSize: this.live("focusSize"),
      focusSoftness: this.live("focusSoft"),
      trailMode: on.trails ? this.state.trailMode : 0,
      trailAmount: this.live("trailAmount"),
      trailZoom: this.live("trailZoom"),
      trailTurn: this.live("trailTurn") * DEGREES,
      trailHue: this.live("trailHue") * DEGREES,
      frameScale: animated * 60,
      sharpen: on.finish ? this.live("sharpen") : 0,
      sharpenRadius: this.live("sharpenRadius"),
      contrast: on.finish ? this.live("contrast") : 1
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
