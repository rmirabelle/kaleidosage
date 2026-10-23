import { useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Engine } from "../engine/engine";
import { MAX_GRADIENT_STOPS, gradientColorAt, rgbToHex, type GradientStop } from "../engine/params";
import { ColorPopup } from "./ColorPicker";

/** How far below the bar a dragged stop must go to be removed, in pixels. */
const REMOVE_DISTANCE = 28;

/** A press that moves less than this, in pixels, is a click (it opens the stop's color), not a drag. */
const CLICK_DISTANCE = 3;

const inOrder = (stops: readonly GradientStop[]) => [...stops].sort((a, b) => a.at - b.at);

/** The CSS gradient that the bar shows, in the stops' order. */
const cssGradient = (stops: readonly GradientStop[]) =>
  `linear-gradient(to right, ${inOrder(stops).map((stop) => `${stop.color} ${(stop.at * 100).toFixed(1)}%`).join(", ")})`;

/**
 * A gradient of the play state (the particles' life gradient,
 * state.particleStops, or the light cycles' state.cyclesStops): a bar that shows the
 * gradient, with a handle under it for each color stop. A click on the bar
 * adds a stop there, in the color the gradient has there, and opens its
 * color picker. A handle drags left and right; a click on it opens its
 * color picker. Dragging a handle down off the bar, or a right-click on
 * it, removes the stop. A gradient keeps at least 2 stops and has at most
 * MAX_GRADIENT_STOPS.
 *
 * During a drag the stops keep their list order, so the dragged one keeps
 * its index; the engine always gets them in order of place.
 */
export function GradientEditor({ engine, stateKey = "particleStops" }: { engine: Engine; stateKey?: "particleStops" | "cyclesStops" }) {
  const [stops, setStops] = useState<GradientStop[]>(() => engine.state[stateKey].map((stop) => ({ ...stop })));
  /** The stop whose color picker is open. */
  const [picking, setPicking] = useState<number | null>(null);
  /** The stop that a drag down will remove when the mouse button goes up. */
  const [removing, setRemoving] = useState<number | null>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const handleRefs = useRef<(HTMLButtonElement | null)[]>([]);
  /** The open picker's handle, found after the handle is drawn (a new stop's handle is not there yet when it is picked). */
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => setAnchor(picking === null ? null : handleRefs.current[picking] ?? null), [picking]);

  const write = (next: GradientStop[]) => {
    setStops(next);
    engine.state[stateKey] = inOrder(next).map((stop) => ({ ...stop }));
  };
  const placeAt = (clientX: number) => {
    const bar = barRef.current!.getBoundingClientRect();
    return Math.round(Math.min(1, Math.max(0, (clientX - bar.left) / bar.width)) * 1000) / 1000;
  };
  const remove = (index: number) => {
    if (stops.length <= 2) return;
    setPicking(null);
    write(stops.filter((_, other) => other !== index));
  };

  const addAt = (event: ReactPointerEvent) => {
    if (event.button !== 0 || stops.length >= MAX_GRADIENT_STOPS) return;
    const at = placeAt(event.clientX);
    const next = [...stops, { at, color: rgbToHex(gradientColorAt(stops, at)) }];
    write(next);
    setPicking(next.length - 1);
  };

  const drag = (event: ReactPointerEvent<HTMLButtonElement>, index: number) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const barBottom = barRef.current!.getBoundingClientRect().bottom;
    let moved = false;
    let current = stops;
    const onMove = (move: PointerEvent) => {
      if (!moved && Math.abs(move.clientX - startX) < CLICK_DISTANCE && move.clientY - barBottom < REMOVE_DISTANCE) return;
      moved = true;
      setPicking(null);
      const off = current.length > 2 && move.clientY - barBottom >= REMOVE_DISTANCE;
      setRemoving(off ? index : null);
      current = current.map((stop, other) => other === index ? { ...stop, at: placeAt(move.clientX) } : stop);
      write(current);
    };
    const onUp = (up: PointerEvent) => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      setRemoving(null);
      if (!moved) {
        setPicking((open) => open === index ? null : index);
        return;
      }
      if (current.length > 2 && up.clientY - barBottom >= REMOVE_DISTANCE) {
        write(current.filter((_, other) => other !== index));
        return;
      }
      /* The drag is over: the list takes the order of place, so later indices match the bar. */
      write(inOrder(current));
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  const full = stops.length >= MAX_GRADIENT_STOPS;
  return (
    <div className="gradient-row">
      <div className="gradient-editor">
        <div
          ref={barRef}
          className={`gradient-bar ${full ? "full" : ""}`}
          style={{ background: cssGradient(stops) }}
          data-tip={full ? `The gradient has the most stops (${MAX_GRADIENT_STOPS}). Drag a stop down to remove it.` : "Click to add a color stop here"}
          onPointerDown={addAt}
        />
        {stops.map((stop, index) => (
          <button
            key={index}
            ref={(element) => { handleRefs.current[index] = element; }}
            className={`gradient-stop ${picking === index ? "active" : ""} ${removing === index ? "removing" : ""}`}
            style={{ left: `${stop.at * 100}%`, ["--stop-color" as string]: stop.color }}
            aria-label={`Color stop at ${Math.round(stop.at * 100)}%`}
            data-tip={stops.length > 2 ? "Drag to move. Click to pick its color. Drag down or right-click to remove." : "Drag to move. Click to pick its color."}
            onPointerDown={(event) => drag(event, index)}
            onContextMenu={(event) => {
              event.preventDefault();
              remove(index);
            }}
          />
        ))}
      </div>
      {picking !== null && stops[picking] && anchor && (
        <ColorPopup
          key={picking}
          anchor={anchor}
          color={stops[picking].color}
          onChange={(color) => write(stops.map((stop, other) => other === picking ? { ...stop, color } : stop))}
          onClose={() => setPicking(null)}
        />
      )}
    </div>
  );
}
