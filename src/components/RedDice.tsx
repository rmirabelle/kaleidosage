import { useId } from "react";

/**
 * The random icon: a red die showing five, with white dents. It is drawn in
 * its own colors, so it stays red wherever it sits. Each copy has its own
 * gradient ids, so several dice on one page do not share them.
 */
export function RedDice({ size = 16, className }: { size?: number; className?: string }) {
  const id = useId();
  const body = `${id}-body`;
  const dent = `${id}-dent`;
  const pips: [number, number][] = [[7.2, 7.2], [16.8, 7.2], [12, 12], [7.2, 16.8], [16.8, 16.8]];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={body} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff6b5e" />
          <stop offset="1" stopColor="#c4231b" />
        </linearGradient>
        {/* A dent: white, a little gray at its top left, where the rim shades it. */}
        <radialGradient id={dent} cx="0.62" cy="0.62" r="0.7">
          <stop offset="0.55" stopColor="#ffffff" />
          <stop offset="1" stopColor="#d9d9d9" />
        </radialGradient>
      </defs>
      <rect x="2" y="2" width="20" height="20" rx="5" fill={`url(#${body})`} stroke="#8e1710" strokeWidth="1" />
      <rect x="3.6" y="3.4" width="16.8" height="7" rx="3.5" fill="#ffffff" opacity="0.14" />
      {pips.map(([cx, cy]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r="2.1" fill={`url(#${dent})`} stroke="#7a1410" strokeOpacity="0.35" strokeWidth="0.6" />
      ))}
    </svg>
  );
}
