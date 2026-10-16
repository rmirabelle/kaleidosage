import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { EASES, easeCurve, easeOf, type Ease, type Param } from "../engine/params";

/**
 * A small drawing of an easing curve, from the start handle (bottom left)
 * to the end handle (top right). A curve that goes past the handles
 * (explode, implode) is squeezed so its whole swing fits in the drawing.
 */
function Curve({ kind, width = 16, height = 12 }: { kind: Ease; width?: number; height?: number }) {
  const samples = Array.from({ length: 49 }, (_, index) => easeCurve(kind, index / 48));
  const low = Math.min(0, ...samples);
  const high = Math.max(1, ...samples);
  const points = samples.map((value, index) => {
    const t = index / 48;
    return `${(1 + t * (width - 2)).toFixed(2)},${(height - 1 - (value - low) / (high - low) * (height - 2)).toFixed(2)}`;
  });
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
      <polyline points={points.join(" ")} fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/**
 * The easing button of a range: it shows the range's curve and opens a list
 * of curves. The list opens on the page body under the button, so the panel
 * does not cut it off. A pick, a click outside it, or Esc closes it. Hidden,
 * not removed, while the range is off, so the slider does not move.
 */
export function EaseMenu({ param, disabled }: { param: Param; disabled: boolean }) {
  const [kind, setKind] = useState<Ease>(easeOf(param));
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!position) return;
    const close = () => setPosition(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close();
    };
    /* Capture, so Esc closes the list and does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      close();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("resize", close);
    };
  }, [position]);

  /** Keeps the list inside the window: to the left of the right edge, and above the button when there is no room below. */
  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!position || !menu) return;
    const left = Math.min(position.left, window.innerWidth - 8 - menu.offsetWidth);
    const button = buttonRef.current!.getBoundingClientRect();
    const top = position.top + menu.offsetHeight > window.innerHeight - 8 ? Math.max(8, button.top - 4 - menu.offsetHeight) : position.top;
    if (left !== position.left || top !== position.top) setPosition({ left, top });
  }, [position]);

  const label = EASES.find(([value]) => value === kind)?.[1] ?? "";
  return (
    <>
      <button
        ref={buttonRef}
        className={`panel-ease ${position ? "active" : ""}`}
        disabled={disabled}
        title={`Easing: ${label}`}
        aria-label={`${param.label} easing: ${label}`}
        aria-haspopup="menu"
        aria-expanded={Boolean(position)}
        onClick={() => {
          if (position) {
            setPosition(null);
            return;
          }
          const rect = buttonRef.current!.getBoundingClientRect();
          setPosition({ left: rect.left, top: rect.bottom + 4 });
        }}
      >
        <Curve kind={kind} />
      </button>
      {position && createPortal(
        <div ref={menuRef} className="toolbar-dropdown ease-menu" role="menu" aria-label={`${param.label} easing`} style={position}>
          {EASES.map(([value, text]) => (
            <button
              key={value}
              role="menuitemradio"
              aria-checked={kind === value}
              className={`toolbar-dropdown-item ease-item ${kind === value ? "selected" : ""}`}
              onClick={() => {
                param.ease = value;
                setKind(value);
                setPosition(null);
              }}
            >
              <Curve kind={value} width={22} height={14} />
              {text}
            </button>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}
