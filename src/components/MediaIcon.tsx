type MediaKind = "stop" | "play" | "pause";

/** Each icon's flat color. Pause has no color of its own: the app's medium gray (--muted). */
const COLORS: Record<MediaKind, string> = {
  stop: "#e2382d",
  play: "#2bc25a",
  pause: "#8c91a1"
};

/**
 * The play controls: a red stop square, a green play triangle and two
 * plain medium gray pause bars, each in one flat color with no outline.
 */
export function MediaIcon({ kind, size = 16 }: { kind: MediaKind; size?: number }) {
  const shape = { fill: COLORS[kind] };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      {kind === "stop" && <rect x="4.5" y="4.5" width="15" height="15" rx="2.5" {...shape} />}
      {kind === "play" && <path d="M7 4.6 Q7 3.4 8.1 4 L19.6 11 Q20.6 12 19.6 13 L8.1 20 Q7 20.6 7 19.4 Z" {...shape} />}
      {kind === "pause" && (
        <>
          <rect x="5.5" y="4.5" width="5" height="15" rx="1.6" {...shape} />
          <rect x="13.5" y="4.5" width="5" height="15" rx="1.6" {...shape} />
        </>
      )}
    </svg>
  );
}
