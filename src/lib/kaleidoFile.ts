import { invoke } from "@tauri-apps/api/core";
import type { AudioSettings } from "./audioInput";

/**
 * A Kaleido Sage file (.ksage) holds one or more scenes, and the tracks of a
 * show, so it can move to another PC as one file (see docs/ONE-FILE.md): the
 * scenes in tab order, the tracks, and the audio settings. The scene and
 * audio files go inside it (Rust: src-tauri/src/file_archive.rs); this is
 * the part the app writes and reads, kaleidosage.json.
 */

export const FILE_EXTENSION = "ksage";

/**
 * True for a file that is the open file's own copy of a scene or a track:
 * in a folder that the app made in the temp folder (see file_archive.rs).
 * Save writes such a scene copy in place; any other scene gets a new copy
 * first, so a file on disk never changes but the open file.
 */
export const isFileCopy = (path: string | null) => path !== null && /[\\/]kaleidosage-file-[^\\/]+[\\/]/i.test(path);
const FILE_VERSION = 1;

/** The audio settings that a file keeps: what the app listens to and how. */
export type FileAudio = Pick<AudioSettings, "kind" | "device" | "gainDb" | "thresholdDb">;

export interface FileManifest {
  audio: FileAudio;
  /** The tab that was selected when the file was saved (0 is the first). */
  activeScene: number;
  /** The Files column width, in px (see panelLayout.ts). */
  filesWidth?: number;
  /** Each track's length in seconds, in track order (null when not known), for the Open dialog. */
  trackSeconds?: (number | null)[];
  /** True when Song follow was on at the save (see songFollow.ts): the file opens with it on. */
  songFollow?: boolean;
}

/** kaleidosage.json, without the scene and track entries, which the Rust side adds. */
export function writeManifest({ audio, activeScene, filesWidth, trackSeconds, songFollow }: FileManifest): string {
  return JSON.stringify({ app: "KaleidoSage", kind: "file", version: FILE_VERSION, audio, activeScene, ...(filesWidth ? { layout: { filesWidth } } : {}), ...(trackSeconds ? { trackSeconds } : {}), ...(songFollow !== undefined ? { songFollow } : {}) });
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * Reads kaleidosage.json. Each audio setting that is missing or broken is
 * left out, so the app keeps its own; a file from a newer version still
 * opens.
 */
export function readManifest(text: string): { audio: Partial<FileAudio>; activeScene: number; filesWidth?: number; trackSeconds?: (number | null)[]; songFollow?: boolean } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("The file is not a Kaleido Sage file.");
  }
  if (!isRecord(parsed) || parsed.app !== "KaleidoSage" || parsed.kind !== "file") throw new Error("The file is not a Kaleido Sage file.");
  const saved = isRecord(parsed.audio) ? parsed.audio : {};
  const audio: Partial<FileAudio> = {};
  if (saved.kind === "output" || saved.kind === "input" || saved.kind === "tracks" || saved.kind === "none") audio.kind = saved.kind;
  if (typeof saved.device === "string" || saved.device === null) audio.device = saved.device;
  for (const key of ["gainDb", "thresholdDb"] as const) {
    const value = saved[key];
    if (typeof value === "number" && Number.isFinite(value)) audio[key] = value;
  }
  const activeScene = typeof parsed.activeScene === "number" && Number.isInteger(parsed.activeScene) && parsed.activeScene >= 0 ? parsed.activeScene : 0;
  const filesWidth = isRecord(parsed.layout) ? parsed.layout.filesWidth : undefined;
  const trackSeconds = Array.isArray(parsed.trackSeconds)
    ? parsed.trackSeconds.map((seconds) => typeof seconds === "number" && Number.isFinite(seconds) && seconds > 0 ? seconds : null)
    : undefined;
  return {
    audio,
    activeScene,
    ...(typeof filesWidth === "number" && filesWidth > 0 ? { filesWidth } : {}),
    ...(trackSeconds ? { trackSeconds } : {}),
    ...(typeof parsed.songFollow === "boolean" ? { songFollow: parsed.songFollow } : {})
  };
}

/**
 * A short text that changes when anything the file keeps changes, but the
 * scenes' own settings: the scene files in tab order, the tracks, the audio
 * settings and the Files column width. Each scene has its own check.
 */
export function fileFingerprint(scenes: readonly string[], tracks: readonly string[], audio: FileAudio, filesWidth?: number): string {
  const { kind, device, gainDb, thresholdDb } = audio;
  return JSON.stringify([scenes, tracks, kind, device, gainDb, thresholdDb, filesWidth ?? null]);
}

/**
 * Writes the file: the manifest, then a copy of each scene and audio file,
 * and each track's song analysis (JSON, or null; see songFollow.ts), in
 * track order.
 */
export const saveKaleidoFile = (path: string, manifest: FileManifest, scenes: string[], tracks: string[], analyses: (string | null)[] = []) =>
  invoke("save_file", { path, manifest: writeManifest(manifest), scenes, tracks, analyses });

/** What the Open dialog shows of a file, read without unpacking it (Rust: read_file_summary). */
export interface FileSummary {
  /** The audio settings, as kaleidosage.json has them (see readManifest). */
  audio: Partial<FileAudio> | null;
  /** Each scene's and track's file name and size, in order; a track also has its length in seconds, or null. */
  scenes: { name: string; bytes: number; seconds: number | null }[];
  tracks: { name: string; bytes: number; seconds: number | null }[];
}

export const readFileSummary = (path: string) => invoke<FileSummary>("read_file_summary", { path });

/**
 * True for a show: a file with two or more scenes, or with audio files. Open
 * puts a show in place of the open file; a file with one scene and no audio
 * files is a single scene, which goes into the open file (see docs/ONE-FILE.md).
 */
export const isShow = (summary: Pick<FileSummary, "scenes" | "tracks">) => summary.scenes.length >= 2 || summary.tracks.length > 0;

/**
 * Unpacks a file into a temp folder: its manifest, the unpacked scene and
 * audio files, and each track's song analysis (JSON, or null). The temp
 * folders of files opened before go first, unless "keepOthers" is set (a
 * single scene that goes into the open file, whose copies are there).
 */
export const openKaleidoFile = (path: string, { keepOthers = false }: { keepOthers?: boolean } = {}) =>
  invoke<{ manifest: string; scenes: string[]; tracks: string[]; analyses: (string | null)[] }>("open_file", { path, keepOthers });

/**
 * Import Scene(s): for each unpacked scene in "candidates", the index of the
 * first scene file in "existing" (the open project's saved scene copies)
 * with the same bytes, or null (Rust: matching_scenes).
 */
export const matchingScenes = (candidates: string[], existing: string[]) => invoke<(number | null)[]>("matching_scenes", { candidates, existing });

/** Reads the scene at "index" of a file in place, as readScene reads a scene file (see lib/scenes.ts): for the Open dialog's preview. */
export async function readFileScene(path: string, index = 0) {
  const bytes = await invoke<ArrayBuffer>("read_file_scene", { path, index });
  return new TextDecoder().decode(bytes);
}
