/**
 * The on/off icon of an effect group: the power symbol on a round button.
 * On, it is green (the button gives it a soft green glow; see
 * .panel-group-toggle); off, it is plain gray. It is drawn in its own
 * colors, so it keeps them wherever it sits.
 */
export function PowerIcon({ on, size = 16 }: { on: boolean; size?: number }) {
  const color = on ? "#3ddc6e" : "#8c91a1";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9.2" fill={on ? "#123d22" : "#2a2d37"} stroke={color} strokeOpacity={on ? 1 : 0.7} strokeWidth="1.3" />
      {/* The power symbol: a circle open at the top, and a line through the gap. */}
      <path d="M8.6 8.4 A5 5 0 1 0 15.4 8.4" fill="none" stroke={color} strokeOpacity={on ? 1 : 0.75} strokeWidth="2" strokeLinecap="round" />
      <line x1="12" y1="5.6" x2="12" y2="11.6" stroke={color} strokeOpacity={on ? 1 : 0.75} strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
