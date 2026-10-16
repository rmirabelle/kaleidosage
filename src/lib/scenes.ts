import { invoke } from "@tauri-apps/api/core";
import type { ImageSource } from "../engine/renderer";
import { loadImageBlob } from "./images";
import { isVideoType, loadVideoBlob } from "./videos";

/** An image or a video from a scene file, ready to use as an image source. */
export const loadSceneSource = (blob: Blob): Promise<ImageSource> =>
  isVideoType(blob.type) ? loadVideoBlob(blob) : loadImageBlob(blob);

/**
 * Reads a scene file. Its text comes as raw bytes, which is much faster than
 * a string for a scene that holds a large video.
 */
export async function readScene(path: string) {
  const bytes = await invoke<ArrayBuffer>("read_scene", { path });
  return new TextDecoder().decode(bytes);
}

/** Writes a scene file: the text goes as raw bytes, and the path, percent-encoded, in a header. */
export async function writeScene(path: string, contents: string) {
  await invoke("save_scene", new TextEncoder().encode(contents), { headers: { path: encodeURIComponent(path) } });
}
