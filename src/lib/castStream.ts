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
/** A reading of the sound system's clock this far from the kept one moves it at once (the music paused), in ms. */
const SOUND_CLOCK_JUMP_MS = 50;
/** With each block, the audio clock's place moves this part of the way to the sound system's reading. */
const SOUND_CLOCK_LEAN = 0.05;
/** The click test's flash lasts this long, in seconds (see StreamCast.flashEvery). */
const FLASH_SECONDS = 0.04;
/** The timing test (see StreamCast.testPattern): the flash and the beep last this long, and the beep's blocks have this size and rate. */
const TEST_FLASH_MS = 50;
const TEST_SOUND_FRAMES = 2048;
const TEST_SOUND_RATE = 48000;
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

/** A receiver that the search found (see cast_receivers in cast_stream.rs). */
export interface CastReceiver {
  name: string;
  /** Its network address. */
  address: string;
  /** Its screen, in pixels. */
  width: number;
  height: number;
}

const STORE_KEY = "kaleidosage.cast-receiver";

/** The receiver that the last network cast went to, and whether a Cast with no pick goes to it and not to a screen. */
function loadPick(): { receiver: string | null; prefer: boolean } {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { receiver?: unknown; prefer?: unknown };
    return { receiver: typeof saved.receiver === "string" ? saved.receiver : null, prefer: saved.prefer === true };
  } catch {
    return { receiver: null, prefer: false };
  }
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
  /** The receivers on the network, by name; refreshReceivers reads them again. */
  receivers: CastReceiver[] = [];
  /** See loadPick. */
  pick = loadPick();
  private searching: Promise<void> | null = null;
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
  /** The time on this PC's clock (ms since 1970) at which the sound of the audio context's time 0 was heard. */
  private soundClock = Infinity;
  /** Dev: called with each block of music and the time stamp of its first sample (see measureShow in src/dev/castProbe.ts). */
  onSoundBlock: ((samples: Float32Array, stamp: number) => void) | null = null;
  /** Dev: how much later (ms) a stamp from the blocks' arrival times is than the stamp from the sound system's clock. */
  soundStampDifference = 0;
  /** Moves the sound at the receiver, in ms: positive is later. For a screen or speakers with a delay of their own, which no PC can measure. */
  soundOffsetMs = 0;
  /**
   * How many blocks of music (10.7 ms each) go to the app in one call. Each
   * call to the app costs time on the page, and with one call for each
   * block the frames had to wait. More blocks make the music's own delay
   * longer by their length.
   */
  soundBlocks = 4;
  /**
   * A timing test: in place of the scene and the music, the stream carries
   * a white flash and a beep, both for the first 50 ms of each second of
   * this PC's clock, with the same time stamps. A receiver that shows them
   * together plays picture and sound in time.
   */
  testPattern = false;
  /**
   * A second timing test, for the real show's path: with a number of
   * seconds here and a clock that gives the song's time for the picture,
   * each frame whose song time is in the first 40 ms of such a period goes
   * out white. With a song that has a click at each period, the receiver
   * shows a flash with each click when picture and sound are in time.
   */
  flashEvery = 0;
  flashClock: (() => number) | null = null;
  /** The time stamp of the next block of the test's beep; 0 before the first. */
  private testSoundAt = 0;
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

  /** Searches the network for receivers. The list changes only when the receivers did. */
  refreshReceivers() {
    if (!isTauri()) return Promise.resolve();
    this.searching ??= invoke<CastReceiver[]>("cast_receivers")
      .then((found) => {
        if (JSON.stringify(found) === JSON.stringify(this.receivers)) return;
        this.receivers = found;
        this.changed();
      })
      .catch(() => { /* The list stays as it is. */ })
      .finally(() => { this.searching = null; });
    return this.searching;
  }

  /** Keeps what a Cast with no pick does: "prefer" sends it to the remembered receiver, not to a screen. */
  setPick(pick: { receiver: string | null; prefer: boolean }) {
    this.pick = pick;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(pick)); } catch { /* The pick is gone at the next start. */ }
  }

  /** Starts a cast to a receiver from the list, or to the receiver at an address or with a PC name. */
  async start(engine: Engine, to: CastReceiver | string) {
    if (this.on) return;
    const target = typeof to === "string" ? to : to.address;
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
      this.testSoundAt = 0;
      this.stopFrames = engine.onFrame(() => {
        if (this.testPattern) return this.sendTestPattern(pixels);
        /* A still picture sends nothing: the receiver keeps the last frame. */
        if (!engine.stats.drawing || engine.canvas.width !== info.width || engine.canvas.height !== info.height) return;
        if (this.inFlight >= MAX_IN_FLIGHT) {
          this.counts.skipped++;
          return;
        }
        this.inFlight++;
        const drawn = performance.now();
        const taken = performance.timeOrigin + drawn;
        const flash = this.flashEvery > 0 && this.flashClock !== null && tracks.playing && this.flashClock() % this.flashEvery < FLASH_SECONDS;
        /* The read starts now, while the canvas holds the frame; it ends in the frame's turn. */
        const read = engine.startRead();
        this.chain = this.chain
          .then(async () => {
            await read(pixels);
            if (flash) pixels.fill(255);
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
      if (!this.testPattern) tracks.castTap(this.onSound);
      this.status = { state: "on", ...info };
      if (typeof to !== "string") this.setPick({ receiver: to.name, prefer: true });
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

  /** The timing test's frame and sound for now (see testPattern). */
  private sendTestPattern(pixels: Uint8Array) {
    const taken = performance.timeOrigin + performance.now();
    if (this.inFlight < MAX_IN_FLIGHT) {
      this.inFlight++;
      const white = taken % 1000 < TEST_FLASH_MS;
      this.chain = this.chain
        .then(async () => {
          pixels.fill(white ? 255 : 0);
          await invoke("cast_stream_frame", { taken });
          this.counts.sent++;
        })
        .catch((error) => this.fail(error))
        .finally(() => { this.inFlight--; });
    }
    /* The sound goes out in blocks that have ended, as the music's blocks do. */
    const blockMs = TEST_SOUND_FRAMES / TEST_SOUND_RATE * 1000;
    if (this.testSoundAt === 0) this.testSoundAt = taken;
    while (this.testSoundAt + blockMs <= taken) {
      const content = new ArrayBuffer(12 + TEST_SOUND_FRAMES * 4);
      const view = new DataView(content);
      view.setFloat64(0, this.testSoundAt + this.soundOffsetMs);
      view.setUint32(8, TEST_SOUND_RATE);
      const whole = new Int16Array(content, 12);
      for (let frame = 0; frame < TEST_SOUND_FRAMES; frame++) {
        const time = this.testSoundAt + frame / TEST_SOUND_RATE * 1000;
        const value = time % 1000 < TEST_FLASH_MS ? Math.sin(2 * Math.PI * time) * 0.6 * 32767 : 0;
        whole[frame * 2] = value;
        whole[frame * 2 + 1] = value;
      }
      invoke("cast_stream_audio", new Uint8Array(content)).catch(() => { /* The stream ended. */ });
      this.testSoundAt += blockMs;
    }
  }

  /** One block of the music that plays (see TrackList.castTap): it goes to the receiver with the time it played here. */
  private readonly onSound = (samples: Float32Array, time: number, context: AudioContext) => {
    /*
     * The moment the block is heard here comes from the sound system: it
     * names a time on the audio clock and the moment that time is heard.
     * The readings jump a little, so the clock's place moves only a part of
     * the way to each reading; a pause in the music moves it at once.
     */
    const output = context.getOutputTimestamp();
    const blockMs = samples.length / 2 / context.sampleRate * 1000;
    const estimate = performance.timeOrigin + performance.now() - time * 1000 - blockMs + tracks.latency * 1000;
    const reading = output.performanceTime ? performance.timeOrigin + output.performanceTime - (output.contextTime ?? 0) * 1000 : estimate;
    this.soundClock = Math.abs(reading - this.soundClock) > SOUND_CLOCK_JUMP_MS ? reading : this.soundClock + (reading - this.soundClock) * SOUND_CLOCK_LEAN;
    this.soundStampDifference += (estimate - this.soundClock - this.soundStampDifference) * 0.05;
    this.onSoundBlock?.(samples, this.soundClock + time * 1000);
    if (this.soundWaiting.length === 0) this.soundWaitingAt = this.soundClock + time * 1000 + this.soundOffsetMs;
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
