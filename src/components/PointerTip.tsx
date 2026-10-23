import { useLayoutEffect, useRef, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";

/**
 * A context tip at the right of a control, with an arrow to it, and a close
 * button. It follows the control while the panels around it change size.
 */
export function PointerTip({ anchor, text, onClose }: { anchor: RefObject<HTMLElement | null>; text: string; onClose: () => void }) {
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
          tip.style.left = `${target.right + 12}px`;
          tip.style.top = `${target.top + target.height / 2 - tip.offsetHeight / 2}px`;
        }
      }
      frame = requestAnimationFrame(place);
    };
    place();
    return () => cancelAnimationFrame(frame);
  }, [anchor]);
  return createPortal(
    <div ref={tipRef} className="pointer-tip" role="status">
      <span className="selectable">{text}</span>
      <button className="help-card-close" onClick={onClose} aria-label="Close the tip" data-tip="Close">
        <X size={14} />
      </button>
    </div>,
    document.body
  );
}
