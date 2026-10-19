import { Channel, invoke, isTauri } from "@tauri-apps/api/core";
import { AudioAnalyzer } from "../engine/audio";
import { tracks } from "./tracks";

/**
 * The sound source for settings that move with music (see docs/AUDIO.md):
 * an output device, whose sound is what the PC plays now, or an input
 * device, a microphone or a line-in (Rust: src-tauri/src/sound_capture.rs).
 * The source belongs to the app, not to a scene: it keeps running when
 * another scene tab is selected, so that scene reacts to the same sound at
 * once. The app always listens, from its start, unless the input is
 * "none": the PC sound costs little and shows nothing in Windows. A
 * microphone records only when the user picks it, because Windows then
 * shows its "microphone in use" icon, and a Bluetooth headset switches to
 * call quality. A third kind of input is the tracks (see tracks.ts):
 * the app plays audio files itself, and analyzes what it plays. The
 * settings here are kept in localStorage.
 */

/** "output": the sound that the PC plays on that device. "input": a microphone or line-in. */
export type DeviceKind = "output" | "input";
/** What the app listens to: a device, the tracks, or nothing. */
export type InputKind = DeviceKind | "tracks" | "none";

export interface SoundDevice {
  id: string;
  name: string;
  kind: DeviceKind;
  /** The Windows default device of its kind. */
  default: boolean;
}

interface CaptureInfo {
  sampleRate: number;
  deviceName: string;
}

/** A change from the capture thread after the start (see CaptureStatus in pc_audio.rs). */
type CaptureStatus = ({ kind: "open" } & CaptureInfo) | { kind: "error"; message: string };

export type AudioStatus =
  | { state: "off" }
  | { state: "starting" }
  | ({ state: "on" } & CaptureInfo)
  | { state: "error"; message: string };

export interface AudioSettings {
  /** The kind of source: the PC sound of an output device, an input device, or none (the app does not listen). */
  kind: InputKind;
  /** The device's id, or null for the Windows default device of "kind" (followed when Windows changes it). */
  device: string | null;
  /** See AudioAnalyzer.gainDb. */
  gainDb: number;
  /** See AudioAnalyzer.thresholdDb. */
  thresholdDb: number;
}

const STORE_KEY = "kaleidosage.audio";
/** At first the app listens to the PC sound of the default output device. */
const DEFAULTS: AudioSettings = { kind: "output", device: null, gainDb: 0, thresholdDb: -40 };
/** The Gain and Threshold sliders' limits, in dB. */
export const GAIN_DB: readonly [number, number] = [-24, 24];
export const THRESHOLD_DB: readonly [number, number] = [-60, 0];
const within = (value: unknown, [low, high]: readonly [number, number], fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.min(high, Math.max(low, value)) : fallback;

/**
 * Dev only: a hot update of this file would make a second listener next to
 * the first. Edits here reload the window instead, as midi.ts does.
 */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

function loadSettings(): AudioSettings {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as Partial<AudioSettings>;
    return {
      /* Settings from before input devices had output devices only; settings from before "none" had an on switch, which the app no longer has. */
      kind: saved.kind === "input" || saved.kind === "tracks" || saved.kind === "none" ? saved.kind
        /* The tracks were first named "playlist". */
        : (saved.kind as string) === "playlist" ? "tracks" : "output",
      device: typeof saved.device === "string" ? saved.device : null,
      /* The old "gain" (a multiplier on a level with auto gain) has no meaning in dB, so it is dropped. */
      gainDb: within(saved.gainDb, GAIN_DB, DEFAULTS.gainDb),
      thresholdDb: within(saved.thresholdDb, THRESHOLD_DB, DEFAULTS.thresholdDb)
    };
  } catch {
    return { ...DEFAULTS };
  }
}

class AudioInput {
  /** The analyzer of the running source; null while nothing listens. Its levels change with each block of samples. */
  analyzer: AudioAnalyzer | null = null;
  status: AudioStatus = { state: "off" };
  devices: SoundDevice[] = [];
  settings = loadSettings();
  /** Goes up with each change, for useSyncExternalStore. */
  version = 0;
  private readonly listeners = new Set<() => void>();
  /** A start or stop makes the samples and answers of an earlier start count for nothing. */
  private generation = 0;
  private started = false;

  /** Calls the listener after each change of status, devices or settings. Returns a function that removes it. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  private save() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(this.settings)); } catch { /* The settings go back to the defaults at the next start. */ }
  }

  /**
   * A new analyzer, for a source with this sample rate. Every listener hears
   * of it at once: the engine keeps its own pointer to the analyzer (see
   * Engine.audio), and a new analyzer that it did not hear of left every
   * audio link still while the meters moved (the tracks at 44.1 kHz, which
   * replace the first analyzer, made for 48 kHz, when the player starts).
   */
  private makeAnalyzer(sampleRate: number) {
    const analyzer = new AudioAnalyzer(sampleRate);
    analyzer.gainDb = this.settings.gainDb;
    analyzer.thresholdDb = this.settings.thresholdDb;
    this.analyzer = analyzer;
    this.changed();
  }

  /** Once, at the app's start: starts listening to the saved input, and reads the device list. */
  init() {
    if (this.started || !isTauri()) return;
    this.started = true;
    void this.refreshDevices();
    if (this.settings.kind !== "none") void this.start();
  }

  private async start() {
    const { kind, device } = this.settings;
    if (kind === "none") return;
    const generation = ++this.generation;
    this.analyzer = null;
    if (kind === "tracks") {
      await this.listenToTracks();
      return;
    }
    /* Another input than the tracks: the music stops, and the analysis no longer follows it. */
    tracks.onSamples = null;
    tracks.pause();
    this.status = { state: "starting" };
    this.changed();
    if (!isTauri()) {
      this.status = { state: "error", message: "Sound capture needs the Kaleido Sage app; a browser cannot do it here." };
      this.changed();
      return;
    }
    const samples = new Channel<ArrayBuffer>((buffer) => {
      if (generation === this.generation) this.analyzer?.push(new Float32Array(buffer));
    });
    const status = new Channel<CaptureStatus>((message) => {
      if (generation !== this.generation) return;
      if (message.kind === "open") {
        /* The stream opened again, maybe on a new device with another sample rate. */
        if (this.analyzer?.sampleRate !== message.sampleRate) this.makeAnalyzer(message.sampleRate);
        this.status = { state: "on", sampleRate: message.sampleRate, deviceName: message.deviceName };
      } else {
        this.status = { state: "error", message: message.message };
      }
      this.changed();
    });
    try {
      const info = await invoke<CaptureInfo>("sound_start", { device, kind, samples, status });
      if (generation !== this.generation) return;
      this.makeAnalyzer(info.sampleRate);
      this.status = { state: "on", ...info };
      /* Dev only: the dev log shows each start, with the device and its sample rate. */
      import.meta.hot?.send("kaleidosage:log", { message: `[audio] listening to ${info.deviceName} (${kind}) at ${info.sampleRate} Hz` });
    } catch (error) {
      if (generation !== this.generation) return;
      this.status = { state: "error", message: String(error) };
    }
    this.changed();
  }

  /**
   * The tracks as the input: the device capture stops, and the analysis
   * follows the music that the tracks play. The sample rate is known
   * only once the player starts, so the analyzer is made again if it
   * differs.
   */
  private async listenToTracks() {
    this.makeAnalyzer(tracks.sampleRate);
    tracks.onSamples = (samples) => {
      if (this.analyzer?.sampleRate !== tracks.sampleRate) this.makeAnalyzer(tracks.sampleRate);
      this.analyzer?.push(samples);
    };
    this.status = { state: "on", sampleRate: tracks.sampleRate, deviceName: "Files" };
    this.changed();
    if (isTauri()) await invoke("sound_stop").catch(() => { /* The capture thread ends with the app. */ });
  }

  private async stop() {
    this.generation++;
    this.analyzer = null;
    tracks.onSamples = null;
    tracks.pause();
    this.status = { state: "off" };
    this.changed();
    if (isTauri()) await invoke("sound_stop").catch(() => { /* The capture thread ends with the app. */ });
  }

  /** The input to listen to: a kind of device and an id from the device list, or null for that kind's default; the tracks; or "none", which stops listening. */
  setSource(kind: InputKind, device: string | null) {
    this.settings = { ...this.settings, kind, device: kind === "output" || kind === "input" ? device : null };
    this.save();
    void (kind === "none" ? this.stop() : this.start());
  }

  /**
   * Takes the audio settings of a playlist that opens. A device that this
   * PC does not have (a playlist from another PC) becomes the default
   * device of its kind.
   */
  async applySettings(next: Partial<Pick<AudioSettings, "kind" | "device" | "gainDb" | "thresholdDb">>) {
    await this.refreshDevices();
    const merged = { ...this.settings, ...next };
    if (merged.device !== null && !this.devices.some((device) => device.id === merged.device)) merged.device = null;
    merged.gainDb = within(merged.gainDb, GAIN_DB, DEFAULTS.gainDb);
    merged.thresholdDb = within(merged.thresholdDb, THRESHOLD_DB, DEFAULTS.thresholdDb);
    const restart = merged.kind !== this.settings.kind || merged.device !== this.settings.device;
    this.settings = merged;
    this.save();
    if (this.analyzer) Object.assign(this.analyzer, { gainDb: merged.gainDb, thresholdDb: merged.thresholdDb });
    if (!restart) this.changed();
    else void (merged.kind === "none" ? this.stop() : this.start());
  }

  setGain(gainDb: number) {
    this.settings = { ...this.settings, gainDb };
    if (this.analyzer) this.analyzer.gainDb = gainDb;
    this.save();
    this.changed();
  }

  setThreshold(thresholdDb: number) {
    this.settings = { ...this.settings, thresholdDb };
    if (this.analyzer) this.analyzer.thresholdDb = thresholdDb;
    this.save();
    this.changed();
  }


  async refreshDevices() {
    if (!isTauri()) return;
    try {
      this.devices = await invoke<SoundDevice[]>("sound_devices");
    } catch {
      this.devices = [];
    }
    this.changed();
  }
}

export const audioInput = new AudioInput();
