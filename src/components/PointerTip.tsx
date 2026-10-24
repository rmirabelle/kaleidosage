import { useLayoutEffect, useRef, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { X } from "@phosphor-icons/react";
import { helpSettings } from "../lib/helpSettings";

/** The space between the tip and the window's edges, and the arrow's least distance from the tip's corners. */
const EDGE = 8;
const ARROW_INSET = 16;
/** The space between the tip and its control, and between two tips. */
const GAP = 12;
const TIP_GAP = 8;
const within = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

const subscribeHelp = (listener: () => void) => helpSettings.subscribe(listener);
const pointersOn = () => helpSettings.get().pointers;

type Side = "right" | "above" | "below";
interface Shown {
  tip: HTMLDivElement;
  anchor: RefObject<HTMLElement | null>;
  side: Side;
  /** A green line around a panel that the tip tells about, and that panel. */
  ring: HTMLDivElement | null;
  outline: RefObject<HTMLElement | null> | undefined;
  /** A tip at the right starts level with the control's top, not its middle. */
  alignTop: boolean;
}
interface Box { left: number; top: number; right: number; bottom: number }

/**
 * The tips on the screen, placed together in one loop, once per animation
 * frame: each tip goes where it wants to be, from the top of the window
 * down, and a tip that would cover one placed before it moves down past it
 * (up, for a tip above its control). The arrow keeps pointing at the
 * control as far as the tip's edge allows.
 */
const shown = new Set<Shown>();
let frame = 0;

function placeAll() {
  const plans: { entry: Shown; left: number; top: number; width: number; height: number; target: DOMRect }[] = [];
  for (const entry of shown) {
    const target = entry.anchor.current?.getBoundingClientRect();
    /* With no control to point at (not drawn yet), the tip waits out of sight. */
    entry.tip.style.visibility = target ? "visible" : "hidden";
    const panel = target ? entry.outline?.current?.getBoundingClientRect() : undefined;
    if (entry.ring) {
      entry.ring.style.visibility = panel ? "visible" : "hidden";
      if (panel) {
        entry.ring.style.left = `${panel.left}px`;
        entry.ring.style.top = `${panel.top}px`;
        entry.ring.style.width = `${panel.width}px`;
        entry.ring.style.height = `${panel.height}px`;
      }
    }
    if (!target) continue;
    const width = entry.tip.offsetWidth;
    const height = entry.tip.offsetHeight;
    if (entry.side === "right") {
      /* A tip about a whole panel starts level with the panel's top; the arrow still points at the control (the panel's header). */
      const top = panel ? panel.top : entry.alignTop ? target.top : target.top + target.height / 2 - height / 2;
      plans.push({ entry, target, width, height, left: Math.min(target.right + GAP, window.innerWidth - width - EDGE), top });
    } else {
      const left = within(target.left + target.width / 2 - width / 2, EDGE, window.innerWidth - width - EDGE);
      plans.push({ entry, target, width, height, left, top: entry.side === "above" ? target.top - height - GAP : target.bottom + GAP });
    }
  }
  plans.sort((a, b) => a.top - b.top);
  const placed: Box[] = [];
  for (const plan of plans) {
    const { entry, target, width, height, left } = plan;
    let top = plan.top;
    /* Each move clears one tip; a tip can move past each placed tip once. */
    for (let tries = 0; tries <= placed.length; tries++) {
      const hit = placed.find((box) => left < box.right && left + width > box.left && top < box.bottom && top + height > box.top);
      if (!hit) break;
      top = entry.side === "above" ? hit.top - height - TIP_GAP : hit.bottom + TIP_GAP;
    }
    top = within(top, EDGE, window.innerHeight - height - EDGE);
    entry.tip.style.left = `${left}px`;
    entry.tip.style.top = `${top}px`;
    if (entry.side === "right") entry.tip.style.setProperty("--arrow-y", `${within(target.top + target.height / 2 - top, ARROW_INSET, height - ARROW_INSET)}px`);
    else entry.tip.style.setProperty("--arrow-x", `${within(target.left + target.width / 2 - left, ARROW_INSET, width - ARROW_INSET)}px`);
    placed.push({ left, top, right: left + width, bottom: top + height });
  }
  frame = shown.size ? requestAnimationFrame(placeAll) : 0;
}

/** Places the tips now, so a new tip does not show at the corner first, and keeps the loop running. */
function show(entry: Shown) {
  shown.add(entry);
  cancelAnimationFrame(frame);
  placeAll();
}

function hide(entry: Shown) {
  shown.delete(entry);
  if (shown.size === 0) {
    cancelAnimationFrame(frame);
    frame = 0;
  }
}

/**
 * A context tip with an arrow to a control, and a close button: at the
 * right of the control, or above or below it ("side"). It stays in the
 * window, keeps clear of the other tips (see placeAll), and follows the
 * control while the panels around it change size. With "outline", a green
 * line also goes round that panel while the tip shows, and a tip at the
 * right starts level with the panel's top. Help, Disable Pointers hides
 * every tip.
 */
export function PointerTip(props: TipProps) {
  const on = useSyncExternalStore(subscribeHelp, pointersOn);
  return on ? <PlacedTip {...props} /> : null;
}

interface TipProps {
  anchor: RefObject<HTMLElement | null>;
  text: string;
  onClose: () => void;
  side?: Side;
  outline?: RefObject<HTMLElement | null>;
  /** At the right: start level with the control's top, with the arrow near the tip's top. */
  alignTop?: boolean;
}

function PlacedTip({ anchor, text, onClose, side = "right", outline, alignTop = false }: TipProps) {
  const tipRef = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!tip) return;
    const entry = { tip, anchor, side, ring: ringRef.current, outline, alignTop };
    show(entry);
    return () => hide(entry);
  }, [anchor, side, outline, alignTop]);
  return createPortal(
    <>
      {outline && <div ref={ringRef} className="pointer-ring" aria-hidden="true" />}
      <div ref={tipRef} className={`pointer-tip ${side}`} role="status">
        <span className="selectable">{text}</span>
        <button className="help-card-close" onClick={onClose} aria-label="Close the tip" data-tip="Close">
          <X size={14} />
        </button>
      </div>
    </>,
    document.body
  );
}
