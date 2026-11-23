import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

/** Upload to YouTube, through src-tauri/src/youtube.rs. */

export type Privacy = "private" | "unlisted" | "public";

export interface YouTubeStatus {
  /** This build has a Google key. */
  available: boolean;
  signedIn: boolean;
}

/** The error texts of youtube.rs that the page acts on. */
export const SIGN_IN_NEEDED = "SIGN_IN_NEEDED";
export const CANCELED = "CANCELED";

export const youtubeStatus = () => invoke<YouTubeStatus>("youtube_status");
export const youtubeSignIn = () => invoke<void>("youtube_sign_in");
export const youtubeSignOut = () => invoke<void>("youtube_sign_out");
export const youtubeCancel = () => invoke<void>("youtube_cancel");
export const youtubeOpen = (url: string) => invoke<void>("youtube_open", { url });
export const studioUrl = (id: string) => `https://studio.youtube.com/video/${encodeURIComponent(id)}/edit`;

/** Uploads a video and returns its YouTube id; "onProgress" gets 0 to 1. */
export async function youtubeUpload(request: { path: string; title: string; description: string; tags: string[]; privacy: Privacy }, onProgress: (fraction: number) => void) {
  const stop = await listen<{ sent: number; total: number }>("youtube-upload-progress", (event) => {
    const { sent, total } = event.payload;
    onProgress(total > 0 ? sent / total : 0);
  });
  try {
    return await invoke<string>("youtube_upload", { request });
  } finally {
    stop();
  }
}

/** YouTube takes thumbnails up to 2 MB; a larger PNG goes as a JPEG. */
const THUMBNAIL_LIMIT = 2 * 1024 * 1024;

/** Sets a video's thumbnail from an image file. */
export async function youtubeSetThumbnail(videoId: string, imagePath: string) {
  let bytes = new Uint8Array(await invoke<ArrayBuffer>("read_image_file", { path: imagePath }));
  for (const quality of [0.92, 0.85, 0.75]) {
    if (bytes.length <= THUMBNAIL_LIMIT) break;
    const bitmap = await createImageBitmap(new Blob([bytes]));
    const canvas = document.createElement("canvas");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0);
    bitmap.close();
    const jpeg = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (!jpeg) throw new Error("The thumbnail could not be made smaller.");
    bytes = new Uint8Array(await jpeg.arrayBuffer());
  }
  await invoke("youtube_set_thumbnail", bytes, { headers: { "video-id": videoId } });
}

/** The last exported video, and the thumbnail saved for each video, so the upload dialog opens with them. */
const LAST_VIDEO_KEY = "kaleidosage.last-video";
const THUMBNAILS_KEY = "kaleidosage.video-thumbnails";

export function rememberVideo(path: string) {
  try { localStorage.setItem(LAST_VIDEO_KEY, path); } catch { /* Remembering is a convenience only. */ }
}
export function lastVideo() {
  try { return localStorage.getItem(LAST_VIDEO_KEY); } catch { return null; }
}
const thumbnails = (): Record<string, string> => {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(THUMBNAILS_KEY) ?? "{}");
    return parsed && typeof parsed === "object" ? parsed as Record<string, string> : {};
  } catch {
    return {};
  }
};
export function rememberThumbnail(videoPath: string, imagePath: string) {
  /* Only the latest 50 videos are kept. */
  const kept = Object.entries({ ...thumbnails(), [videoPath]: imagePath }).slice(-50);
  try { localStorage.setItem(THUMBNAILS_KEY, JSON.stringify(Object.fromEntries(kept))); } catch { /* Remembering is a convenience only. */ }
}
export const thumbnailOf = (videoPath: string) => thumbnails()[videoPath] ?? null;
