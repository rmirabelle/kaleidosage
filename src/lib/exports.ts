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
 * else a dated name. Returns null when the user cancels.
 */
export async function chooseExportPath(kind: ExportKind, title = ""): Promise<string | null> {
  let folder: string | null = null;
  try { folder = localStorage.getItem(FOLDER_KEY); } catch { /* Remembering is a convenience only. */ }
  if (!folder) folder = await invoke<string>("default_export_folder").catch(() => null);
  const titled = safeFileName(title);
  const name = titled ? `${titled}.${kind}` : snapshotFileName(new Date(), kind);
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

/** The file name at the end of a path. */
export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;
