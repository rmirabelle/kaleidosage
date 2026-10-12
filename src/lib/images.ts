import { invoke } from "@tauri-apps/api/core";

export const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif", "bmp", "avif"];

export function loadImageUrl(url: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (crossOrigin) image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("The image could not be loaded."));
    image.src = url;
  });
}

export async function loadImageBlob(blob: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(blob);
  try {
    const image = await loadImageUrl(url);
    await image.decode();
    return image;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A decoded image and its original file bytes, which a saved scene keeps. */
export interface LoadedImage {
  image: HTMLImageElement;
  blob: Blob;
}

const MIME_TYPES: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp",
  gif: "image/gif", bmp: "image/bmp", avif: "image/avif"
};

/** A random photo from Lorem Picsum, about the size of the screen. */
export async function loadRandomImage(): Promise<LoadedImage> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.min(3840, Math.round(screen.width * dpr));
  const height = Math.min(2160, Math.round(screen.height * dpr));
  const response = await fetch(`https://picsum.photos/${width}/${height}?random=${Date.now()}`);
  if (!response.ok) throw new Error(`The image service returned ${response.status}.`);
  const blob = await response.blob();
  return { image: await loadImageBlob(blob), blob };
}

export async function loadImageFile(path: string): Promise<LoadedImage> {
  const bytes = await invoke<ArrayBuffer>("read_image_file", { path });
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const blob = new Blob([bytes], { type: MIME_TYPES[extension] ?? "image/png" });
  return { image: await loadImageBlob(blob), blob };
}

/** Soft colored circles, used until a real image loads or when no image can be loaded. */
export function fallbackImage(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 768;
  const context = canvas.getContext("2d")!;
  const rand = (max: number) => Math.random() * max;
  context.fillStyle = "#111";
  context.fillRect(0, 0, canvas.width, canvas.height);
  for (let index = 0; index < 40; index++) {
    const gradient = context.createRadialGradient(rand(1024), rand(768), 0, rand(1024), rand(768), 60 + rand(240));
    gradient.addColorStop(0, `hsla(${rand(360)},90%,60%,0.9)`);
    gradient.addColorStop(1, "transparent");
    context.fillStyle = gradient;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  return canvas;
}

/** "Kaleido 2026-10-11 23-15-02.png", in local time. */
export function snapshotFileName(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Kaleido ${day} ${time}.png`;
}

/** Saves a PNG to Pictures\Kaleido Sage and returns its path. */
export async function saveSnapshot(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  return invoke<string>("save_snapshot", bytes, { headers: { "file-name": snapshotFileName() } });
}
