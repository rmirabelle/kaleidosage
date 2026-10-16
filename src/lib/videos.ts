import { convertFileSrc, invoke, isTauri } from "@tauri-apps/api/core";

/** Video containers accepted by the picker. Playback depends on the webview's available decoders. */
export const VIDEO_EXTENSIONS = ["mp4", "m4v", "webm", "mov", "avi"];

export interface VideoFile { id: string; mime: string }

const extension = (path: string) => path.split(".").pop()?.toLowerCase() ?? "";

export const isVideoPath = (path: string) => VIDEO_EXTENSIONS.includes(extension(path));

/** A muted, looping video, ready once its first frame can be drawn. The engine starts it. */
export function loadVideoBlob(blob: Blob): Promise<HTMLVideoElement> {
  return loadVideoUrl(URL.createObjectURL(blob));
}

function loadVideoUrl(url: string): Promise<HTMLVideoElement> {
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.loop = true;
  video.playsInline = true;
  video.preload = "auto";
  return new Promise((resolve, reject) => {
    video.onloadeddata = () => {
      video.onloadeddata = null;
      video.onerror = null;
      resolve(video);
    };
    video.onerror = () => {
      video.onloadeddata = null;
      video.onerror = null;
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
      reject(new Error("The embedded video player could not decode this file. Windows Media Player may support it through a different decoder."));
    };
    video.src = url;
  });
}

/** True for the type of a video file ("video/..."), as a scene stores it. */
export const isVideoType = (type: string) => type.startsWith("video/");

/** Opens a registered disk stream without transferring the video's bytes through IPC. */
export async function loadVideoId(videoFile: VideoFile): Promise<{ video: HTMLVideoElement; videoFile: VideoFile }> {
  try {
    return { video: await loadVideoUrl(convertFileSrc(videoFile.id, "video")), videoFile };
  } catch (error) {
    if (!isTauri()) throw error;
    const compatible = await invoke<VideoFile>("compatible_video", { id: videoFile.id });
    return { video: await loadVideoUrl(convertFileSrc(compatible.id, "video")), videoFile: compatible };
  }
}

export async function loadVideoFile(path: string) {
  return loadVideoId(await invoke<VideoFile>("open_video_file", { path }));
}

/** Browser File/Blob imports are staged in small chunks when a scene is saved. */
export async function stageVideoBlob(blob: Blob): Promise<VideoFile> {
  const id = await invoke<string>("begin_video_upload", { mime: blob.type });
  try {
    const chunk = 2 * 1024 * 1024;
    for (let offset = 0; offset < blob.size; offset += chunk) {
      const bytes = await blob.slice(offset, offset + chunk).arrayBuffer();
      await invoke("append_video_upload", bytes, { headers: { "video-id": id, offset: String(offset) } });
    }
    return await invoke<VideoFile>("finish_video_upload", { id, discard: false });
  } catch (error) {
    await invoke("finish_video_upload", { id, discard: true }).catch(() => {});
    throw error;
  }
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
