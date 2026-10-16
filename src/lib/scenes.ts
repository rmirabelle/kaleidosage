import { invoke } from "@tauri-apps/api/core";
import { sceneImageToBlob, type SceneImage } from "../engine/scene";
import type { ImageSource } from "../engine/renderer";
import { loadImageBlob } from "./images";
import { isVideoType, loadVideoBlob, loadVideoId, type VideoFile } from "./videos";

/** An image or a video from a scene file, ready to use as an image source. */
export const loadSceneSource = (blob: Blob): Promise<ImageSource> =>
  isVideoType(blob.type) ? loadVideoBlob(blob) : loadImageBlob(blob);

/** Resolves either a legacy embedded blob or a native archive video stream. */
export async function loadSceneMedia(image: SceneImage): Promise<{ source: ImageSource; blob?: Blob; videoFile?: VideoFile }> {
  if (image.video !== undefined) {
    const loaded = await loadVideoId({ id: image.video, mime: image.type });
    return { source: loaded.video, videoFile: loaded.videoFile };
  }
  const blob = sceneImageToBlob(image);
  return { source: await loadSceneSource(blob), blob };
}

/**
 * Reads the scene metadata. Native code registers embedded videos for streaming;
 * their bytes stay in the scene file. Legacy JSON scenes still work.
 */
export async function readScene(path: string) {
  const bytes = await invoke<ArrayBuffer>("read_scene", { path });
  return new TextDecoder().decode(bytes);
}

/** Writes a scene file: the text goes as raw bytes, and the path, percent-encoded, in a header. */
export async function writeScene(path: string, contents: string) {
  await invoke("save_scene", new TextEncoder().encode(contents), { headers: { path: encodeURIComponent(path) } });
}
