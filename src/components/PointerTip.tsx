import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { helpSettings } from "../lib/helpSettings";

/** The space between the tip and the window's edges, and the arrow's least distance from the tip's corners. */
const EDGE = 8;
const ARROW_INSET = 16;
const within = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const subscribeHelp = (listener: () => void) => helpSettings.subscribe(listener);
const pointersOn = () => helpSettings.get().pointers;

/**
 * A context tip with an arrow to a control, and a close button: at the
 * right of the control, or above it ("side"). It stays in the window (the
 * arrow still points at the control), and follows the control while the
 * panels around it change size. Help, Disable Pointers hides every tip.
 */
export function PointerTip(props: {
  anchor: RefObject<HTMLElement | null>;
  text: string;
  onClose: () => void;
  side?: "right" | "above";
}) {
  const on = useSyncExternalStore(subscribeHelp, pointersOn);
  return on ? <PlacedTip {...props} /> : null;
}

function PlacedTip({ anchor, text, onClose, side = "right" }: {
  anchor: RefObject<HTMLElement | null>;
  text: string;
  onClose: () => void;
  side?: "right" | "above";
}) {
  const tipRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    let frame = 0;
    const place = () => {
      const target = anchor.current?.getBoundingClientRect();
      const tip = tipRef.current;
      if (tip) {
        /* With no control to point at (not drawn yet), the tip waits out of sight. */
        tip.style.visibility = target ? "visible" : "hidden";
        if (target) {
          const width = tip.offsetWidth;
          const height = tip.offsetHeight;
          if (side === "above") {
            const center = target.left + target.width / 2;
            const left = within(center - width / 2, EDGE, window.innerWidth - width - EDGE);
            tip.style.left = `${left}px`;
            tip.style.top = `${Math.max(EDGE, target.top - height - 12)}px`;
            tip.style.setProperty("--arrow-x", `${within(center - left, ARROW_INSET, width - ARROW_INSET)}px`);
          } else {
            const middle = target.top + target.height / 2;
            const top = within(middle - height / 2, EDGE, window.innerHeight - height - EDGE);
            tip.style.left = `${Math.min(target.right + 12, window.innerWidth - width - EDGE)}px`;
            tip.style.top = `${top}px`;
            tip.style.setProperty("--arrow-y", `${within(middle - top, ARROW_INSET, height - ARROW_INSET)}px`);
          }
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor, side]);
  return createPortal(
    <div ref={tipRef} className={`pointer-tip ${side}`} role="status">
      <span className="selectable">{text}</span>
      <button className="help-card-close" onClick={onClose} aria-label="Close the tip" data-tip="Close">
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}
