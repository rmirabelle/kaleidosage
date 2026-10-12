/** Rounds to the nearest step, without float noise such as 0.30000000000000004. */
export function snapToStep(value: number, step: number): number {
  const decimals = (String(step).split(".")[1] ?? "").length;
  return Number((Math.round(value / step) * step).toFixed(decimals));
}

/**
 * Moves a start-end range by delta, in whole steps. The range keeps its
 * width and its direction (the end can be below the start), and stops at
 * min and max.
 */
export function shiftRange(low: number, high: number, delta: number, min: number, max: number, step: number): [number, number] {
  const shift = Math.min(max - Math.max(low, high), Math.max(min - Math.min(low, high), snapToStep(delta, step)));
  const decimals = (String(step).split(".")[1] ?? "").length;
  return [Number((low + shift).toFixed(decimals)), Number((high + shift).toFixed(decimals))];
}
