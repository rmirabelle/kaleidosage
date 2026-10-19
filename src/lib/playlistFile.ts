import { invoke } from "@tauri-apps/api/core";
import type { AudioSettings } from "./audioInput";

/**
 * A playlist file (.ksplaylist) holds a whole show, so it can move to
 * another PC as one file (see docs/AUDIO.md, part 8): the open scenes in
 * tab order, the tracks, and the audio settings. The scene and audio files
 * go inside it (Rust: src-tauri/src/playlist_archive.rs); this is the part
 * the app writes and reads, playlist.json.
 */

export const PLAYLIST_EXTENSION = "ksplaylist";
const PLAYLIST_VERSION = 1;

/** The audio settings that a playlist keeps: what the app listens to and how. */
export type PlaylistAudio = Pick<AudioSettings, "kind" | "device" | "gainDb" | "thresholdDb">;

export interface PlaylistManifest {
  audio: PlaylistAudio;
  /** The tab that was selected when the playlist was saved (0 is the first). */
  activeScene: number;
}

/** playlist.json, without the scene and track entries, which the Rust side adds. */
export function writeManifest({ audio, activeScene }: PlaylistManifest): string {
  return JSON.stringify({ app: "KaleidoSage", kind: "playlist", version: PLAYLIST_VERSION, audio, activeScene });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads playlist.json. Each audio setting that is missing or broken is left
 * out, so the app keeps its own; a playlist from a newer version still
 * opens.
 */
export function readManifest(text: string): { audio: Partial<PlaylistAudio>; activeScene: number } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file is not a Kaleido Sage playlist.");
  }
  if (!isRecord(parsed) || parsed.app !== "KaleidoSage" || parsed.kind !== "playlist") throw new Error("The file is not a Kaleido Sage playlist.");
  const saved = isRecord(parsed.audio) ? parsed.audio : {};
  const audio: Partial<PlaylistAudio> = {};
  if (saved.kind === "output" || saved.kind === "input" || saved.kind === "tracks" || saved.kind === "none") audio.kind = saved.kind;
  if (typeof saved.device === "string" || saved.device === null) audio.device = saved.device;
  /* A beat sensitivity from playlists before automatic beats is left out. */
  for (const key of ["gainDb", "thresholdDb"] as const) {
    const value = saved[key];
    if (typeof value === "number" && Number.isFinite(value)) audio[key] = value;
  }
  const activeScene = typeof parsed.activeScene === "number" && Number.isInteger(parsed.activeScene) && parsed.activeScene >= 0 ? parsed.activeScene : 0;
  return { audio, activeScene };
}

/**
 * A short text that changes when anything the playlist file keeps changes:
 * the scene files in tab order, the tracks, and the audio settings. The
 * scenes' own changes are not part of it: each scene has its own unsaved
 * mark.
 */
export function playlistFingerprint(scenes: readonly string[], tracks: readonly string[], audio: PlaylistAudio): string {
  const { kind, device, gainDb, thresholdDb } = audio;
  return JSON.stringify([scenes, tracks, kind, device, gainDb, thresholdDb]);
}

/** Writes the playlist file: the manifest, then a copy of each scene and audio file. */
export const savePlaylistFile = (path: string, manifest: PlaylistManifest, scenes: string[], tracks: string[]) =>
  invoke("save_playlist", { path, manifest: writeManifest(manifest), scenes, tracks });

/** Unpacks a playlist file into a temp folder: its manifest, and the unpacked scene and audio files. */
export const openPlaylistFile = (path: string) =>
  invoke<{ manifest: string; scenes: string[]; tracks: string[] }>("open_playlist", { path });
