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
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
/** How wide every source photo is downloaded: 4K. */
const SOURCE_WIDTH = 3840;
/**
 * Every search gets this: JPEG and PNG pictures at least 4K wide. Smaller
 * pictures make a soft kaleidoscope. Commons search has no "JPEG or PNG", so
 * it takes all bitmaps and leaves out the other two kinds.
 */
const FOUR_K = `filew:>${SOURCE_WIDTH - 1} filetype:bitmap -filemime:image/tiff -filemime:image/gif`;
/** The kinds of file that searches keep. */
const SEARCH_MIMES = new Set(["image/jpeg", "image/png"]);
const FEATURED = 'incategory:"Featured pictures on Wikimedia Commons"';
export const QUALITY = 'incategory:"Quality images"';
/**
 * The dice's themes: Commons searches for the photos that make the best
 * kaleidoscopes. These are detailed architecture with repeating geometric
 * patterns, and abstract pictures with no recognizable subject. Each theme
 * gave tens to hundreds of 4K photos when tested (2026-10-16).
 */
const THEMES = [
  `${FEATURED} intitle:ceiling`,
  `${FEATURED} intitle:dome`,
  `${FEATURED} intitle:mosque`,
  `${QUALITY} intitle:ceiling`,
  `${QUALITY} intitle:mosque interior`,
  'incategory:"Islamic geometric patterns"',
  `${QUALITY} intitle:mosaic`,
  `${QUALITY} intitle:"stained glass"`,
  `${QUALITY} intitle:pattern`,
  'incategory:"Fractal art"',
  `${QUALITY} intitle:texture`
];
/** An empty search (a rare short theme) is tried again with another theme, up to this many times. */
const MAX_TRIES = 5;

/** One photo that a Commons search found. "thumb" is a preview, "width" and "height" are the full size. */
export interface CommonsPhoto {
  title: string;
  label: string;
  thumb: string;
  width: number;
  height: number;
}

interface CommonsPage {
  title?: string;
  index?: number;
  imageinfo?: { url: string; thumburl?: string; mime: string; width: number; height: number }[];
}

async function commonsQuery(params: Record<string, string>, signal?: AbortSignal) {
  const api = new URL(COMMONS_API);
  for (const [key, value] of Object.entries({ action: "query", format: "json", origin: "*", ...params })) api.searchParams.set(key, value);
  const response = await fetch(api, { signal, headers: { "Api-User-Agent": API_USER_AGENT } });
  if (!response.ok) throw new Error(`The image service returned ${response.status}.`);
  return await response.json() as { query?: { pages?: Record<string, CommonsPage>; searchinfo?: { totalhits: number } }; continue?: { gsroffset?: number } };
}

/** "File:Dead_Vlei 5.jpg" shows as "Dead Vlei 5". */
const labelOf = (title: string) => title.replace(/^File:/, "").replace(/\.[a-z0-9]+$/i, "").replace(/_/g, " ").trim();

/**
 * Searches Wikimedia Commons for 4K photos, "previewWidth" pixels wide.
 * Returns the photos, in the search's order, and the offset of the next
 * page (none after the last).
 */
export async function searchCommons(words: string, { limit = 30, offset = 0, previewWidth = 320, signal }: {
  limit?: number; offset?: number; previewWidth?: number; signal?: AbortSignal;
} = {}): Promise<{ photos: CommonsPhoto[]; next?: number }> {
  const data = await commonsQuery({
    generator: "search", gsrnamespace: "6", gsrsearch: `${words} ${FOUR_K}`, gsrlimit: String(limit), gsroffset: String(offset),
    prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: String(previewWidth)
  }, signal);
  const photos = Object.values(data.query?.pages ?? {})
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
    .flatMap((page) => {
      const info = page.imageinfo?.[0];
      if (!page.title || !info || !SEARCH_MIMES.has(info.mime)) return [];
      return [{ title: page.title, label: labelOf(page.title), thumb: info.thumburl ?? info.url, width: info.width, height: info.height }];
    });
  return { photos, next: data.continue?.gsroffset };
}

/** Downloads one Commons photo ("File:..."), 4K wide. */
export async function loadCommonsPhoto(title: string, signal?: AbortSignal): Promise<RandomImage> {
  const data = await commonsQuery({ titles: title, prop: "imageinfo", iiprop: "url|mime|size", iiurlwidth: String(SOURCE_WIDTH) }, signal);
  const info = Object.values(data.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info) throw new Error("The image service did not find that photo.");
  const download = await fetch(info.thumburl ?? info.url, { signal });
  if (!download.ok) throw new Error(`The image service returned ${download.status}.`);
  const blob = await download.blob();
  return { image: await loadImageBlob(blob), blob, title: labelOf(title) || "Photo" };
}

/** Commons search goes no further than this many results. */
const MAX_OFFSET = 10000;
/** How many 4K photos each theme has; the count is looked up once per run. */
const themeSizes = new Map<string, number>();

async function themeSize(theme: string, signal: AbortSignal) {
  const known = themeSizes.get(theme);
  if (known !== undefined) return known;
  const data = await commonsQuery({ list: "search", srnamespace: "6", srsearch: `${theme} ${FOUR_K}`, srlimit: "1", srinfo: "totalhits", srprop: "" }, signal);
  const size = Math.min(data.query?.searchinfo?.totalhits ?? 0, MAX_OFFSET);
  themeSizes.set(theme, size);
  return size;
}

/**
 * One try: a random 4K photo from a random theme, or null when that search
 * found none. It picks a random place in the theme's results. The search's
 * own random order does not work here: Commons keeps each answer for an
 * hour, so the same search gives the same photo for that hour.
 */
async function tryTheme(signal: AbortSignal): Promise<RandomImage | null> {
  const theme = THEMES[Math.floor(Math.random() * THEMES.length)];
  const size = await themeSize(theme, signal);
  if (size === 0) return null;
  const { photos } = await searchCommons(theme, { limit: 1, offset: Math.floor(Math.random() * size), signal });
  return photos[0] ? await loadCommonsPhoto(photos[0].title, signal) : null;
}

/**
 * A random 4K photo from Wikimedia Commons, from one of the dice's themes.
 * The whole download stops after timeoutMs, so a slow or silent service
 * cannot keep the app waiting.
 */
async function fetchRandomImage(timeoutMs: number): Promise<RandomImage> {
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
      const found = await tryTheme(controller.signal);
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
