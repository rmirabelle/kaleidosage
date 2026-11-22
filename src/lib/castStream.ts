import { invoke, isTauri } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import type { Engine } from "../engine/engine";
import { tracks } from "./tracks";

/**
 * Network cast: the picture goes to a Kaleido Sage in receiver mode on
 * another PC (Rust: src-tauri/src/cast_stream.rs for this side,
 * receiver.rs for the other). The engine draws at the receiver's screen
 * size, with a clock that has the stream's frame rate and does not need
 * the window on the screen (Engine.streamTo). Each frame that draws is
 * read from the GPU into memory that the page shares with the app, and
 * the app's FFmpeg encodes it with the graphics card.
 *
 * Some frames can be on their way at the same time: the GPU read of a
 * frame takes longer than one frame's time when the GPU is busy, and with
 * one frame at a time the rate would fall.
 *
 * The app's music (the tracks) goes in the same stream, not compressed,
 * and this PC's speakers are silent during the cast (TrackList.castTap).
 * Each block of music carries the time it was heard here, on the same
 * clock as the frames, so the receiver plays picture and music as this PC
 * does. "Heard" is later than "processed" by the speakers' delay
 * (TrackList.latency): the app draws each picture for the moment that is
 * heard (see songClock.ts), so the stamp must be that moment too.
 */

const FPS = 60;
const BIT_RATE = 30_000_000;
/** The stream's largest height in pixels; a receiver's screen with more gets this height, in its own shape. */
const MAX_HEIGHT = 1080;
/** Frames that can be on their way (GPU read, then FFmpeg) at one time; with more, a frame is skipped. */
const MAX_IN_FLIGHT = 3;
/** A block of music that comes this much later than the audio clock says starts the clock comparison again (the music paused), in ms. */
const SOUND_CLOCK_JUMP_MS = 50;
/** The clock comparison follows the earliest blocks, and moves this much later with each block, to follow a clock that drifts, in ms. */
const SOUND_CLOCK_LEAK_MS = 0.005;
/** How long to wait for the app's shared memory, in ms. */
const SHARED_WAIT_MS = 3000;

/** Dev only: a hot update would leave two casts with one stream; edits here reload the window instead, as cast.ts does. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

/** The part of the WebView2 page interface that shares memory with the app (see exports.ts). */
interface WebViewHost {
  addEventListener(type: "sharedbufferreceived", listener: (event: { getBuffer(): ArrayBuffer }) => void): void;
  removeEventListener(type: "sharedbufferreceived", listener: (event: { getBuffer(): ArrayBuffer }) => void): void;
  releaseBuffer(buffer: ArrayBuffer): void;
}

export type StreamStatus =
  | { state: "off" }
  | { state: "starting"; target: string }
  | { state: "on"; name: string; width: number; height: number }
  | { state: "error"; message: string };

/** One second at the receiver: frames shown, the delay from the picture here to its screen (ms), the trip time that sets the delay and the longest trip (ms), frames dropped and lost, the data rate, and the frames that wait. */
export interface ReceiverReport {
  fps: number;
  delay: number;
  trip: number;
  tripMax: number;
  dropped: number;
  lost: number;
  mbit: number;
  waiting: number;
  /** Sound: ms of silence because the music came too late, and the times the player moved to a new place in the music. */
  soundGapMs: number;
  soundJumps: number;
  /** The receiver's sound output numbers, as text (see ReceiverPlayer.soundOutput). */
  soundOutput: string;
}

/** This side's numbers since the last call of takeStats. */
export interface SenderStats {
  sent: number;
  skipped: number;
  /** The mean and the longest time from a frame's draw to its hand-over to the encoder, in ms. */
  meanMs: number;
  maxMs: number;
}

class StreamCast {
  status: StreamStatus = { state: "off" };
  /** The receiver's last report. */
  report: ReceiverReport | null = null;
  /** Goes up with each change, for useSyncExternalStore. */
  version = 0;
  private readonly listeners = new Set<() => void>();
  private engine: Engine | null = null;
  private buffer: ArrayBuffer | null = null;
  private stopFrames: (() => void) | null = null;
  private unlisten: UnlistenFn[] = [];
  private inFlight = 0;
  /** The frames go to the encoder in the order they were drawn. */
  private chain: Promise<void> = Promise.resolve();
  private counts = { sent: 0, skipped: 0, sumMs: 0, maxMs: 0 };
  /** The time on this PC's clock (ms since 1970) at which the audio context's time was 0. */
  private soundClock = Infinity;
  /** Moves the sound at the receiver, in ms: positive is later. For a screen or speakers with a delay of their own, which no PC can measure. */
  soundOffsetMs = 0;
  /**
   * How many blocks of music (10.7 ms each) go to the app in one call. Each
   * call to the app costs time on the page, and with one call for each
   * block the frames had to wait. More blocks make the music's own delay
   * longer by their length.
   */
  soundBlocks = 4;
  /** The blocks that wait for the next call, and the time stamp of the first one. */
  private soundWaiting: Float32Array[] = [];
  private soundWaitingAt = 0;

  /** Calls the listener after each change of status or report. Returns a function that removes it. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  get on() {
    return this.status.state === "on" || this.status.state === "starting";
  }

  takeStats(): SenderStats {
    const { sent, skipped, sumMs, maxMs } = this.counts;
    this.counts = { sent: 0, skipped: 0, sumMs: 0, maxMs: 0 };
    return { sent, skipped, meanMs: sent ? sumMs / sent : 0, maxMs };
  }

  /** Starts a cast to the receiver at "target" (a PC's name or address). */
  async start(engine: Engine, target: string) {
    if (this.on) return;
    this.status = { state: "starting", target };
    this.report = null;
    this.changed();
    try {
      if (!isTauri()) throw new Error("Cast needs the Kaleido Sage app.");
      if (engine.casting || engine.inVr) throw new Error("Stop the other show first.");
      const host = (window as unknown as { chrome?: { webview?: WebViewHost } }).chrome?.webview;
      if (!host) throw new Error("This web view cannot share memory with the app.");
      const shared = nextSharedBuffer(host);
      const info = await invoke<{ name: string; width: number; height: number }>("cast_stream_begin", { target, fps: FPS, bitRate: BIT_RATE, maxHeight: MAX_HEIGHT });
      const buffer = await shared;
      if (!buffer) throw new Error("The app did not share its frame memory.");
      this.buffer = buffer;
      const pixels = new Uint8Array(buffer);
      this.unlisten.push(await listen<string>("cast-stream-report", (event) => {
        try {
          const report = JSON.parse(event.payload) as ReceiverReport & { type?: string };
          if (report.type !== "report") return;
          this.report = report;
          this.changed();
        } catch { /* Not a report. */ }
      }));
      this.unlisten.push(await listen("cast-stream-gone", () => this.fail(new Error(`${info.name} closed the connection.`))));
      this.engine = engine;
      engine.streamTo({ size: [info.width, info.height], fps: FPS });
      this.stopFrames = engine.onFrame(() => {
        /* A still picture sends nothing: the receiver keeps the last frame. */
        if (!engine.stats.drawing || engine.canvas.width !== info.width || engine.canvas.height !== info.height) return;
        if (this.inFlight >= MAX_IN_FLIGHT) {
          this.counts.skipped++;
          return;
        }
        this.inFlight++;
        const drawn = performance.now();
        const taken = performance.timeOrigin + drawn;
        /* The read starts now, while the canvas holds the frame; it ends in the frame's turn. */
        const read = engine.startRead();
        this.chain = this.chain
          .then(async () => {
            await read(pixels);
            await invoke("cast_stream_frame", { taken });
            const ms = performance.now() - drawn;
            this.counts.sent++;
            this.counts.sumMs += ms;
            this.counts.maxMs = Math.max(this.counts.maxMs, ms);
          })
          .catch((error) => this.fail(error))
          .finally(() => { this.inFlight--; });
      });
      this.soundClock = Infinity;
      this.soundWaiting = [];
      tracks.castTap(this.onSound);
      this.status = { state: "on", ...info };
    } catch (error) {
      await this.end();
      this.status = { state: "error", message: error instanceof Error ? error.message : String(error) };
    }
    this.changed();
  }

  async stop() {
    if (!this.on) return;
    await this.end();
    this.status = { state: "off" };
    this.changed();
  }

  private fail(error: unknown) {
    if (!this.on) return;
    void this.end().then(() => {
      this.status = { state: "error", message: error instanceof Error ? error.message : String(error) };
      this.changed();
    });
  }

  /** One block of the music that plays (see TrackList.castTap): it goes to the receiver with the time it played here. */
  private readonly onSound = (samples: Float32Array, time: number, context: AudioContext) => {
    /* The block has just ended, so its end is now; the blocks that come with the least wait give the audio clock's place on this PC's clock. */
    const blockMs = samples.length / 2 / context.sampleRate * 1000;
    const clock = performance.timeOrigin + performance.now() - time * 1000 - blockMs;
    this.soundClock = clock < this.soundClock || clock - this.soundClock > SOUND_CLOCK_JUMP_MS ? clock : this.soundClock + SOUND_CLOCK_LEAK_MS;
    if (this.soundWaiting.length === 0) this.soundWaitingAt = this.soundClock + time * 1000 + tracks.latency * 1000 + this.soundOffsetMs;
    this.soundWaiting.push(samples);
    if (this.soundWaiting.length < this.soundBlocks) return;
    const blocks = this.soundWaiting;
    this.soundWaiting = [];
    const content = new ArrayBuffer(12 + blocks.reduce((sum, block) => sum + block.length, 0) * 2);
    const view = new DataView(content);
    view.setFloat64(0, this.soundWaitingAt);
    view.setUint32(8, context.sampleRate);
    const whole = new Int16Array(content, 12);
    let at = 0;
    for (const block of blocks) {
      for (let index = 0; index < block.length; index++) whole[at++] = Math.max(-1, Math.min(1, block[index])) * 32767;
    }
    invoke("cast_stream_audio", new Uint8Array(content)).catch(() => { /* The stream ended. */ });
  };

  /** Stops the frames, gives the engine back its own clock and size, and ends the stream in the app. */
  private async end() {
    tracks.castTap(null);
    this.stopFrames?.();
    this.stopFrames = null;
    for (const off of this.unlisten.splice(0)) off();
    if (this.engine?.streaming) this.engine.streamTo(null);
    this.engine = null;
    /* The frames that are on their way end first: FFmpeg reads the shared memory. */
    await this.chain.catch(() => {});
    if (isTauri()) await invoke("cast_stream_end").catch(() => { /* The stream ends with the app. */ });
    const host = (window as unknown as { chrome?: { webview?: WebViewHost } }).chrome?.webview;
    if (this.buffer) host?.releaseBuffer(this.buffer);
    this.buffer = null;
  }
}

/** The memory that the next cast_stream_begin shares with the page, or null when it does not come. */
function nextSharedBuffer(host: WebViewHost) {
  return new Promise<ArrayBuffer | null>((resolve) => {
    const done = (buffer: ArrayBuffer | null) => {
      host.removeEventListener("sharedbufferreceived", listener);
      window.clearTimeout(timeout);
      resolve(buffer);
    };
    const listener = (event: { getBuffer(): ArrayBuffer }) => done(event.getBuffer());
    const timeout = window.setTimeout(() => done(null), SHARED_WAIT_MS);
    host.addEventListener("sharedbufferreceived", listener);
  });
}

export const streamCast = new StreamCast();

/** A page that reloads or closes ends the stream. */
window.addEventListener("pagehide", () => { if (isTauri() && streamCast.on) void invoke("cast_stream_end"); });
