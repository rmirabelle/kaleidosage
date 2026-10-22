import { compileScript, type SongAnalysis, type SongScript } from "../engine/songScript";
import { ANALYSIS_VERSION, analyzeSong } from "./songAnalysis";
import { SongClock } from "./songClock";
import { tracks } from "./tracks";

/**
 * Follow the song (phase 1 of reports/Intelligent music driven
 * animation.md): while it is on and the tracks are the input, the app
 * analyzes the track that plays (see songAnalysis.ts) and the picture
 * follows its script (see engine/songScript.ts). The other tracks are then
 * analyzed in the background, one at a time, so each song is ready before
 * it plays. Each track is analyzed once; a playlist file keeps its tracks'
 * analyses (see preload and analysisText), so an opened playlist needs
 * none. The switch is off at each start of the app.
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
  /** Each track's script, by path, made once. */
  private readonly scripts = new Map<string, Promise<SongScript>>();
  /** Each track's analysis, by path, once it is made or loaded: what a playlist saves (see analysisText). */
  private readonly analyses = new Map<string, SongAnalysis>();
  /** Tracks whose analysis failed: the background pass leaves them; playing one tries again. */
  private readonly failed = new Set<string>();
  /** The track the script is for, or is being made for. */
  private path: string | null = null;
  /** True while the background pass runs (see prepareAll). */
  private preparing = false;

  constructor() {
    /* After the module has loaded, so tracks is ready. */
    queueMicrotask(() => {
      tracks.subscribe(() => {
        this.update();
        void this.prepareAll();
      });
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
    this.failed.clear();
    this.update(true);
    void this.prepareAll();
  }

  toggle() {
    this.setEnabled(!this.enabled);
  }

  /** How many of these tracks have an analysis: for the status line, and for a playlist's unsaved mark (see App's playlistNow). */
  analyzedCount(paths: readonly string[]) {
    return paths.filter((path) => this.analyses.has(path)).length;
  }

  /** A track's analysis as JSON, for a playlist file, or null when it has none. */
  analysisText(path: string) {
    const analysis = this.analyses.get(path);
    return analysis ? JSON.stringify(analysis) : null;
  }

  /**
   * Takes a track's analysis from a playlist file (see analysisText). One
   * from another version of the analysis, or one that cannot be read, is
   * left out: the track is analyzed again.
   */
  preload(path: string, text: string) {
    try {
      const analysis = JSON.parse(text) as SongAnalysis;
      if (analysis?.version !== ANALYSIS_VERSION || !Array.isArray(analysis.beats) || !Array.isArray(analysis.sections)) return;
      this.analyses.set(path, analysis);
      this.scripts.set(path, Promise.resolve().then(() => compileScript(analysis)));
      this.changed();
    } catch { /* The track is analyzed again when needed. */ }
  }

  /** A track's script: made once, from its analysis. A failed analysis is tried again the next time it is asked for. */
  private scriptFor(path: string) {
    let made = this.scripts.get(path);
    if (!made) {
      made = analyzeSong(path).then((analysis) => {
        this.analyses.set(path, analysis);
        this.failed.delete(path);
        this.changed();
        return compileScript(analysis);
      });
      this.scripts.set(path, made);
      made.catch(() => {
        this.scripts.delete(path);
        this.failed.add(path);
      });
    }
    return made;
  }

  /**
   * While Follow is on, analyzes each track that has no analysis yet, one
   * at a time, in list order: the track that plays comes first (see
   * update), then the others, so each is ready before it plays.
   */
  private async prepareAll() {
    if (this.preparing) return;
    this.preparing = true;
    try {
      for (;;) {
        if (!this.enabled) return;
        const next = tracks.list.find((track) => !this.scripts.has(track.path) && !this.failed.has(track.path));
        if (!next) return;
        await this.scriptFor(next.path).catch(() => { /* Left for the track's own play (see failed). */ });
      }
    } finally {
      this.preparing = false;
    }
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
    this.scriptFor(path).then(
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
