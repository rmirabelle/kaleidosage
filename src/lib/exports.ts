import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { snapshotFileName } from "./images";
import type { VideoFps, VideoQuality } from "./videoExport";

export type ExportKind = "png" | "mp4";

/** The folder of the last export, so the next save dialog starts there. */
const FOLDER_KEY = "kaleidosage.export-folder";

const FILTERS: Record<ExportKind, { name: string; extensions: string[] }> = {
  png: { name: "PNG image", extensions: ["png"] },
  mp4: { name: "MP4 video", extensions: ["mp4"] }
};

const TITLES: Record<ExportKind, string> = { png: "Save PNG", mp4: "Export Video" };

const folderOf = (path: string) => path.replace(/[\\/][^\\/]*$/, "");

/** A title as a Windows file name: no characters Windows forbids, no dots or spaces at the end, at most 120 characters. */
export const safeFileName = (title: string) => title
  .replace(/[<>:"/\\|?*\u0000-\u001f]/g, " ")
  .replace(/\s+/g, " ")
  .trim()
  .slice(0, 120)
  .replace(/[. ]+$/, "");

/**
 * Asks where to save an export. The dialog starts in the folder used last,
 * or in Pictures\Kaleido Sage. The file name is "title" when one is given,
 * else a dated name, with "suffix" before the extension. Returns null when
 * the user cancels.
 */
export async function chooseExportPath(kind: ExportKind, title = "", suffix = ""): Promise<string | null> {
  let folder: string | null = null;
  try { folder = localStorage.getItem(FOLDER_KEY); } catch { /* Remembering is a convenience only. */ }
  if (!folder) folder = await invoke<string>("default_export_folder").catch(() => null);
  const titled = safeFileName(title);
  const name = titled ? `${titled}${suffix}.${kind}` : snapshotFileName(new Date(), kind).replace(/(\.[^.]+)$/, `${suffix}$1`);
  let path = await save({ title: TITLES[kind], defaultPath: folder ? `${folder}\\${name}` : name, filters: [FILTERS[kind]] });
  if (!path) return null;
  if (!path.toLowerCase().endsWith(`.${kind}`)) path += `.${kind}`;
  try { localStorage.setItem(FOLDER_KEY, folderOf(path)); } catch { /* Remembering is a convenience only. */ }
  return path;
}

/** Asks for a folder for several videos. It starts in the folder used last, or in Pictures\Kaleido Sage. Returns null when the user cancels. */
export async function chooseExportFolder(): Promise<string | null> {
  let folder: string | null = null;
  try { folder = localStorage.getItem(FOLDER_KEY); } catch { /* Remembering is a convenience only. */ }
  if (!folder) folder = await invoke<string>("default_export_folder").catch(() => null);
  const picked = await open({ title: "Export Videos to Folder", directory: true, defaultPath: folder ?? undefined });
  if (typeof picked !== "string") return null;
  try { localStorage.setItem(FOLDER_KEY, picked); } catch { /* Remembering is a convenience only. */ }
  return picked;
}

/** Writes an export to the path the user picked. */
export async function writeExport(path: string, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("save_export", bytes, { headers: { path: encodeURIComponent(path) } });
}

/** The part of the WebView2 page interface that shares memory with the app. */
interface WebViewHost {
  addEventListener(type: "sharedbufferreceived", listener: (event: { getBuffer(): ArrayBuffer }) => void): void;
  removeEventListener(type: "sharedbufferreceived", listener: (event: { getBuffer(): ArrayBuffer }) => void): void;
  releaseBuffer(buffer: ArrayBuffer): void;
}

/** How long to wait for the app's shared memory before frames go the slow way, in milliseconds. */
const SHARED_FRAME_WAIT_MS = 3000;

/** The memory that the next begin_export shares with the page, or null when it does not come. */
function nextSharedBuffer(host: WebViewHost | undefined) {
  return new Promise<ArrayBuffer | null>((resolve) => {
    if (!host) return resolve(null);
    const done = (buffer: ArrayBuffer | null) => {
      host.removeEventListener("sharedbufferreceived", listener);
      window.clearTimeout(timeout);
      resolve(buffer);
    };
    const listener = (event: { getBuffer(): ArrayBuffer }) => done(event.getBuffer());
    const timeout = window.setTimeout(() => done(null), SHARED_FRAME_WAIT_MS);
    host.addEventListener("sharedbufferreceived", listener);
  });
}

/**
 * A video export that FFmpeg makes (Rust: export_stream.rs), so a long or
 * large video never has to fit in memory. "frame" is the memory it shares
 * with the app, or null. "writeFrame" gives FFmpeg one frame of plain pixels
 * and waits until it takes them: with "frame", the pixels must be in it.
 * "finish" waits for FFmpeg and keeps the file; "discard" removes it (a
 * stopped or failed export).
 */
export async function openExportFile(path: string, settings: { width: number; height: number; fps: VideoFps; quality: VideoQuality; spherical: boolean }) {
  const host = (window as unknown as { chrome?: { webview?: WebViewHost } }).chrome?.webview;
  const received = nextSharedBuffer(host);
  const id = await invoke<number>("begin_export", { path, ...settings });
  const buffer = await received;
  const headers = { "export-id": String(id) };
  const release = () => { if (buffer) host?.releaseBuffer(buffer); };
  return {
    frame: buffer ? new Uint8Array(buffer) : null,
    writeFrame: (pixels: Uint8Array) => buffer ? invoke<void>("write_shared_frame", { id }) : invoke<void>("write_export", pixels, { headers }),
    finish: () => invoke<void>("finish_export", { id, discard: false }).finally(release),
    discard: () => invoke<void>("finish_export", { id, discard: true }).catch(() => {}).finally(release)
  };
}

export type ExportFile = Awaited<ReturnType<typeof openExportFile>>;

/** The file name at the end of a path. */
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;
