import type { TerrainData } from "../engine/terrain";

/**
 * Loads real terrain for the camera (see docs/TERRAIN.md): the heights of
 * an area from the AWS Terrain Tiles (Terrarium PNG tiles in Web Mercator,
 * free, with no key, open to the app), and a picture of the same area from
 * NASA GIBS in the same map layout.
 */
const TILE_URL = (zoom: number, x: number, y: number) => `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${zoom}/${x}/${y}.png`;
const GIBS_3857 = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";
/** The pictures to try, in order: Landsat (30 m, sharp), then Blue Marble (500 m, soft). */
const PICTURE_LAYERS = ["Landsat_WELD_CorrectedReflectance_TrueColor_Global_Annual", "BlueMarble_NextGeneration"];
const EARTH_RADIUS = 6378137;
/** Meters per tile pixel at zoom 0 at the equator. */
const METERS_PER_PIXEL = (2 * Math.PI * EARTH_RADIUS) / 256;
/** About how many heights across the area: the zoom is picked for this many tile pixels. */
const GRID = 1024;
const MAX_ZOOM = 15;

let nextTerrainId = 1;

/**
 * The heights and picture of an area "areaKm" wide around a place, in the
 * shape of the screen ("aspect", width over height). Heights below the sea
 * become the sea's flat top, so coasts look right.
 */
export async function loadTerrain({ place, longitude, latitude, areaKm, aspect, signal }: {
  place: string;
  longitude: number;
  latitude: number;
  areaKm: number;
  aspect: number;
  signal?: AbortSignal;
}): Promise<TerrainData> {
  const lat = Math.min(84, Math.max(-84, latitude));
  const shrink = Math.cos((lat * Math.PI) / 180);
  const areaMeters = areaKm * 1000;
  /* The zoom at which the area is about GRID tile pixels wide (fewer when even zoom 15 is too coarse). */
  const zoom = Math.min(MAX_ZOOM, Math.max(0, Math.floor(Math.log2((GRID * METERS_PER_PIXEL * shrink) / areaMeters))));
  const worldPixels = 256 * 2 ** zoom;
  const centerX = ((longitude + 180) / 360) * worldPixels;
  const centerY = ((1 - Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) / Math.PI) / 2) * worldPixels;
  const width = Math.max(16, Math.round(areaMeters / ((METERS_PER_PIXEL * shrink) / 2 ** zoom)));
  const height = Math.max(16, Math.round(width / Math.max(0.1, aspect)));
  /* Whole pixels, so the tiles land on the canvas with no resampling (which would mix the coded heights). */
  const left = Math.round(centerX - width / 2);
  const top = Math.round(centerY - height / 2);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("No 2D canvas for the terrain tiles.");
  const tiles = 2 ** zoom;
  const loads: Promise<void>[] = [];
  for (let ty = Math.floor(top / 256); ty <= Math.floor((top + height - 1) / 256); ty++) {
    if (ty < 0 || ty >= tiles) continue;
    for (let tx = Math.floor(left / 256); tx <= Math.floor((left + width - 1) / 256); tx++) {
      const wrapped = ((tx % tiles) + tiles) % tiles;
      loads.push((async () => {
        const response = await fetch(TILE_URL(zoom, wrapped, ty), { signal });
        if (!response.ok) throw new Error(`A terrain tile did not load (${response.status}).`);
        /* No color change and no premultiply: the colors are the coded heights. */
        const bitmap = await createImageBitmap(await response.blob(), { colorSpaceConversion: "none", premultiplyAlpha: "none" });
        context.drawImage(bitmap, tx * 256 - left, ty * 256 - top);
        bitmap.close();
      })());
    }
  }
  await Promise.all(loads);

  const pixels = context.getImageData(0, 0, width, height).data;
  const meters = new Float32Array(width * height);
  let lowest = Infinity;
  let highest = -Infinity;
  for (let i = 0; i < meters.length; i++) {
    const value = Math.max(0, pixels[i * 4] * 256 + pixels[i * 4 + 1] + pixels[i * 4 + 2] / 256 - 32768);
    meters[i] = value;
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
  }
  const range = Math.max(1, highest - lowest);
  const heights = meters.map((value) => (value - lowest) / range);
  /* The area's north-south size in meters, for the true-scale relief. */
  const northSouth = (height * METERS_PER_PIXEL * shrink) / 2 ** zoom;

  return {
    id: nextTerrainId++,
    place,
    longitude,
    latitude,
    areaKm,
    heights,
    width,
    height,
    lowest,
    highest,
    relief: range / northSouth,
    picture: await loadPicture({ left, top, width, height, worldPixels, signal }).catch(() => null)
  };
}

/** NASA's picture of the same area, at the heights' size, from the first layer that loads. */
async function loadPicture({ left, top, width, height, worldPixels, signal }: {
  left: number;
  top: number;
  width: number;
  height: number;
  worldPixels: number;
  signal?: AbortSignal;
}): Promise<HTMLCanvasElement | null> {
  const world = 2 * Math.PI * EARTH_RADIUS;
  const toX = (px: number) => (px / worldPixels) * world - world / 2;
  const toY = (py: number) => world / 2 - (py / worldPixels) * world;
  const bbox = [toX(left), toY(top + height), toX(left + width), toY(top)].map((value) => value.toFixed(2)).join(",");
  for (const layer of PICTURE_LAYERS) {
    const url = new URL(GIBS_3857);
    url.search = new URLSearchParams({
      SERVICE: "WMS", VERSION: "1.3.0", REQUEST: "GetMap", LAYERS: layer, STYLES: "", CRS: "EPSG:3857",
      BBOX: bbox, WIDTH: String(width), HEIGHT: String(height), FORMAT: "image/jpeg"
    }).toString();
    try {
      const response = await fetch(url, { signal });
      if (!response.ok || !(response.headers.get("content-type") ?? "").startsWith("image/")) continue;
      const bitmap = await createImageBitmap(await response.blob());
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d")?.drawImage(bitmap, 0, 0, width, height);
      bitmap.close();
      return canvas;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }
  return null;
}
