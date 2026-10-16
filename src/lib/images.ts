import { invoke } from "@tauri-apps/api/core";
import { sourceSize, type ImageSource } from "../engine/renderer";

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
    /**
     * decode() gets the pixels ready before the first draw. It is only a speed-up, and
     * it can wait forever (for example while the window is hidden), so it gets one second.
     */
    await Promise.race([image.decode().catch(() => {}), new Promise((resolve) => window.setTimeout(resolve, 1000))]);
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

/** A random photo, with its title for the status message. */
export interface RandomImage extends LoadedImage {
  title: string;
}

/** Wikimedia asks every program that uses its API to name itself. */
const API_USER_AGENT = "KaleidoSage (https://github.com/rmirabelle/kaleidosage)";
/** The first Picture of the Day on Wikimedia Commons. */
const FIRST_POTD = Date.UTC(2007, 0, 1);
const DAY_MS = 24 * 60 * 60 * 1000;
/** Some days show a drawing, an animation or a video; those days are skipped, up to this many times. */
const MAX_TRIES = 5;

/** A random day's date from the first Picture of the Day to yesterday, as "YYYY-MM-DD". */
function randomPotdDate(): string {
  const days = Math.floor((Date.now() - DAY_MS - FIRST_POTD) / DAY_MS);
  return new Date(FIRST_POTD + Math.floor(Math.random() * days) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * One try: looks up the Picture of the Day of a random date and downloads
 * it, about as wide as the screen. Returns null when that day's picture is
 * not a JPEG or PNG photo.
 */
async function tryPotd(width: number, signal: AbortSignal): Promise<RandomImage | null> {
  const api = new URL("https://commons.wikimedia.org/w/api.php");
  for (const [key, value] of Object.entries({
    action: "query", format: "json", origin: "*", prop: "imageinfo", iiprop: "url|mime",
    iiurlwidth: String(width), generator: "images", titles: `Template:Potd/${randomPotdDate()}`
  })) api.searchParams.set(key, value);
  const response = await fetch(api, { signal, headers: { "Api-User-Agent": API_USER_AGENT } });
  if (!response.ok) throw new Error(`The image service returned ${response.status}.`);
  const data = await response.json() as {
    query?: { pages?: Record<string, { title?: string; imageinfo?: { url: string; thumburl?: string; mime: string }[] }> };
  };
  const page = Object.values(data.query?.pages ?? {}).find((candidate) =>
    candidate.imageinfo?.[0] && ["image/jpeg", "image/png"].includes(candidate.imageinfo[0].mime));
  const info = page?.imageinfo?.[0];
  if (!page || !info) return null;
  const download = await fetch(info.thumburl ?? info.url, { signal });
  if (!download.ok) throw new Error(`The image service returned ${download.status}.`);
  const blob = await download.blob();
  /* "File:Dead Vlei 5.jpg" shows as "Dead Vlei 5". */
  const title = (page.title ?? "").replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").trim();
  return { image: await loadImageBlob(blob), blob, title: title || "Random photo" };
}

/**
 * A random Picture of the Day from Wikimedia Commons, about the size of the
 * screen. The whole download stops after timeoutMs, so a slow or silent
 * service cannot keep the app waiting.
 */
async function fetchRandomImage(timeoutMs: number): Promise<RandomImage> {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const width = Math.min(3840, Math.round(screen.width * dpr));
  const controller = new AbortController();
  const tooSlow = `The image service did not answer in ${timeoutMs / 1000} seconds.`;
  let timer = 0;
  /* The limit covers every step: the download stops, and a step that cannot be stopped is no longer waited for. */
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      controller.abort();
      reject(new Error(tooSlow));
    }, timeoutMs);
  });
  const load = async () => {
    for (let tries = 0; tries < MAX_TRIES; tries++) {
      const found = await tryPotd(width, controller.signal);
      if (found) return found;
    }
    throw new Error("The image service found no photo. Try again.");
  };
  try {
    return await Promise.race([load(), timeout]);
  } catch (error) {
    throw controller.signal.aborted ? new Error(tooSlow) : error;
  } finally {
    window.clearTimeout(timer);
  }
}

/** The next random photo, downloaded in the background while the current one shows. */
let nextImage: Promise<RandomImage> | null = null;

function prefetch(timeoutMs: number) {
  const pending = fetchRandomImage(timeoutMs);
  /* A failed background download is not an error yet; it is tried again on the next click. */
  pending.catch(() => {
    if (nextImage === pending) nextImage = null;
  });
  nextImage = pending;
}

/**
 * A random photo. It uses the photo downloaded in the background when there
 * is one, so it usually shows at once, and then starts downloading the next.
 */
export async function loadRandomImage(timeoutMs = 20000): Promise<RandomImage> {
  const ready = nextImage;
  nextImage = null;
  let image: RandomImage | null = null;
  if (ready) image = await ready.catch(() => null);
  image ??= await fetchRandomImage(timeoutMs);
  prefetch(timeoutMs);
  return image;
}

export async function loadImageFile(path: string): Promise<LoadedImage> {
  const bytes = await invoke<ArrayBuffer>("read_image_file", { path });
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  const blob = new Blob([bytes], { type: MIME_TYPES[extension] ?? "image/png" });
  return { image: await loadImageBlob(blob), blob };
}

/** A small JPEG preview (data URL) of an image or a video's current frame, cropped to fill 16:9. */
export function makeThumbnail(source: ImageSource, width = 128, height = 72): string {
  const [sourceWidth, sourceHeight] = sourceSize(source);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  canvas.getContext("2d")!.drawImage(source, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
  return canvas.toDataURL("image/jpeg", 0.8);
}

/** "Kaleido 2026-10-11 23-15-02.png" (or another extension), in local time. */
export function snapshotFileName(date = new Date(), extension = "png"): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  const time = `${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
  return `Kaleido ${day} ${time}.${extension}`;
}
