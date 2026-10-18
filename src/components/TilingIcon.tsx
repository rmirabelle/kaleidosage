import tileImage from "../assets/tiling.png";

/**
 * A decorative tile (src/assets/tiling.png, white on clear). The image is
 * used as a mask over the current text color, so the button around it sets
 * its color.
 */
export function TilingIcon({ size = 16 }: { size?: number }) {
  const mask = `url(${tileImage}) center / contain no-repeat`;
  return (
    <span
      aria-hidden="true"
      style={{ display: "block", width: size, height: size, background: "currentColor", mask, WebkitMask: mask }}
    />
  );
}
