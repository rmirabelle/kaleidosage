/**
 * A MIDI connector seen from the front: a round plug with a key notch at
 * the top and five pins in an arc below the center. It is drawn in the
 * current text color, so the button around it sets its color.
 */
export function MidiIcon({ size = 14 }: { size?: number }) {
  /* The five pins, from the left round to the right, 45 degrees apart. */
  const pins = [180, 135, 90, 45, 0].map((degrees) => {
    const angle = degrees * Math.PI / 180;
    return [12 + Math.cos(angle) * 5.4, 12.6 + Math.sin(angle) * 5.4];
  });
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="10" y="1" width="4" height="4" rx="0.8" fill="currentColor" />
      {pins.map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.6" fill="currentColor" />)}
    </svg>
  );
}
