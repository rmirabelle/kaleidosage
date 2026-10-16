import { invoke } from "@tauri-apps/api/core";

/** Experimental: videos the Open Image dialog lists with the images. The webview plays H.264 MP4 and WebM. */
export const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm"];

const VIDEO_TYPES: Record<string, string> = { mp4: "video/mp4", m4v: "video/mp4", webm: "video/webm" };

const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

export const isVideoPath = (path: string) => VIDEO_EXTENSIONS.includes(extension(path));

/** A muted, looping video, ready once its first frame can be drawn. The engine starts it. */
export function loadVideoBlob(blob: Blob): Promise<HTMLVideoElement> {
  const url = URL.createObjectURL(blob);
  const video = document.createElement("video");
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  return new Promise((resolve, reject) => {
    video.onloadeddata = () => resolve(video);
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("The video could not be played. Kaleido Sage plays H.264 MP4 and WebM videos."));
    };
    video.src = url;
  });
}

/** True for the type of a video file ("video/..."), as a scene stores it. */
export const isVideoType = (type: string) => type.startsWith("video/");

/**
 * Reads the whole video file into memory, so a very large video takes a
 * moment. The file bytes come back too, for Save scene.
 */
export async function loadVideoFile(path: string): Promise<{ video: HTMLVideoElement; blob: Blob }> {
  const bytes = await invoke<ArrayBuffer>("read_video_file", { path });
  const blob = new Blob([bytes], { type: VIDEO_TYPES[extension(path)] ?? "video/mp4" });
  return { video: await loadVideoBlob(blob), blob };
}

/** The first frame of a video file, at most maxEdge pixels on its longest side, and the video's size. */
export async function videoFirstFrame(path: string, maxEdge: number) {
  const { video } = await loadVideoFile(path);
  try {
    const scale = Math.min(1, maxEdge / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    canvas.getContext("2d")!.drawImage(video, 0, 0, canvas.width, canvas.height);
    return { canvas, width: video.videoWidth, height: video.videoHeight };
  } finally {
    URL.revokeObjectURL(video.src);
    video.removeAttribute("src");
    video.load();
  }
}
