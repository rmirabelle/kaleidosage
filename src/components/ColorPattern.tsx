/**
 * The test pattern icon: a black and white checkerboard, four squares by
 * four, with square corners and a white outline, so it stands out on the
 * dark panel. It is drawn in its own colors, so it keeps them wherever it
 * sits.
 */
export function ColorPattern({ size = 16, className }: { size?: number; className?: string }) {
  const cell = 4.5;
  const origin = 3;
  const squares: { x: number; y: number; fill: string }[] = [];
  for (let row = 0; row < 4; row++) {
    for (let column = 0; column < 4; column++) {
      squares.push({ x: origin + column * cell, y: origin + row * cell, fill: (row + column) % 2 === 0 ? "#000000" : "#ffffff" });
    }
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      {squares.map(({ x, y, fill }) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={cell} height={cell} fill={fill} />
      ))}
      <rect x="3" y="3" width="18" height="18" fill="none" stroke="#ffffff" strokeWidth="1" />
    </svg>
  );
}
