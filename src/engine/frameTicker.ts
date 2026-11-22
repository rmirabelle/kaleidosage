/**
 * A frame clock that does not need a window on the screen. A page that is
 * minimized, or behind other windows, gets no animation frames, and its
 * timers slow to one a second; a worker's timer keeps its rate. The
 * network cast (see src/lib/castStream.ts) times the engine's frames with
 * this clock, at the stream's frame rate.
 */
export class FrameTicker {
  private readonly worker: Worker;
  private pending: ((now: number) => void) | null = null;
  /** The time given to the next frame, in ms on the page's clock. */
  private time = 0;
  private readonly sleepers = new Map<number, () => void>();
  private lastSleep = 0;
  private lastRequest = 0;

  constructor(readonly fps: number) {
    const interval = 1000 / fps;
    /* Each tick aims at its own time, so the rate has no drift from the timer's whole milliseconds. */
    const source = `
      let next = performance.now();
      const tick = () => {
        next += ${interval};
        const now = performance.now();
        if (now - next > ${interval * 4}) next = now;
        postMessage(0);
        setTimeout(tick, Math.max(0, next - performance.now()));
      };
      tick();
      onmessage = (event) => setTimeout(() => postMessage(event.data.id), event.data.ms);
    `;
    const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
    this.worker = new Worker(url);
    URL.revokeObjectURL(url);
    this.worker.onmessage = (event: MessageEvent<number>) => {
      if (event.data !== 0) {
        const wake = this.sleepers.get(event.data);
        this.sleepers.delete(event.data);
        wake?.();
        return;
      }
      const callback = this.pending;
      if (!callback) return;
      this.pending = null;
      /* Frames get evenly spaced times, so motion in the video is smooth; a clock that fell behind joins the real time again. */
      const now = performance.now();
      this.time += interval;
      if (Math.abs(now - this.time) > interval * 2) this.time = now;
      callback(this.time);
    };
  }

  /** Calls "callback" at the next tick, as requestAnimationFrame does. Returns an id that is never 0. */
  request(callback: (now: number) => void) {
    this.pending = callback;
    return ++this.lastRequest;
  }

  cancel() {
    this.pending = null;
  }

  /** Waits "ms" milliseconds; unlike setTimeout, also in a page that is not on the screen. */
  sleep(ms: number) {
    return new Promise<void>((resolve) => {
      const id = ++this.lastSleep;
      this.sleepers.set(id, resolve);
      this.worker.postMessage({ id, ms });
    });
  }

  dispose() {
    this.worker.terminate();
    this.pending = null;
    for (const wake of this.sleepers.values()) wake();
    this.sleepers.clear();
  }
}
