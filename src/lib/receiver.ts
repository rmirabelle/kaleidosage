import { invoke } from "@tauri-apps/api/core";

/**
 * Receiver mode, the page's part (Rust: src-tauri/src/receiver.rs, which
 * also says how the app starts in this mode). The app gives this page each
 * message of the sender; the page decodes the video frames with the web
 * view's decoder (the graphics chip) and shows them.
 *
 * Each frame carries the time the sender took the picture. The page shows
 * a frame a fixed time after that, the delay, so the frames have the
 * sender's even rhythm although the network delivers them unevenly. The
 * delay follows the network: it is the trip time that 19 of each 20 frames
 * of the last seconds stayed under, plus a margin. So a rare slow frame
 * shows late, as a short stutter, and does not make the whole show later.
 * The delay goes up at once, and comes down slowly.
 */

/** The message kinds (see cast_stream.rs and receiver.rs). */
const TEXT = 0;
const FRAME = 1;
const CONNECTED = 2;
const GONE = 3;

/** The limits of the delay from the sender's picture to the screen, in ms, and the margin over the longest trip. */
const DELAY_MIN = 30;
const DELAY_MAX = 600;
const DELAY_MARGIN = 10;
/** How fast the delay comes down, in ms each second. */
const DELAY_FALL = 15;
/** The trip times of this many frames set the delay (about 5 seconds). */
const TRIP_FRAMES = 300;
/** The part of those frames that must arrive in time. */
const TRIP_SHARE = 0.95;
/** Decoded frames that wait for their time; with more, the oldest are dropped. */
const QUEUE_MAX = 60;
const PING_MS = 500;
/** The clock comparison starts again after this time, to follow clocks that drift. */
const CLOCK_RESET_MS = 30000;

export type ReceiverStatus =
  | { state: "waiting" }
  | { state: "connected"; sender: string }
  | { state: "playing"; sender: string; width: number; height: number }
  | { state: "error"; message: string };

interface Waiting {
  frame: VideoFrame;
  /** When the sender took the picture, in ms on the sender's clock. */
  taken: number;
}

const wall = () => performance.timeOrigin + performance.now();

export class ReceiverPlayer {
  status: ReceiverStatus = { state: "waiting" };
  /** This PC's name, as the sender shows it. */
  name = "";
  private readonly listeners = new Set<() => void>();
  private readonly context: CanvasRenderingContext2D;
  private decoder: VideoDecoder | null = null;
  private sender = "";
  private waitForKey = true;
  private lastNumber = -1;
  /** The capture times of the frames in the decoder, by timestamp. */
  private readonly taken = new Map<number, number>();
  private queue: Waiting[] = [];
  /** The sender's clock minus this PC's clock, in ms, from the ping with the shortest trip. */
  private clockOffset = 0;
  private bestTrip = Infinity;
  private bestTripAt = 0;
  private delay = DELAY_MIN;
  /** The trip times of the last frames, in ms, oldest first. */
  private trips: number[] = [];
  /** The trip time that TRIP_SHARE of those frames stayed under; report sets it each second. */
  private tripLevel = 0;
  /** The longest trip since the last report. */
  private tripMax = 0;
  private lastTick = 0;
  private frameId = 0;
  private timers: number[] = [];
  private socket: WebSocket | null = null;
  private stats = { shown: 0, delaySum: 0, dropped: 0, lost: 0, bytes: 0 };
  private disposed = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("The receiver window cannot draw.");
    this.context = context;
  }

  /** Calls the listener after each change of status. Returns a function that removes it. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private setStatus(status: ReceiverStatus) {
    this.status = status;
    for (const listener of this.listeners) listener();
  }

  async start() {
    try {
      const info = await invoke<{ name: string; port: number }>("receiver_listen");
      if (this.disposed) return;
      this.name = info.name;
      /* The sender's messages come through a WebSocket on this PC (see receiver.rs). */
      const socket = new WebSocket(`ws://127.0.0.1:${info.port}`);
      socket.binaryType = "arraybuffer";
      socket.onmessage = (event) => { if (!this.disposed && event.data instanceof ArrayBuffer) this.onMessage(event.data); };
      socket.onerror = () => this.setStatus({ state: "error", message: "The receiver page lost its link to the app." });
      this.socket = socket;
    } catch (error) {
      this.setStatus({ state: "error", message: String(error) });
      return;
    }
    this.setStatus(this.status);
    this.timers.push(window.setInterval(() => this.send({ type: "ping", sent: wall() }), PING_MS));
    this.timers.push(window.setInterval(() => {
      this.level();
      this.report();
    }, 1000));
    this.frameId = requestAnimationFrame(this.draw);
  }

  dispose() {
    this.disposed = true;
    for (const timer of this.timers) window.clearInterval(timer);
    cancelAnimationFrame(this.frameId);
    this.socket?.close();
    this.endStream();
  }

  private send(message: object) {
    if (this.status.state === "waiting" || this.status.state === "error") return;
    invoke("receiver_send", { text: JSON.stringify(message) }).catch(() => { /* The sender is gone. */ });
  }

  private onMessage(message: ArrayBuffer) {
    const kind = new Uint8Array(message, 0, 1)[0];
    if (kind === FRAME) return this.onFrame(message);
    const text = new TextDecoder().decode(new Uint8Array(message, 1));
    if (kind === CONNECTED) {
      this.endStream();
      this.sender = text;
      this.bestTrip = Infinity;
      this.setStatus({ state: "connected", sender: text });
    } else if (kind === GONE) {
      this.endStream();
      this.context.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.setStatus({ state: "waiting" });
    } else if (kind === TEXT) {
      const content = JSON.parse(text) as { type: string; sent?: number; time?: number; codec?: string; width?: number; height?: number };
      if (content.type === "pong" && content.sent !== undefined && content.time !== undefined) this.onPong(content.sent, content.time);
      else if (content.type === "config" && content.codec && content.width && content.height) void this.configure(content.codec, content.width, content.height);
    }
  }

  private onPong(sent: number, time: number) {
    const now = wall();
    const trip = now - sent;
    if (trip < this.bestTrip || now - this.bestTripAt > CLOCK_RESET_MS) {
      this.bestTrip = trip;
      this.bestTripAt = now;
      this.clockOffset = time - (sent + now) / 2;
    }
  }

  private async configure(codec: string, width: number, height: number) {
    this.endStream();
    this.canvas.width = width;
    this.canvas.height = height;
    if (typeof VideoDecoder === "undefined") return this.setStatus({ state: "error", message: "This PC's web view cannot decode video." });
    const base = { codec, codedWidth: width, codedHeight: height, optimizeForLatency: true };
    let config: VideoDecoderConfig | null = null;
    for (const hardwareAcceleration of ["prefer-hardware", "no-preference"] as const) {
      const support = await VideoDecoder.isConfigSupported({ ...base, hardwareAcceleration }).catch(() => ({ supported: false }));
      if (support.supported) {
        config = { ...base, hardwareAcceleration };
        break;
      }
    }
    if (!config) return this.setStatus({ state: "error", message: "This PC cannot decode the sender's video (AV1)." });
    const decoder = new VideoDecoder({
      output: (frame) => {
        const taken = this.taken.get(frame.timestamp);
        this.taken.delete(frame.timestamp);
        if (taken === undefined || decoder !== this.decoder) return frame.close();
        const trip = wall() + this.clockOffset - taken;
        this.trips.push(trip);
        if (this.trips.length > TRIP_FRAMES) this.trips.shift();
        this.tripMax = Math.max(this.tripMax, trip);
        this.queue.push({ frame, taken });
        while (this.queue.length > QUEUE_MAX) {
          this.queue.shift()!.frame.close();
          this.stats.dropped++;
        }
      },
      error: (error) => this.setStatus({ state: "error", message: `The video decoder stopped: ${error.message}` })
    });
    decoder.configure(config);
    this.decoder = decoder;
    this.waitForKey = true;
    this.lastNumber = -1;
    this.delay = DELAY_MIN;
    this.trips = [];
    this.tripLevel = 0;
    this.setStatus({ state: "playing", sender: this.sender, width, height });
  }

  private onFrame(message: ArrayBuffer) {
    const decoder = this.decoder;
    if (!decoder || decoder.state !== "configured") return;
    const view = new DataView(message, 1);
    const key = view.getUint8(0) === 1;
    const number = view.getUint32(4);
    const taken = view.getFloat64(8);
    if (this.lastNumber >= 0 && number > this.lastNumber + 1) this.stats.lost += number - this.lastNumber - 1;
    this.lastNumber = number;
    if (this.waitForKey && !key) return;
    this.waitForKey = false;
    /* The decoder gives the timestamp back with the picture; the frame's number makes it unique. */
    const timestamp = number * 1000;
    this.taken.set(timestamp, taken);
    this.stats.bytes += message.byteLength - 17;
    decoder.decode(new EncodedVideoChunk({ type: key ? "key" : "delta", timestamp, data: new Uint8Array(message, 17) }));
  }

  /** Each screen frame: shows the newest picture whose time has come, and moves the delay. */
  private readonly draw = (now: number) => {
    this.frameId = requestAnimationFrame(this.draw);
    const elapsed = this.lastTick ? Math.min(now - this.lastTick, 100) : 0;
    this.lastTick = now;
    const target = Math.min(DELAY_MAX, Math.max(DELAY_MIN, this.tripLevel + DELAY_MARGIN));
    this.delay = target > this.delay ? target : Math.max(target, this.delay - DELAY_FALL * elapsed / 1000);
    const senderNow = wall() + this.clockOffset;
    let due = -1;
    for (let index = 0; index < this.queue.length; index++) {
      if (this.queue[index].taken + this.delay <= senderNow) due = index;
      else break;
    }
    if (due < 0) return;
    const { frame, taken } = this.queue[due];
    this.context.drawImage(frame, 0, 0, this.canvas.width, this.canvas.height);
    for (const waiting of this.queue.splice(0, due + 1)) waiting.frame.close();
    this.stats.dropped += due;
    this.stats.shown++;
    this.stats.delaySum += senderNow - taken;
  };

  /** Each second: the numbers of that second go to the sender. */
  private report() {
    if (this.status.state !== "playing") return;
    const { shown, delaySum, dropped, lost, bytes } = this.stats;
    this.send({
      type: "report",
      fps: shown,
      delay: shown ? Math.round(delaySum / shown) : 0,
      trip: Math.round(this.tripLevel),
      tripMax: Math.round(this.tripMax),
      dropped,
      lost,
      mbit: Math.round(bytes * 8 / 1e5) / 10,
      waiting: this.queue.length
    });
    this.stats = { shown: 0, delaySum: 0, dropped: 0, lost: 0, bytes: 0 };
    this.tripMax = 0;
  }

  /** Each second: the trip time that sets the delay, from the last frames. The first frames of a stream do not count, because the decoder starts slowly. */
  private level() {
    if (this.trips.length < 30) return;
    const sorted = [...this.trips].sort((a, b) => a - b);
    this.tripLevel = sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * TRIP_SHARE))];
  }

  private endStream() {
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = null;
    for (const waiting of this.queue) waiting.frame.close();
    this.queue = [];
    this.taken.clear();
  }
}
