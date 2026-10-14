/**
 * Color icons for the main toolbar, in the style of the folder and play
 * control icons: flat colors and a black outline. They are drawn in their
 * own colors, so they keep them wherever they sit.
 */

/** Save: a blue floppy disk, with a metal shutter at the top and a white label at the bottom. */
export function ColorDisk({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3.5 4.5 Q3.5 3.5 4.5 3.5 H17.5 L20.5 6.5 V19.5 Q20.5 20.5 19.5 20.5 H4.5 Q3.5 20.5 3.5 19.5 Z" fill="#2f7cf6" stroke="#000000" strokeWidth="1" strokeLinejoin="round" />
      <rect x="7" y="3.5" width="9" height="5.5" fill="#c9ced6" stroke="#000000" strokeWidth="0.9" />
      <rect x="12.6" y="4.6" width="2" height="3.3" fill="#2f7cf6" />
      <rect x="6" y="12.2" width="12" height="8.3" rx="0.6" fill="#ffffff" stroke="#000000" strokeWidth="0.9" />
      <path d="M8 15 H16 M8 17.5 H14" stroke="#9aa3b2" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
}

/** Performance: a dial with a green, yellow and red scale and a white needle. */
export function ColorGauge({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="13" r="9" fill="#2a2d37" stroke="#000000" strokeWidth="1" />
      <path d="M5.6 16.5 A7 7 0 0 1 7.1 8.1" fill="none" stroke="#3ddc6e" strokeWidth="2.6" />
      <path d="M7.1 8.1 A7 7 0 0 1 16.9 8.1" fill="none" stroke="#ffd23f" strokeWidth="2.6" />
      <path d="M16.9 8.1 A7 7 0 0 1 18.4 16.5" fill="none" stroke="#ff5a4e" strokeWidth="2.6" />
      <path d="M12 13 L16 9.2" stroke="#ffffff" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx="12" cy="13" r="1.6" fill="#ffffff" stroke="#000000" strokeWidth="0.6" />
    </svg>
  );
}

/** Full screen: four light blue corners, pointing out. */
export function ColorFullScreen({ size = 16 }: { size?: number }) {
  const corner = { fill: "#5ab8ff", stroke: "#000000", strokeWidth: 0.9, strokeLinejoin: "round" as const };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <path d="M3 3 H10 V5.6 H5.6 V10 H3 Z" {...corner} />
      <path d="M21 3 H14 V5.6 H18.4 V10 H21 Z" {...corner} />
      <path d="M3 21 H10 V18.4 H5.6 V14 H3 Z" {...corner} />
      <path d="M21 21 H14 V18.4 H18.4 V14 H21 Z" {...corner} />
    </svg>
  );
}
