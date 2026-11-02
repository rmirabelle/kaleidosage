import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/**
 * The files that the song analysis needs (src-tauri/src/song_models.rs).
 * The app downloads them the first time it analyzes a song; after that
 * ensure does nothing. "progress" says how far a download is, for the Song
 * Map and the Follow button.
 */

export interface ModelProgress {
  downloaded: number;
  total: number;
}

/** Dev only: a hot update would make a second store next to the first. Edits here reload the window instead. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

class SongModels {
  /** How far the download is, or null while no download runs. */
  progress: ModelProgress | null = null;
  private readonly listeners = new Set<() => void>();
  /** The call that runs, which the tracks analyzed at the same time share. */
  private running: Promise<void> | null = null;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  };

  /** Settles when the files are in place. It rejects when a download fails; the next call tries again. */
  ensure() {
    this.running ??= this.fetch().finally(() => { this.running = null; });
    return this.running;
  }

  private show(progress: ModelProgress | null) {
    this.progress = progress;
    for (const listener of this.listeners) listener();
  }

  private async fetch() {
    const stop = await listen<ModelProgress>("song-models-progress", (event) => this.show(event.payload));
    try {
      await invoke("ensure_song_models");
    } finally {
      stop();
      this.show(null);
    }
  }
}

export const songModels = new SongModels();

/** Bytes as whole megabytes, as Windows shows a file's size. */
export const megabytes = (bytes: number) => Math.round(bytes / (1024 * 1024));
