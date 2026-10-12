/**
 * How far past the screen edge the blur pass can read, in device pixels.
 * The blur samples from -0.5 to +0.5 of its offset around each pixel.
 * - Linear: the offset is the blur distance (given at 1080p), the same everywhere.
 * - Radial and spin: the offset is amount × the distance from the center,
 *   which is largest at the corner farthest from the center.
 */
export function blurReach(
  mode: number, distance: number, amount: number, width: number, height: number, centerX = 0, centerY = 0
): number {
  if (mode === 0) return 0.5 * distance * height / 1080;
  /** The corner farthest from the blur center, in screen heights. The center is a fraction of the screen size. */
  const cornerDistance = Math.hypot((0.5 + Math.abs(centerX)) * width / height, 0.5 + Math.abs(centerY));
  return 0.5 * amount * height * cornerDistance;
}
