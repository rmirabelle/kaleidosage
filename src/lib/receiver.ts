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
 *
 * The stream can carry the sender's music (AUDIO messages). A worklet
 * plays it: each block has its place in the music and the time it must be
 * heard, which is the same delay after the sender's time as the picture
 * has. The worklet plays a little faster or slower (at most 0.3 %) to stay
 * at that time, so the two PCs' clocks, which never agree fully, cause no
 * clicks. While music comes, the delay follows the slowest frames, not 19
 * of 20, and comes down more slowly, because a late block of music is a
 * gap that the ear hears.
 */

/** The message kinds (see cast_stream.rs and receiver.rs). */
const TEXT = 0;
const FRAME = 1;
const CONNECTED = 2;
const GONE = 3;
const AUDIO = 4;

/** The limits of the delay from the sender's picture to the screen, in ms, and the margin over the longest trip. */
const DELAY_MIN = 30;
const DELAY_MAX = 600;
const DELAY_MARGIN = 10;
/** How fast the delay comes down, in ms each second: with no music, and while music plays (the worklet can follow 3). */
const DELAY_FALL = 15;
const DELAY_FALL_SOUND = 2.5;
/** Music counts as playing for this time after its last block, in ms. */
const SOUND_ACTIVE_MS = 2000;
/** A pause in the music longer than this starts the worklet's place in the music again, in ms. */
const SOUND_GAP_MS = 300;
/** The trip times of this many frames set the delay (about 5 seconds). */
const TRIP_FRAMES = 300;
/** The part of those frames that must arrive in time. */
const TRIP_SHARE = 0.95;
/** The first frames of a stream do not count for the delay: the decoder starts slowly, and those trips say nothing about the network. */
const TRIP_SKIP_FRAMES = 60;
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

/**
 * The sound player, as an AudioWorklet module from a Blob, so it needs no
 * build step. Each message has a block of stereo samples (left and right in
 * turn), "index" (the place of its first sample in the music, counted in
 * samples) and "when" (the audio context's time at which that sample must
 * play). The samples wait in a ring of 4 seconds. The player keeps a place
 * in the music and moves it one sample for each sample it plays, a little
 * more or less to stay at the wanted time; a difference of more than 60 ms,
 * or a message with "jump" (the picture's delay went up at once, and the
 * sound must go with it), moves the place at once. Each second it posts
 * the samples of silence it played for want of music, the times it moved
 * its place, and the largest difference between its place and the wanted
 * time, in ms.
 */
const SOUND_SOURCE = `
class KaleidoReceiverOut extends AudioWorkletProcessor {
  constructor() {
    super();
    this.size = Math.round(sampleRate * 4);
    this.left = new Float32Array(this.size);
    this.right = new Float32Array(this.size);
    this.first = 0;
    this.written = 0;
    this.base = null;
    this.place = 0;
    this.jump = false;
    this.gap = 0;
    this.jumps = 0;
    this.error = 0;
    this.sinceReport = 0;
    this.port.onmessage = (event) => {
      const message = event.data;
      if (message.reset) {
        this.base = null;
        this.first = 0;
        this.written = 0;
        return;
      }
      const frames = message.samples.length / 2;
      if (message.index !== this.written) this.first = message.index;
      for (let frame = 0; frame < frames; frame++) {
        const at = (message.index + frame) % this.size;
        this.left[at] = message.samples[frame * 2];
        this.right[at] = message.samples[frame * 2 + 1];
      }
      this.written = message.index + frames;
      if (this.written - this.first > this.size) this.first = this.written - this.size;
      const base = message.when - message.index / sampleRate;
      if (this.base === null || message.jump || Math.abs(base - this.base) > 0.06) {
        this.base = base;
        this.jump = true;
      } else {
        this.base += (base - this.base) * 0.05;
      }
    };
  }
  process(inputs, outputs) {
    const left = outputs[0][0];
    const right = outputs[0][1] || left;
    if (this.base !== null) {
      const wanted = (currentTime - this.base) * sampleRate;
      if (this.jump || Math.abs(wanted - this.place) > 0.06 * sampleRate) {
        this.place = wanted;
        this.jump = false;
        this.jumps++;
      }
      this.error = Math.max(this.error, Math.abs(wanted - this.place) / sampleRate * 1000);
      const step = 1 + Math.max(-0.003, Math.min(0.003, (wanted - this.place) / sampleRate * 0.5));
      for (let frame = 0; frame < left.length; frame++) {
        const index = Math.floor(this.place);
        if (index >= this.first && index + 1 < this.written) {
          const part = this.place - index;
          const a = index % this.size;
          const b = (index + 1) % this.size;
          left[frame] = this.left[a] + (this.left[b] - this.left[a]) * part;
          right[frame] = this.right[a] + (this.right[b] - this.right[a]) * part;
        } else if (index >= this.first && this.written > this.first) {
          this.gap++;
        }
        this.place += step;
      }
    }
    this.sinceReport += left.length;
    if (this.sinceReport >= sampleRate) {
      this.port.postMessage({ gap: this.gap, jumps: this.jumps, error: this.error });
      this.sinceReport = 0;
      this.gap = 0;
      this.jumps = 0;
      this.error = 0;
    }
    return true;
  }
}
registerProcessor("kaleido-receiver-out", KaleidoReceiverOut);
`;

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
  /** Frames that the decoder gave since the stream started. */
  private decoded = 0;
  private lastTick = 0;
  private frameId = 0;
  private timers: number[] = [];
  private socket: WebSocket | null = null;
  private stats = { shown: 0, delaySum: 0, dropped: 0, lost: 0, bytes: 0 };
  /** The sound player: its audio context (at the music's sample rate), its worklet node once ready, and the place in the music of the next block. */
  private sound: { context: AudioContext; rate: number; node: AudioWorkletNode | null } | null = null;
  private soundIndex = 0;
  private lastSoundAt = -Infinity;
  /** The worklet's numbers since the last report: samples of silence for want of music, and moves of its place. */
  private soundStats = { gap: 0, jumps: 0, error: 0 };
  /** The delay that the last block of music was sent to the player with. */
  private lastSoundDelay = 0;
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
    void this.sound?.context.close();
    this.sound = null;
    this.endStream();
  }

  private send(message: object) {
    if (this.status.state === "waiting" || this.status.state === "error") return;
    invoke("receiver_send", { text: JSON.stringify(message) }).catch(() => { /* The sender is gone. */ });
  }

  private onMessage(message: ArrayBuffer) {
    const kind = new Uint8Array(message, 0, 1)[0];
    if (kind === FRAME) return this.onFrame(message);
    if (kind === AUDIO) return this.onSound(message);
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
        if (++this.decoded > TRIP_SKIP_FRAMES) {
          this.trips.push(trip);
          if (this.trips.length > TRIP_FRAMES) this.trips.shift();
          this.tripMax = Math.max(this.tripMax, trip);
        }
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
    this.decoded = 0;
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

  /** The sound output's own numbers, for the sender's log: the delay that the web view names for the device and for its own buffer, and how far ahead of the played sound the audio context's time is, all in ms. */
  private soundOutput() {
    const context = this.sound?.context;
    if (!context) return "";
    const output = context.getOutputTimestamp();
    const ahead = output.performanceTime && output.contextTime !== undefined
      ? (context.currentTime - output.contextTime) * 1000 - (performance.now() - output.performanceTime)
      : NaN;
    return `device ${Math.round((context.outputLatency || 0) * 1000)}, buffer ${Math.round(context.baseLatency * 1000)}, ahead ${Math.round(ahead)}, state ${context.state}`;
  }

  private get soundActive() {
    return performance.now() - this.lastSoundAt < SOUND_ACTIVE_MS;
  }

  /** Makes the sound player for music at "rate" samples a second; the blocks that come before it is ready are not played. */
  private startSound(rate: number) {
    void this.sound?.context.close();
    const context = new AudioContext({ sampleRate: rate, latencyHint: "interactive" });
    const sound: NonNullable<ReceiverPlayer["sound"]> = { context, rate, node: null };
    this.sound = sound;
    const url = URL.createObjectURL(new Blob([SOUND_SOURCE], { type: "text/javascript" }));
    context.audioWorklet.addModule(url)
      .then(() => {
        if (this.sound !== sound) return;
        const node = new AudioWorkletNode(context, "kaleido-receiver-out", { numberOfInputs: 0, numberOfOutputs: 1, outputChannelCount: [2] });
        node.port.onmessage = (event: MessageEvent<{ gap: number; jumps: number; error: number }>) => {
          this.soundStats.gap += event.data.gap;
          this.soundStats.jumps += event.data.jumps;
          this.soundStats.error = Math.max(this.soundStats.error, event.data.error);
        };
        node.connect(context.destination);
        sound.node = node;
        return context.resume();
      })
      .catch((error) => this.setStatus({ state: "error", message: `This PC cannot play the sender's music: ${error instanceof Error ? error.message : String(error)}` }))
      .finally(() => URL.revokeObjectURL(url));
  }

  /** One block of the sender's music: it goes to the sound player with the time it must be heard. */
  private onSound(message: ArrayBuffer) {
    if (this.status.state !== "playing") return;
    const view = new DataView(message, 1);
    const taken = view.getFloat64(0);
    const rate = view.getUint32(8);
    if (rate < 8000 || rate > 192000) return;
    /* The music's trip counts for the delay as a frame's trip does: a block must arrive before its time. Music that the sender moved earlier has a longer trip, so the delay grows by itself. */
    if (this.decoded > TRIP_SKIP_FRAMES) {
      const trip = wall() + this.clockOffset - taken;
      this.trips.push(trip);
      if (this.trips.length > TRIP_FRAMES) this.trips.shift();
      this.tripMax = Math.max(this.tripMax, trip);
    }
    if (!this.sound || this.sound.rate !== rate) this.startSound(rate);
    const { context, node } = this.sound!;
    const now = performance.now();
    const paused = now - this.lastSoundAt > SOUND_GAP_MS;
    this.lastSoundAt = now;
    if (!node) return;
    if (paused) {
      this.soundIndex = 0;
      node.port.postMessage({ reset: true });
    }
    const whole = new Int16Array(message.slice(13));
    const samples = new Float32Array(whole.length);
    for (let index = 0; index < whole.length; index++) samples[index] = whole[index] / 32768;
    /* The time on this page's clock at which the block must be heard, then that time on the audio output's clock. */
    const due = taken + this.delay - this.clockOffset - performance.timeOrigin;
    const output = context.getOutputTimestamp();
    const when = output.performanceTime && output.contextTime !== undefined
      ? output.contextTime + (due - output.performanceTime) / 1000
      : context.currentTime + (due - now) / 1000;
    /* The picture's delay goes up at once when the network is slow; the sound must make the same step at once, or it plays before its picture until the player has slowly moved there. */
    const jump = this.delay - this.lastSoundDelay > 3;
    this.lastSoundDelay = this.delay;
    node.port.postMessage({ samples, index: this.soundIndex, when, jump }, [samples.buffer]);
    this.soundIndex += whole.length / 2;
  }

  /** Each screen frame: shows the newest picture whose time has come, and moves the delay. */
  private readonly draw = (now: number) => {
    this.frameId = requestAnimationFrame(this.draw);
    const elapsed = this.lastTick ? Math.min(now - this.lastTick, 100) : 0;
    this.lastTick = now;
    const target = Math.min(DELAY_MAX, Math.max(DELAY_MIN, this.tripLevel + DELAY_MARGIN));
    this.delay = target > this.delay ? target : Math.max(target, this.delay - (this.soundActive ? DELAY_FALL_SOUND : DELAY_FALL) * elapsed / 1000);
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
      waiting: this.queue.length,
      soundGapMs: this.sound ? Math.round(this.soundStats.gap / this.sound.rate * 1000) : 0,
      soundJumps: this.soundStats.jumps,
      soundError: Math.round(this.soundStats.error),
      soundOutput: this.soundOutput()
    });
    this.soundStats = { gap: 0, jumps: 0, error: 0 };
    this.stats = { shown: 0, delaySum: 0, dropped: 0, lost: 0, bytes: 0 };
    this.tripMax = 0;
  }

  /** Each second: the trip time that sets the delay, from the last frames. */
  private level() {
    if (this.trips.length < 30) return;
    const sorted = [...this.trips].sort((a, b) => a - b);
    /* While music plays, the slowest frame counts: a late block of music is a gap in the sound. */
    this.tripLevel = this.soundActive ? sorted[sorted.length - 1] : sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * TRIP_SHARE))];
  }

  private endStream() {
    if (this.decoder && this.decoder.state !== "closed") this.decoder.close();
    this.decoder = null;
    for (const waiting of this.queue) waiting.frame.close();
    this.queue = [];
    this.taken.clear();
    this.sound?.node?.port.postMessage({ reset: true });
    this.lastSoundAt = -Infinity;
  }
}
