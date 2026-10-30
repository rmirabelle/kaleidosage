import { invoke, isTauri } from "@tauri-apps/api/core";

/**
 * Where the app plays its audio files (the tracks, see tracks.ts): the
 * Windows default device, or one speaker. For a stream to another room,
 * the files play to a virtual cable that the stream sends on, and the PC's
 * other sounds stay on the default device. The webview names its speakers
 * only while the page may use the microphone, so the list first asks Rust
 * for that permission (see output_choice.rs); the page still records
 * nothing. The pick is kept by its name in localStorage, because the
 * webview's speaker ids change with the page's address (the dev app and
 * the installed app have different ones).
 */

export interface Speaker {
  /** The webview's id for the speaker, for AudioContext.setSinkId. */
  id: string;
  name: string;
}

/** AudioContext.setSinkId, which TypeScript's DOM types do not have yet. */
type SinkContext = AudioContext & { setSinkId?: (sinkId: string) => Promise<void> };

const STORE_KEY = "kaleidosage.output";
/** The webview's own entries for the default devices, which the list leaves out: the menu has its own Default choice. */
const DEFAULT_IDS = new Set(["default", "communications"]);

/**
 * Dev only: a hot update of this file would make a second list next to the
 * first. Edits here reload the window instead, as midi.ts does.
 */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

function loadDevice(): string | null {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "{}") as { device?: unknown };
    return typeof saved.device === "string" ? saved.device : null;
  } catch {
    return null;
  }
}

class AudioOutput {
  /** The picked speaker's name, or null for the Windows default device. */
  device = loadDevice();
  speakers: Speaker[] = [];
  /** The last failure, for example a picked speaker that is not connected. */
  error: string | null = null;
  /** Goes up with each change, for useSyncExternalStore. */
  version = 0;
  private readonly listeners = new Set<() => void>();
  private allowed: Promise<void> | null = null;
  /** The tracks' audio context, once the player is made. */
  private context: SinkContext | null = null;
  private watching = false;

  /** Calls the listener after each change of the pick, the list or the error. Returns a function that removes it. */
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  /** The permission that names the speakers (see output_choice.rs), asked once per run. */
  private allow() {
    this.allowed ??= (isTauri() ? invoke<void>("allow_output_choice", { origin: window.location.origin }) : Promise.resolve())
      .catch((error: unknown) => {
        this.allowed = null;
        throw error;
      });
    return this.allowed;
  }

  /** Reads the speaker list again; a speaker that is plugged in or out reads it too. */
  async refresh() {
    try {
      await this.allow();
      const devices = await navigator.mediaDevices.enumerateDevices();
      this.speakers = devices
        .filter((device) => device.kind === "audiooutput" && device.label && !DEFAULT_IDS.has(device.deviceId))
        .map((device) => ({ id: device.deviceId, name: device.label }));
      this.error = null;
    } catch (error) {
      this.speakers = [];
      this.error = `Could not list the speakers. ${error instanceof Error ? error.message : String(error)}`;
    }
    if (!this.watching) {
      this.watching = true;
      navigator.mediaDevices.addEventListener("devicechange", () => { void this.refresh().then(() => this.apply()); });
    }
    this.changed();
  }

  /** The tracks' audio context (see tracks.ts): the pick applies to it now and at each change. */
  async attach(context: AudioContext) {
    this.context = context;
    await this.apply();
  }

  /** Plays the files on this speaker (a name from the list), or on the Windows default device (null). */
  async set(device: string | null) {
    this.device = device;
    try { localStorage.setItem(STORE_KEY, JSON.stringify({ device })); } catch { /* The pick goes back to the default device at the next start. */ }
    this.changed();
    await this.apply();
  }

  /** Sends the context's sound to the picked speaker. A picked speaker that is not connected leaves the sound on the default device. */
  private async apply() {
    const context = this.context;
    if (!context) return;
    let id = "";
    if (this.device !== null) {
      if (!this.speakers.some((speaker) => speaker.name === this.device)) await this.refresh();
      id = this.speakers.find((speaker) => speaker.name === this.device)?.id ?? "";
    }
    try {
      if (!context.setSinkId) throw new Error("This webview cannot pick a speaker.");
      await context.setSinkId(id);
      this.error = this.device !== null && !id ? `${this.device} is not connected, so the files play on the default device.` : null;
    } catch (error) {
      this.error = `Could not play to ${this.device ?? "the default device"}. ${error instanceof Error ? error.message : String(error)}`;
    }
    this.changed();
  }
}

export const audioOutput = new AudioOutput();
