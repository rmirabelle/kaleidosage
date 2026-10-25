import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import type { VideoFile } from "./videos";
import { isFileCopy } from "./kaleidoFile";

/**
 * The tracks (see docs/AUDIO.md, part 7): audio files that the app plays
 * itself, through the speakers, one after the other, and round again. The
 * same sound goes to the analysis: an AudioWorklet tap mixes it to mono
 * and posts it in blocks to "onSamples". A Kaleido Sage file keeps the
 * tracks while Files is the input (see kaleidoFile.ts): the list starts
 * empty at each start of the app, and a new or closed file empties it.
 */

export interface Track {
  path: string;
  name: string;
}

/** Why the track changed: it ended, or the user picked another track. Each change moves the show to the next scene. */
export type TrackChange = "ended" | "picked";

/** Where older versions kept the list between runs; the app removes it (see TrackList). */
const OLD_STORE_KEYS = ["kaleidosage.tracks", "kaleidosage.playlist"];
/** The tap posts this many samples at a time (about 10.7 ms at 48 kHz). */
const TAP_BLOCK = 512;

/**
 * The tap, as an AudioWorklet module from a Blob, so it needs no build
 * step: it mixes each block of the input to mono and posts it. Its output
 * is silent; it only keeps the node in the audio graph.
 */
const TAP_SOURCE = `
class KaleidoTap extends AudioWorkletProcessor {
  constructor() {
    super();
    this.block = new Float32Array(${TAP_BLOCK});
    this.at = 0;
  }
  process(inputs) {
    const input = inputs[0];
    if (input && input.length) {
      const channels = input.length;
      const frames = input[0].length;
      for (let frame = 0; frame < frames; frame++) {
        let sum = 0;
        for (let channel = 0; channel < channels; channel++) sum += input[channel][frame];
        this.block[this.at++] = sum / channels;
        if (this.at === this.block.length) {
          this.port.postMessage(this.block, [this.block.buffer]);
          this.block = new Float32Array(${TAP_BLOCK});
          this.at = 0;
        }
      }
    }
    return true;
  }
}
registerProcessor("kaleido-tap", KaleidoTap);
`;

/**
 * Dev only: a hot update would make a second player next to the first,
 * both playing. Edits here reload the window instead, as midi.ts does.
 */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

const nameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

/** A play time as "4:05", or "1:02:05" from an hour on. */
export function formatPlayTime(seconds: number) {
  const whole = Math.round(seconds);
  const [hours, minutes, rest] = [Math.floor(whole / 3600), Math.floor((whole % 3600) / 60), whole % 60];
  const two = (value: number) => String(value).padStart(2, "0");
  return hours ? `${hours}:${two(minutes)}:${two(rest)}` : `${minutes}:${two(rest)}`;
}

/**
 * A track's length in seconds, read from the file's header by an audio
 * element of its own that loads only the metadata. NaN when the file
 * cannot be read.
 */
async function readLength(path: string): Promise<number> {
  try {
    const file = await invoke<VideoFile>("open_video_file", { path });
    return await new Promise<number>((resolve) => {
      const audio = new Audio();
      audio.preload = "metadata";
      const done = (seconds: number) => {
        audio.onloadedmetadata = null;
        audio.onerror = null;
        audio.removeAttribute("src");
        audio.load();
        resolve(seconds);
      };
      audio.onloadedmetadata = () => done(Number.isFinite(audio.duration) ? audio.duration : NaN);
      audio.onerror = () => done(NaN);
      audio.src = convertFileSrc(file.id, "video");
    });
  } catch {
    return NaN;
  }
}

class TrackList {
  list: Track[] = [];
  /** The track that plays, or that plays next on Play. */
  index = 0;
  playing = false;
  /** The last failure, for example a file that cannot be played; cleared by the next track that plays. */
  error: string | null = null;
  /** Goes up with each change, for useSyncExternalStore. */
  version = 0;
  /** The samples of the music that plays, mixed to mono, at "sampleRate" (see TAP_BLOCK). */
  onSamples: ((samples: Float32Array) => void) | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly trackListeners = new Set<(index: number, why: TrackChange) => void>();
  private readonly stopListeners = new Set<() => void>();
  private context: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private ready: Promise<void> | null = null;
  /** The track the audio element holds, so Play goes on from where it paused. */
  private loaded: string | null = null;
  /** Each track's length in seconds, by path, once read (NaN for a file that cannot be read); see measure. */
  private readonly lengths = new Map<string, number>();
  private measuring = false;

  constructor() {
    try {
      for (const key of OLD_STORE_KEYS) localStorage.removeItem(key);
    } catch { /* Nothing to remove. */ }
  }

  /** The play time of every track, in seconds, and how many tracks have no known length (yet). */
  get playTime() {
    let seconds = 0;
    let unknown = 0;
    for (const track of this.list) {
      const length = this.lengths.get(track.path);
      if (length === undefined || Number.isNaN(length)) unknown++;
      else seconds += length;
    }
    return { seconds, unknown };
  }

  /** The track's length in seconds, or null when it is not known (yet). */
  lengthOf(path: string): number | null {
    const length = this.lengths.get(path);
    return length === undefined || Number.isNaN(length) ? null : length;
  }

  /** Lengths that a file kept (see kaleidoFile.ts), in track order, so they need not be read again. */
  setLengths(seconds: readonly (number | null)[]) {
    this.list.forEach((track, index) => {
      const length = seconds[index];
      if (typeof length === "number" && length > 0) this.lengths.set(track.path, length);
    });
    this.changed();
  }

  /** True while the lengths of new tracks are being read. */
  get measuringLengths() {
    return this.measuring;
  }

  /** Reads the length of each track that has none yet, one at a time; the subscribers hear of each one. */
  private async measure() {
    if (this.measuring || !isTauri()) return;
    this.measuring = true;
    try {
      for (;;) {
        const track = this.list.find((candidate) => !this.lengths.has(candidate.path));
        if (!track) break;
        this.lengths.set(track.path, await readLength(track.path));
        this.changed();
      }
    } finally {
      this.measuring = false;
      this.changed();
    }
  }

  /** The sample rate of the samples that onSamples gets. */
  get sampleRate() {
    return this.context?.sampleRate ?? 48000;
  }

  /** Seconds into the track, and the track's length (0 until it is known). */
  get position() {
    return this.audio?.currentTime ?? 0;
  }

  /** Seconds from the audio element to the speakers: the audio context's own latency and the output device's. */
  get latency() {
    if (!this.context) return 0;
    return this.context.baseLatency + (this.context.outputLatency || 0);
  }

  get duration() {
    const duration = this.audio?.duration ?? 0;
    return Number.isFinite(duration) ? duration : 0;
  }

  get current(): Track | null {
    return this.list[this.index] ?? null;
  }

  /** Calls the listener after each change of tracks, index or state. Returns a function that removes it. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  /** Calls the listener when another track starts: the show then moves to the next scene. Returns a function that removes it. */
  onTrackChange(listener: (index: number, why: TrackChange) => void) {
    this.trackListeners.add(listener);
    return () => { this.trackListeners.delete(listener); };
  }

  /** Calls the listener when the user stops the music (see stop): the show then goes back to its first scene. Returns a function that removes it. */
  onStop(listener: () => void) {
    this.stopListeners.add(listener);
    return () => { this.stopListeners.delete(listener); };
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** The audio element and the graph: element to the speakers, and to the tap. Made once, on the first Play (a user action, so the audio context may start). */
  private setup() {
    this.ready ??= (async () => {
      const context = new AudioContext({ latencyHint: "interactive" });
      const url = URL.createObjectURL(new Blob([TAP_SOURCE], { type: "text/javascript" }));
      try {
        await context.audioWorklet.addModule(url);
      } finally {
        URL.revokeObjectURL(url);
      }
      const audio = new Audio();
      audio.crossOrigin = "anonymous";
      audio.preload = "auto";
      audio.addEventListener("ended", () => this.step(1, "ended"));
      audio.addEventListener("play", () => { this.playing = true; this.changed(); });
      audio.addEventListener("pause", () => { this.playing = false; this.changed(); });
      audio.addEventListener("loadedmetadata", () => {
        /* The playing file gives its length too. */
        if (this.loaded && Number.isFinite(audio.duration)) this.lengths.set(this.loaded, audio.duration);
        this.changed();
      });
      audio.addEventListener("error", () => {
        this.error = `Could not play ${this.current?.name ?? "the file"}.`;
        this.changed();
      });
      const source = context.createMediaElementSource(audio);
      const tap = new AudioWorkletNode(context, "kaleido-tap", { numberOfInputs: 1, numberOfOutputs: 1, channelCountMode: "max" });
      tap.port.onmessage = (event: MessageEvent<Float32Array>) => this.onSamples?.(event.data);
      const silent = context.createGain();
      silent.gain.value = 0;
      source.connect(context.destination);
      source.connect(tap);
      tap.connect(silent);
      silent.connect(context.destination);
      this.context = context;
      this.audio = audio;
    })();
    return this.ready;
  }

  /** Puts the current track in the audio element, unless it is there already. */
  private async load() {
    const track = this.current;
    if (!track || !this.audio) return false;
    if (this.loaded === track.path) return true;
    if (!isTauri()) throw new Error("Playing audio files needs the Kaleido Sage app.");
    const file = await invoke<VideoFile>("open_video_file", { path: track.path });
    this.audio.src = convertFileSrc(file.id, "video");
    this.loaded = track.path;
    return true;
  }

  /** Plays the current track; "from": from this time (seconds) instead of where it is. */
  async play(from?: number) {
    try {
      await this.setup();
      if (!(await this.load())) return;
      if (from !== undefined) this.audio!.currentTime = Math.max(0, from);
      await this.context!.resume();
      await this.audio!.play();
      this.error = null;
    } catch (error) {
      this.error = `Could not play ${this.current?.name ?? "the file"}. ${error instanceof Error ? error.message : String(error)}`;
    }
    this.changed();
  }

  pause() {
    this.audio?.pause();
  }

  toggle() {
    void (this.playing ? this.pause() : this.play());
  }

  /** Stop: pauses and goes back to the start of the track; the listeners hear of it (see onStop). */
  stop() {
    this.pause();
    if (this.audio) this.audio.currentTime = 0;
    this.changed();
    for (const listener of this.stopListeners) listener();
  }

  seek(seconds: number) {
    if (this.audio) this.audio.currentTime = Math.max(0, Math.min(this.duration, seconds));
    this.changed();
  }

  /** Goes to another track and plays it; the track list goes round at both ends. */
  private go(index: number, why: TrackChange, from?: number) {
    if (this.list.length === 0) return;
    this.index = ((index % this.list.length) + this.list.length) % this.list.length;
    /* The same file again (a list of one track) starts at its beginning. */
    this.loaded = null;
    for (const listener of this.trackListeners) listener(this.index, why);
    void this.play(from);
  }

  private step(by: 1 | -1, why: TrackChange) {
    this.go(this.index + by, why);
  }

  playTrack(index: number) {
    this.go(index, "picked");
  }

  /** Plays a track from this time (seconds): the track that plays goes there, and another track is picked first. */
  playAt(index: number, seconds: number) {
    if (index === this.index && this.loaded !== null && this.loaded === this.current?.path) {
      this.seek(seconds);
      if (!this.playing) void this.play();
      return;
    }
    this.go(index, "picked", seconds);
  }

  /** Adds files at the end of the track list; a file that is in it already is not added twice. */
  /**
   * A file that is in the list already is left out, and with nothing new
   * nothing changes. A track of an opened file is a copy in the temp
   * folder (see isFileCopy), so there a file with the same name counts
   * as the same file too.
   */
  add(paths: string[]) {
    /* Windows paths: case and the kind of slash do not matter. */
    const key = (path: string) => path.replace(/\//g, "\\").toLowerCase();
    const known = new Set(this.list.map((track) => key(track.path)));
    const copies = new Set(this.list.filter((track) => isFileCopy(track.path)).map((track) => track.name.toLowerCase()));
    const added = paths.filter((path) => {
      if (known.has(key(path)) || copies.has(nameOf(path).toLowerCase())) return false;
      known.add(key(path));
      return true;
    });
    if (added.length === 0) return;
    for (const path of added) this.list.push({ path, name: nameOf(path) });
    this.changed();
    void this.measure();
  }

  remove(index: number) {
    const removed = this.list.splice(index, 1)[0];
    if (!removed) return;
    if (index < this.index) this.index--;
    else if (index === this.index) {
      /* The track that plays is gone: the next one takes its place, stopped. */
      this.pause();
      this.loaded = null;
      if (this.index >= this.list.length) this.index = 0;
    }
    this.changed();
  }

  /** Puts the tracks in the order of "paths" (a drag in the list). The track that plays stays the one that plays. */
  reorder(paths: readonly string[]) {
    const current = this.current;
    const byPath = new Map(this.list.map((track) => [track.path, track]));
    const next = paths.flatMap((path) => byPath.get(path) ?? []);
    if (next.length !== this.list.length) return;
    this.list = next;
    if (current) this.index = next.indexOf(current);
    this.changed();
  }

  /** Puts these files in the place of every track, stopped at the first one: for a file that opens. */
  replace(paths: string[]) {
    this.pause();
    this.list = paths.map((path) => ({ path, name: nameOf(path) }));
    this.index = 0;
    this.loaded = null;
    this.error = null;
    this.changed();
    void this.measure();
  }

  clear() {
    this.pause();
    this.list = [];
    this.index = 0;
    this.loaded = null;
    this.error = null;
    this.changed();
  }
}

export const tracks = new TrackList();
