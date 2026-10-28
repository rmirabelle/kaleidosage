import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import type { Engine } from "../engine/engine";
import { MAX_GRADIENT_STOPS, gradientColorAt, hexToRgb, rgbToHex, type GradientStop } from "../engine/params";
import { ColorPopup } from "./ColorPicker";

/** How far below the bar a dragged stop must go to be removed, in pixels. */
const REMOVE_DISTANCE = 28;

/** A press that moves less than this, in pixels, is a click (it opens the stop's color), not a drag. */
const CLICK_DISTANCE = 3;

const inOrder = (stops: readonly GradientStop[]) => [...stops].sort((a, b) => a.at - b.at);

/** The CSS gradient that the bar shows, in the stops' order. */
const cssGradient = (stops: readonly GradientStop[]) =>
  `linear-gradient(to right, ${inOrder(stops).map((stop) => `${stop.color} ${(stop.at * 100).toFixed(1)}%`).join(", ")})`;

/** A gray's brightness, 0 to 100 (the average of its channels). */
const grayLevel = (hex: string) => Math.round((hexToRgb(hex).reduce((sum, channel) => sum + channel, 0) / 3) * 100);
/** The gray of brightness "level" (0 to 100). */
const grayHex = (level: number) => {
  const value = Math.round(Math.min(100, Math.max(0, level)) * 2.55) / 255;
  return rgbToHex([value, value, value]);
};

/**
 * A gray stop's popup: one slider from black to white, and its brightness
 * in percent. It opens under the stop (above it when there is no room
 * below). A press outside it closes it; Esc puts the gray back and closes.
 */
function GrayPopup({ anchor, color, onChange, onClose }: { anchor: HTMLElement; color: string; onChange: (color: string) => void; onClose: () => void }) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [level, setLevel] = useState(() => grayLevel(color));
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const initialRef = useRef(color);
  const handlers = useRef({ onChange, onClose });
  handlers.current = { onChange, onClose };
  useLayoutEffect(() => {
    const stop = anchor.getBoundingClientRect();
    const popup = popupRef.current!.getBoundingClientRect();
    const left = Math.max(8, Math.min(stop.left - popup.width / 2, window.innerWidth - popup.width - 8));
    const below = stop.bottom + 6;
    setPosition({ left, top: below + popup.height > window.innerHeight - 8 ? Math.max(8, stop.top - popup.height - 6) : below });
  }, [anchor]);
  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!popupRef.current?.contains(target) && !anchor.contains(target)) handlers.current.onClose();
    };
    /* Capture, so Esc does not also leave full screen. */
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      handlers.current.onChange(initialRef.current);
      handlers.current.onClose();
    };
    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [anchor]);
  const set = (next: number) => {
    setLevel(next);
    handlers.current.onChange(grayHex(next));
  };
  return (
    <div ref={popupRef} className="color-popup gray-popup" style={position ?? { left: -9999, top: -9999 }}>
      <div className="gray-popup-row">
        <span className="gray-popup-swatch" style={{ background: grayHex(level) }} />
        <input type="range" min={0} max={100} step={1} value={level} aria-label="Gray" onChange={(event) => set(Number(event.target.value))} />
        <span className="gray-popup-value">{level}%</span>
      </div>
    </div>
  );
}

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
 *
 * "gray" (the Opacity mask's state.maskStops): every stop is a gray from
 * black to white, picked with a brightness slider, not a color picker.
 * "ends" names the bar's two ends, under it.
 */
export function GradientEditor({ engine, stateKey = "particleStops", gray = false, ends }: { engine: Engine; stateKey?: "particleStops" | "cyclesStops" | "outlineStops" | "cameraStops" | "maskStops"; gray?: boolean; ends?: readonly [string, string] }) {
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
    const color = rgbToHex(gradientColorAt(stops, at));
    const next = [...stops, { at, color: gray ? grayHex(grayLevel(color)) : color }];
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
          data-tip={full ? `The gradient has the most stops (${MAX_GRADIENT_STOPS}). Drag a stop down to remove it.` : gray ? "Click to add a gray stop here" : "Click to add a color stop here"}
          onPointerDown={addAt}
        />
        {stops.map((stop, index) => (
          <button
            key={index}
            ref={(element) => { handleRefs.current[index] = element; }}
            className={`gradient-stop ${picking === index ? "active" : ""} ${removing === index ? "removing" : ""}`}
            style={{ left: `${stop.at * 100}%`, ["--stop-color" as string]: stop.color }}
            aria-label={`${gray ? "Gray" : "Color"} stop at ${Math.round(stop.at * 100)}%`}
            data-tip={`Drag to move. Click to pick its ${gray ? "gray" : "color"}.${stops.length > 2 ? " Drag down or right-click to remove." : ""}`}
            onPointerDown={(event) => drag(event, index)}
            onContextMenu={(event) => {
              event.preventDefault();
              remove(index);
            }}
          />
        ))}
      </div>
      {ends && <div className="gradient-ends"><span>{ends[0]}</span><span>{ends[1]}</span></div>}
      {picking !== null && stops[picking] && anchor && gray && (
        <GrayPopup
          key={picking}
          anchor={anchor}
          color={stops[picking].color}
          onChange={(color) => write(stops.map((stop, other) => other === picking ? { ...stop, color } : stop))}
          onClose={() => setPicking(null)}
        />
      )}
      {picking !== null && stops[picking] && anchor && !gray && (
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
