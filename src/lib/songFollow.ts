import { compileScript, type SongScript } from "../engine/songScript";
import { analyzeSong } from "./songAnalysis";
import { SongClock } from "./songClock";
import { tracks } from "./tracks";

/**
 * Follow the song (phase 1 of reports/Intelligent music driven
 * animation.md): while it is on and the tracks are the input, the app
 * analyzes the track that plays (see songAnalysis.ts) and the picture
 * follows its script (see engine/songScript.ts). Each track is analyzed
 * once per run of the app. The switch is off at each start of the app.
 */

export type FollowStatus =
  | { state: "off" }
  | { state: "analyzing"; name: string }
  | { state: "ready"; name: string; tempo: number }
  | { state: "error"; message: string };

/** Dev only: a hot update would make a second store next to the first. Edits here reload the window instead. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

class SongFollow {
  enabled = false;
  status: FollowStatus = { state: "off" };
  /** The script of the track that plays, once its analysis is done. */
  script: SongScript | null = null;
  /** Goes up with each change, for useSyncExternalStore. */
  version = 0;
  readonly clock = new SongClock(() => ({ position: tracks.position, playing: tracks.playing, latency: tracks.latency }));
  private readonly listeners = new Set<() => void>();
  /** Each track's script, by path, analyzed once. */
  private readonly scripts = new Map<string, Promise<SongScript>>();
  /** The track the script is for, or is being made for. */
  private path: string | null = null;

  constructor() {
    /* After the module has loaded, so tracks is ready. */
    queueMicrotask(() => {
      tracks.subscribe(() => this.update());
      this.update();
    });
  }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  private changed() {
    this.version++;
    for (const listener of this.listeners) listener();
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.update(true);
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  /** Makes the script of the current track, or clears it when Follow is off or no track is there. "again": also for the same track (the switch changed). */
  private update(again = false) {
    const track = tracks.current;
    const path = this.enabled ? track?.path ?? null : null;
    if (path === this.path && !again) return;
    this.path = path;
    this.script = null;
    if (!path || !track) {
      this.status = { state: "off" };
      this.changed();
      return;
    }
    this.status = { state: "analyzing", name: track.name };
    this.changed();
    let made = this.scripts.get(path);
    if (!made) {
      made = analyzeSong(path).then(compileScript);
      this.scripts.set(path, made);
      /* A failed analysis is tried again the next time the track plays. */
      made.catch(() => this.scripts.delete(path));
    }
    made.then(
      (script) => {
        if (this.path !== path) return;
        this.script = script;
        this.status = { state: "ready", name: track.name, tempo: script.tempo };
        this.changed();
      },
      (error: unknown) => {
        if (this.path !== path) return;
        this.status = { state: "error", message: `Could not analyze ${track.name}. ${error instanceof Error ? error.message : String(error)}` };
        this.changed();
      }
    );
  }
}

export const songFollow = new SongFollow();
