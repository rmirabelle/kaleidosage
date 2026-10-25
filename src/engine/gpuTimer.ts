/** "refold" is a shape pass after a picture step; with several in one frame, it shows about their average. */
export type PassName = "fold" | "refold" | "blur" | "trails" | "smear" | "contours" | "relief" | "driver" | "camera" | "solid" | "sort" | "particles" | "cycles" | "rays" | "lasers" | "bloom" | "sharpen" | "color" | "levels";

interface TimerExtension {
  TIME_ELAPSED_EXT: number;
  GPU_DISJOINT_EXT: number;
}

interface Pending {
  query: WebGLQuery;
  pass: PassName;
}

/** How fast the shown times follow new measurements (0-1). Lower is steadier. */
const SMOOTHING = 0.35;

/**
 * Only every this many frames is timed, and the finished times are read
 * only in the frame halfway between: each query and each read of the GPU's
 * state costs a little time, and a few samples a second are enough.
 */
const SAMPLE_EVERY = 4;

/**
 * Measures how long each drawing pass takes on the GPU, with the
 * EXT_disjoint_timer_query_webgl2 extension. Some browsers hide it; then
 * "supported" is false and no times are reported. Results arrive a few
 * frames late, so finished queries are collected at the start of each frame.
 */
export class GpuTimer {
  readonly supported: boolean;
  /** Smoothed GPU time per pass, in milliseconds. */
  readonly times: Partial<Record<PassName, number>> = {};
  /** Measure only while the numbers are shown, because queries cost a little time. */
  enabled = false;
  private readonly extension: TimerExtension | null;
  private readonly pending: Pending[] = [];
  private readonly free: WebGLQuery[] = [];
  private active: Pending | null = null;
  /** Counts the frames (one collect per frame), and whether this frame is timed. */
  private frame = 0;
  private sampling = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.extension = gl.getExtension("EXT_disjoint_timer_query_webgl2") as TimerExtension | null;
    this.supported = this.extension !== null;
  }

  begin(pass: PassName) {
    if (!this.sampling || !this.extension || this.active) return;
    const query = this.free.pop() ?? this.gl.createQuery()!;
    this.gl.beginQuery(this.extension.TIME_ELAPSED_EXT, query);
    this.active = { query, pass };
  }

  end() {
    if (!this.active || !this.extension) return;
    this.gl.endQuery(this.extension.TIME_ELAPSED_EXT);
    this.pending.push(this.active);
    this.active = null;
  }

  /** Reads the finished queries. A "disjoint" GPU event makes their times unreliable, so they are dropped. */
  collect() {
    const gl = this.gl;
    if (!this.extension) return;
    this.frame = (this.frame + 1) % SAMPLE_EVERY;
    this.sampling = this.enabled && this.frame === 0;
    /* With the timer off and nothing waiting, there is nothing to read: the GPU setting read below waits for the GPU. */
    if (!this.enabled && !this.pending.length) {
      for (const key of Object.keys(this.times)) delete this.times[key as PassName];
      return;
    }
    if (!this.pending.length || this.frame !== SAMPLE_EVERY / 2) return;
    const disjoint = gl.getParameter(this.extension.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length && gl.getQueryParameter(this.pending[0].query, gl.QUERY_RESULT_AVAILABLE)) {
      const { query, pass } = this.pending.shift()!;
      if (!disjoint) {
        const ms = (gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6;
        const previous = this.times[pass];
        this.times[pass] = previous === undefined ? ms : previous + (ms - previous) * SMOOTHING;
      }
      this.free.push(query);
    }
    if (!this.enabled && !this.pending.length) for (const key of Object.keys(this.times)) delete this.times[key as PassName];
  }
}
