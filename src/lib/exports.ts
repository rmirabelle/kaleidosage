import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { snapshotFileName } from "./images";

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
const safeFileName = (title: string) => title
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

/** Writes an export to the path the user picked. */
export async function writeExport(path: string, blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  await invoke("save_export", bytes, { headers: { path: encodeURIComponent(path) } });
}

/**
 * A video export written to disk while it is made (Rust: export_stream.rs),
 * so a long or large video never has to fit in memory. "write" sends a part
 * to its place in the file; the parts go one after the other. "flush"
 * waits for the parts sent so far and throws the first failure. "finish"
 * keeps the file; "discard" removes it (a stopped or failed export).
 * "spherical" marks the finished file as a 360 video.
 */
export async function openExportFile(path: string, spherical = false) {
  const id = await invoke<number>("begin_export", { path, spherical });
  let queue: Promise<void> = Promise.resolve();
  let failure: unknown = null;
  const flush = async () => {
    await queue;
    if (failure) throw failure;
  };
  return {
    write(data: Uint8Array, position: number) {
      /* A copy: the muxer may use its buffer again after this call. */
      const bytes = data.slice();
      queue = queue
        .then(() => invoke<void>("write_export", bytes, { headers: { "export-id": String(id), offset: String(position) } }))
        .catch((error: unknown) => { failure ??= error; });
    },
    flush,
    async finish() {
      await flush();
      await invoke("finish_export", { id, discard: false });
    },
    async discard() {
      await queue;
      await invoke("finish_export", { id, discard: true }).catch(() => {});
    }
  };
}

export type ExportFile = Awaited<ReturnType<typeof openExportFile>>;

/** The file name at the end of a path. */
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;
