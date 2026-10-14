import { useId } from "react";

/**
 * The open-file icon: an open yellow folder, like the File Explorer folder,
 * with its back panel and tab behind a front flap that leans open. It is
 * drawn in its own colors, so it keeps them wherever it sits. Each copy has
 * its own gradient ids, so several on one page do not share them.
 */
export function ColorFolder({ size = 16, className }: { size?: number; className?: string }) {
  const id = useId();
  const back = `${id}-back`;
  const front = `${id}-front`;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={back} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#e8a92c" />
          <stop offset="1" stopColor="#c9851a" />
        </linearGradient>
        <linearGradient id={front} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#ffdc7a" />
          <stop offset="1" stopColor="#f5b83d" />
        </linearGradient>
      </defs>
      {/* The back panel with its tab. */}
      <path d="M2.5 6.2 Q2.5 4.5 4.2 4.5 H9 L11 6.6 H19.6 Q21.3 6.6 21.3 8.3 V18.8 H2.5 Z" fill={`url(#${back})`} stroke="#000000" strokeWidth="0.9" strokeLinejoin="round" />
      {/* A sheet of paper inside. */}
      <rect x="4.6" y="8" width="14.6" height="8" rx="0.6" fill="#fbfbf7" />
      {/* The front flap, leaning open. */}
      <path d="M2.5 18.8 L5.2 10.6 Q5.5 9.8 6.3 9.8 H21.7 Q22.8 9.8 22.4 10.9 L19.8 18.2 Q19.6 18.8 18.9 18.8 Z" fill={`url(#${front})`} stroke="#000000" strokeWidth="0.9" strokeLinejoin="round" />
    </svg>
  );
}
