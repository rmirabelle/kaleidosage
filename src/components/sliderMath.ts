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

/** How near a detent a dragged value must come to snap onto it, as a part of the slider's span. */
export const DETENT_SNAP = 0.02;

/** A value near the detent (within DETENT_SNAP of the span) becomes the detent, so it is easy to hit. */
export function snapToDetent(value: number, detent: number | undefined, min: number, max: number): number {
  if (detent === undefined) return value;
  return Math.abs(value - detent) <= (max - min) * DETENT_SNAP ? detent : value;
}

/**
 * Like snapToDetent, for several points (the detent, and other places to
 * snap to, such as whole numbers): a value near one of them becomes the
 * nearest one.
 */
export function snapToPoints(value: number, points: readonly number[], min: number, max: number): number {
  let best = value;
  let distance = (max - min) * DETENT_SNAP;
  for (const point of points) {
    if (Math.abs(value - point) <= distance) {
      best = point;
      distance = Math.abs(value - point);
    }
  }
  return best;
}

/**
 * A range kept around a center: the moved handle's distance from the center
 * is copied to the other side. Returns the moved handle's value first. The
 * distance stops where the other handle would leave the slider.
 */
export function mirrorAround(value: number, center: number, min: number, max: number, step: number): [number, number] {
  const side = value < center ? -1 : 1;
  const distance = Math.min(Math.abs(value - center), center - min, max - center);
  const decimals = (String(step).split(".")[1] ?? "").length;
  const round = (number: number) => Number(number.toFixed(decimals));
  return [round(center + side * distance), round(center - side * distance)];
}
