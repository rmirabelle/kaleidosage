/**
 * Real terrain for the camera (see docs/TERRAIN.md): the heights of an area
 * of the Earth and its picture, loaded by src/lib/terrain.ts. The scene owns
 * it; the engine draws with it.
 */
export interface TerrainData {
  /** A number for each load, so a new load counts as a change. */
  id: number;
  /** The place's name, its center (degrees) and how wide the area is (km). */
  place: string;
  longitude: number;
  latitude: number;
  areaKm: number;
  /** The heights, row by row from the north edge: 0 at the lowest land, 1 at the highest. */
  heights: Float32Array;
  width: number;
  height: number;
  /** The lowest and highest heights, in meters. */
  lowest: number;
  highest: number;
  /** How tall the highest land is at true scale, in parts of the area's north-south size. */
  relief: number;
  /** The area's picture from above, at the heights' size, or null when it did not load. */
  picture: HTMLCanvasElement | null;
}

/**
 * A smaller copy of a grid of numbers: half the width and height (at
 * least 1), each value the mean of the 2 x 2 values under it.
 */
export function halveGrid(values: Float32Array, width: number, height: number): [Float32Array, number, number] {
  const w = Math.max(1, width >> 1);
  const h = Math.max(1, height >> 1);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const y0 = Math.min(height - 1, y * 2);
    const y1 = Math.min(height - 1, y * 2 + 1);
    for (let x = 0; x < w; x++) {
      const x0 = Math.min(width - 1, x * 2);
      const x1 = Math.min(width - 1, x * 2 + 1);
      out[y * w + x] = (values[y0 * width + x0] + values[y0 * width + x1] + values[y1 * width + x0] + values[y1 * width + x1]) / 4;
    }
  }
  return [out, w, h];
}
