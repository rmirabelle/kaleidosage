import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";
import type { VideoFile } from "./videos";

/**
 * The tracks (see docs/AUDIO.md, part 7): audio files that the app plays
 * itself, through the speakers, one after the other, and round again. The
 * same sound goes to the analysis: an AudioWorklet tap mixes it to mono
 * and posts it in blocks to "onSamples". The paths are kept in
 * localStorage; the app does not play music at its start.
 */

export interface Track {
  path: string;
  name: string;
}

/** Why the track changed: it ended, or the user went to another track. Each change moves the show to the next scene. */
export type TrackChange = "ended" | "next" | "previous" | "picked";

const STORE_KEY = "kaleidosage.tracks";
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

function loadTracks(): Track[] {
  try {
    /* The tracks were first kept under "kaleidosage.playlist". */
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? localStorage.getItem("kaleidosage.playlist") ?? "[]") as unknown;
    return Array.isArray(saved) ? saved.filter((path): path is string => typeof path === "string").map((path) => ({ path, name: nameOf(path) })) : [];
  } catch {
    return [];
  }
}

class TrackList {
  list: Track[] = loadTracks();
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
  private context: AudioContext | null = null;
  private audio: HTMLAudioElement | null = null;
  private ready: Promise<void> | null = null;
  /** The track the audio element holds, so Play goes on from where it paused. */
  private loaded: string | null = null;

  /** The sample rate of the samples that onSamples gets. */
  get sampleRate() {
    return this.context?.sampleRate ?? 48000;
  }

  /** Seconds into the track, and the track's length (0 until it is known). */
  get position() {
    return this.audio?.currentTime ?? 0;
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

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.list.map((track) => track.path))); } catch { /* The track list is empty at the next start. */ }
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
      audio.addEventListener("loadedmetadata", () => this.changed());
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

  async play() {
    try {
      await this.setup();
      if (!(await this.load())) return;
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

  /** Stop: pauses and goes back to the start of the track. */
  stop() {
    this.pause();
    if (this.audio) this.audio.currentTime = 0;
    this.changed();
  }

  seek(seconds: number) {
    if (this.audio) this.audio.currentTime = Math.max(0, Math.min(this.duration, seconds));
    this.changed();
  }

  /** Goes to another track and plays it; the track list goes round at both ends. */
  private go(index: number, why: TrackChange) {
    if (this.list.length === 0) return;
    this.index = ((index % this.list.length) + this.list.length) % this.list.length;
    /* The same file again (a list of one track) starts at its beginning. */
    this.loaded = null;
    for (const listener of this.trackListeners) listener(this.index, why);
    void this.play();
  }

  private step(by: 1 | -1, why: TrackChange) {
    this.go(this.index + by, why);
  }

  next() {
    this.step(1, "next");
  }

  /** Previous: back to the start of this track when it has played a few seconds, else the track before. */
  previous() {
    if (this.position > 3) {
      this.seek(0);
      return;
    }
    this.step(-1, "previous");
  }

  playTrack(index: number) {
    this.go(index, "picked");
  }

  /** Adds files at the end of the track list; a file that is in it already is not added twice. */
  add(paths: string[]) {
    const known = new Set(this.list.map((track) => track.path.toLowerCase()));
    for (const path of paths) {
      if (known.has(path.toLowerCase())) continue;
      known.add(path.toLowerCase());
      this.list.push({ path, name: nameOf(path) });
    }
    this.save();
    this.changed();
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
    this.save();
    this.changed();
  }

  /** Puts these files in the place of every track, stopped at the first one: for a playlist that opens. */
  replace(paths: string[]) {
    this.pause();
    this.list = paths.map((path) => ({ path, name: nameOf(path) }));
    this.index = 0;
    this.loaded = null;
    this.error = null;
    this.save();
    this.changed();
  }

  clear() {
    this.pause();
    this.list = [];
    this.index = 0;
    this.loaded = null;
    this.save();
    this.changed();
  }
}

export const tracks = new TrackList();
