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
 * The dice's themes: Commons searches for pictures that make good
 * kaleidoscopes, in groups. The dice picks a group first, then a theme in
 * it, so a group with many themes does not show more often. Each theme gave
 * tens to hundreds of 4K pictures when tested (2026-10-23). A search by
 * category is more exact than one by title words; title words find noise
 * (a "butterfly" swim race), so they are kept for words with few other
 * meanings.
 */
const THEME_GROUPS: readonly (readonly string[])[] = [
  /* Old buildings: the dice once showed almost only these. */
  [`${FEATURED} intitle:ceiling`, `${FEATURED} intitle:dome`, `${QUALITY} intitle:"stained glass"`, `${QUALITY} intitle:mosaic`],
  /* Nature, close up. */
  ['incategory:"Featured pictures of flowers"', `${QUALITY} intitle:butterfly -intitle:meeting`, `${QUALITY} intitle:peacock`, `${QUALITY} intitle:feather`,
    `${QUALITY} intitle:coral`, `${QUALITY} intitle:shell`, `${QUALITY} intitle:autumn leaves`, `${QUALITY} intitle:ice`],
  /* Minerals and crystals. */
  ['incategory:"Featured pictures of minerals"', `${QUALITY} intitle:crystal`],
  /* Space and the sky at night. */
  ['incategory:"Featured pictures of astronomy"', `${FEATURED} intitle:nebula`, `${QUALITY} intitle:aurora`, 'incategory:"Fireworks"'],
  /* Storms and clouds. */
  ['intitle:supercell', 'intitle:"shelf cloud"', 'intitle:mammatus', 'incategory:"Featured pictures of clouds"', `${QUALITY} intitle:waterfall`],
  /* Shapes and geometric patterns. */
  ['incategory:"Islamic geometric patterns"', 'intitle:tessellation', 'intitle:mandala', 'intitle:kaleidoscope', 'incategory:"Fractal art"',
    `${QUALITY} intitle:pattern`, `${QUALITY} intitle:texture`],
  /* Cities and street art. */
  [`${QUALITY} intitle:"at night"`, `${QUALITY} intitle:graffiti`],
  /* The land from above (NASA's terrain maps are a group of their own, see loadTerrain). */
  ['intitle:"Sentinel-2"', 'intitle:"satellite image"', `${QUALITY} intitle:aerial`, 'intitle:"relief map"', 'intitle:"shaded relief"']
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

/** How long to wait before each new try when Wikimedia is busy or down (ms): two more tries. */
const RETRY_WAITS = [1000, 3000];

/** Waits "ms", or stops at once with an AbortError when "signal" aborts. */
function wait(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => { signal?.removeEventListener("abort", onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(timer); reject(signal?.reason); };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * A Wikimedia request that tries again, after each of "waits", when the
 * service is busy or down (429 or a 5xx status) or the connection fails.
 * After the last try it says so in words. Other statuses and an abort stop
 * at once.
 */
export async function fetchWikimedia(url: URL | string, { signal, headers }: { signal?: AbortSignal; headers?: Record<string, string> } = {}, waits: readonly number[] = RETRY_WAITS): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let failure: Error;
    try {
      const response = await fetch(url, { signal, headers });
      if (response.ok) return response;
      const busy = response.status === 429 || response.status >= 500;
      if (!busy) throw new Error(`The image service returned ${response.status}.`);
      failure = new Error(`Wikimedia Commons is busy or down (error ${response.status}). Try again in a few minutes.`);
    } catch (error) {
      if (signal?.aborted || !(error instanceof TypeError)) throw error;
      failure = new Error("Wikimedia Commons could not be reached. Check the internet connection.");
    }
    if (attempt >= waits.length) throw failure;
    await wait(waits[attempt], signal);
  }
}

async function commonsQuery(params: Record<string, string>, signal?: AbortSignal) {
  const api = new URL(COMMONS_API);
  for (const [key, value] of Object.entries({ action: "query", format: "json", origin: "*", ...params })) api.searchParams.set(key, value);
  const response = await fetchWikimedia(api, { signal, headers: { "Api-User-Agent": API_USER_AGENT } });
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
  const download = await fetchWikimedia(info.thumburl ?? info.url, { signal });
  const blob = await download.blob();
  return { image: await loadImageBlob(blob), blob, title: labelOf(title) || "Photo" };
}

/** NASA's Global Imagery Browse Services: map layers of the whole Earth, free, with no key, and open to the app (CORS). */
const GIBS_WMS = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi";
/**
 * The terrain map layers: the layer, its name for the status message, how
 * tall a map of it is in degrees (from, to: the layer's detail sets how
 * near it can go), and the farthest latitude it covers.
 */
const TERRAIN_LAYERS: readonly { layer: string; name: string; span: [number, number]; maxLatitude: number }[] = [
  { layer: "ASTER_GDEM_Greyscale_Shaded_Relief", name: "Shaded relief", span: [0.3, 1.5], maxLatitude: 82 },
  { layer: "SRTM_Color_Index", name: "Elevation colors", span: [0.6, 3.5], maxLatitude: 59 },
  { layer: "BlueMarble_ShadedRelief_Bathymetry", name: "Relief and sea floor", span: [2.5, 12], maxLatitude: 85 },
  { layer: "BlueMarble_NextGeneration", name: "Blue Marble", span: [2, 9], maxLatitude: 85 }
];
/** Places with striking land (mountains, canyons, dunes, deltas, ice): their names, longitudes and latitudes. */
export const TERRAIN_PLACES: readonly [string, number, number][] = [
  ["the Himalayas", 86.9, 28.0], ["the Karakoram", 76.5, 35.8], ["Tibet", 88.0, 31.5], ["the Tian Shan", 80.0, 42.0],
  ["the Atacama", -68.2, -23.5], ["the Salar de Uyuni", -67.5, -20.2], ["Patagonia", -73.4, -49.5], ["the Alps", 8.5, 46.5],
  ["the Grand Canyon", -112.1, 36.2], ["Canyonlands", -110.0, 38.3], ["Death Valley", -117.0, 36.4], ["the Appalachians", -77.5, 40.5],
  ["the Tibesti", 18.5, 21.0], ["the Namib", 15.2, -24.8], ["the Empty Quarter", 50.0, 20.0], ["the Zagros", 52.0, 29.5],
  ["Iceland", -19.0, 64.8], ["Greenland", -28.0, 70.0], ["Svalbard", 17.0, 78.5], ["the Lena Delta", 126.5, 72.8],
  ["the Southern Alps", 170.5, -43.6], ["Hawaii", -155.5, 19.6], ["Kamchatka", 159.0, 56.0], ["the Atlas", -6.0, 31.5],
  ["the Ethiopian Highlands", 39.0, 12.0], ["Kilimanjaro", 37.3, -3.1], ["the Amazon", -62.0, -3.5], ["the Ganges Delta", 89.5, 22.0],
  ["the Okavango Delta", 22.7, -19.3], ["the Mississippi Delta", -89.5, 29.3]
];
/** Places too flat to make good land for the Terrain effect: they stay in the random pictures only. */
const FLAT_PLACES = new Set(["the Atacama", "the Salar de Uyuni", "the Empty Quarter", "Iceland", "Svalbard", "the Amazon"]);
/** The places the Terrain effect can load: the striking places without the flat ones and the deltas. */
export const LAND_PLACES = TERRAIN_PLACES.filter(([name]) => !FLAT_PLACES.has(name) && !name.endsWith(" Delta"));

/**
 * A random 4K terrain map from NASA's map service: a random layer over a
 * random striking place (one the layer covers), moved a little from the
 * place's center. It is 16:9, and its degrees of longitude are made wider
 * by the latitude, so the land keeps its true shape.
 */
async function loadTerrain(signal: AbortSignal): Promise<RandomImage> {
  const pick = <T,>(items: readonly T[]) => items[Math.floor(Math.random() * items.length)];
  const { layer, name, span, maxLatitude } = pick(TERRAIN_LAYERS);
  const [place, longitude, latitude] = pick(TERRAIN_PLACES.filter(([, , placeLatitude]) => Math.abs(placeLatitude) < maxLatitude - 1));
  const height = span[0] + Math.random() * (span[1] - span[0]);
  const north = Math.min(maxLatitude, latitude + height * (Math.random() - 0.5) * 0.6 + height / 2);
  const south = Math.max(-maxLatitude, north - height);
  const width = (height * 16) / 9 / Math.max(0.2, Math.cos(((north + south) / 2) * Math.PI / 180));
  const west = longitude + width * (Math.random() - 0.5) * 0.6 - width / 2;
  const url = new URL(GIBS_WMS);
  for (const [key, value] of Object.entries({
    SERVICE: "WMS", REQUEST: "GetMap", VERSION: "1.1.1", SRS: "EPSG:4326", STYLES: "", FORMAT: "image/jpeg", LAYERS: layer,
    WIDTH: String(SOURCE_WIDTH), HEIGHT: String(Math.round((SOURCE_WIDTH * 9) / 16)),
    BBOX: [west, south, west + width, north].map((degrees) => degrees.toFixed(4)).join(",")
  })) url.searchParams.set(key, value);
  const download = await fetch(url, { signal });
  if (!download.ok || !download.headers.get("content-type")?.startsWith("image/")) throw new Error(`The map service returned ${download.status}.`);
  const blob = await download.blob();
  return { image: await loadImageBlob(blob), blob, title: `${name}: ${place} (NASA)` };
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
 * One try: a random 4K picture from a random theme, or null when that
 * search found none (or the terrain map could not be read). It picks a random place in the theme's results. The search's
 * own random order does not work here: Commons keeps each answer for an
 * hour, so the same search gives the same photo for that hour.
 */
async function tryTheme(signal: AbortSignal): Promise<RandomImage | null> {
  /* NASA's terrain maps are one more group, as likely as each group of themes. */
  const group = Math.floor(Math.random() * (THEME_GROUPS.length + 1));
  if (group === THEME_GROUPS.length) {
    return await loadTerrain(signal).catch((error) => {
      if (signal.aborted) throw error;
      return null;
    });
  }
  const themes = THEME_GROUPS[group];
  const theme = themes[Math.floor(Math.random() * themes.length)];
  const size = await themeSize(theme, signal);
  if (size === 0) return null;
  const { photos } = await searchCommons(theme, { limit: 1, offset: Math.floor(Math.random() * size), signal });
  return photos[0] ? await loadCommonsPhoto(photos[0].title, signal) : null;
}

/**
 * A random 4K picture: a photo from Wikimedia Commons from one of the
 * dice's themes, or a NASA terrain map.
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
