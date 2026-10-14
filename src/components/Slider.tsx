import { useRef, useState, type PointerEvent as ReactPointerEvent, type Ref } from "react";
import { mirrorAround, shiftRange, snapToDetent } from "./sliderMath";

interface Bounds {
  min: number;
  max: number;
  step: number;
}

/** How far a handle's center stays from each end of the slider: half the handle width. */
const SLIDER_INSET = 7;
const RANGE_INSET = 4;

/** A position along a slider, as a CSS length from its left edge. */
export function trackPosition(value: number, min: number, max: number, inset = SLIDER_INSET) {
  const fraction = max > min ? (value - min) / (max - min) : 0;
  return `calc(${inset}px + ${Math.min(1, Math.max(0, fraction))} * (100% - ${inset * 2}px))`;
}

/** A position along a range slider, which has narrower handles. */
export function rangePosition(value: number, min: number, max: number) {
  return trackPosition(value, min, max, RANGE_INSET);
}

/**
 * One handle in a recessed well. A click anywhere on the well moves the
 * handle there. The filled part runs from the start to the handle.
 */
export function Slider({ min, max, step, value, onChange, label, detent }: Bounds & {
  value: number;
  onChange: (value: number) => void;
  label: string;
  /** The value with no effect: a tick mark shows it, and the handle snaps to it. */
  detent?: number;
}) {
  return (
    <div className="slider">
      {detent !== undefined && <div className="slider-detent" style={{ left: trackPosition(detent, min, max) }} />}
      <div className="slider-well">
        <div className="slider-fill" style={{ left: 0, width: trackPosition(value, min, max) }} />
      </div>
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(snapToDetent(Number(event.target.value), detent, min, max))}
      />
    </div>
  );
}

/**
 * Two handles that set where a drift starts ([) and ends (]), with no well:
 * only the part between the handles is drawn. The handles can pass each
 * other; a reversed range (end before start) is drawn in another color. A thin line ("marker") shows the
 * live value; the caller moves it each frame through markerRef. While a
 * handle is dragged, onHold receives that handle's value, then null when
 * the mouse button is released. A drag between the handles moves the whole
 * range and keeps its width. A detent (the zero point) shows as a tick
 * mark, and handles snap to it. Ctrl + drag on a handle mirrors it: the
 * other handle moves the same distance on the other side of the zero point
 * (or of the range's middle, for a slider with no zero point).
 */
export function RangeSlider({ min, max, step, low, high, onChange, onHold, label, markerRef, detent }: Bounds & {
  low: number;
  high: number;
  onChange: (low: number, high: number) => void;
  onHold?: (value: number | null) => void;
  label: string;
  markerRef?: Ref<HTMLDivElement>;
  detent?: number;
}) {
  /** While a handle is dragged with Ctrl held: the point the other handle mirrors around. */
  const mirror = useRef<number | null>(null);
  const dragging = useRef<"low" | "high" | null>(null);
  const onHoldRef = useRef(onHold);
  onHoldRef.current = onHold;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const [movingRange, setMovingRange] = useState(false);

  const startRangeMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    const grab = event.currentTarget;
    const slider = grab.parentElement!;
    /** The distance the handle centers can travel, in pixels. */
    const travel = slider.getBoundingClientRect().width - RANGE_INSET * 2;
    const startX = event.clientX;
    const [startLow, startHigh] = [low, high];
    grab.setPointerCapture(event.pointerId);
    setMovingRange(true);
    const move = (moveEvent: PointerEvent) => {
      const delta = travel > 0 ? (moveEvent.clientX - startX) / travel * (max - min) : 0;
      const [nextLow, nextHigh] = shiftRange(startLow, startHigh, delta, min, max, step);
      onChangeRef.current(nextLow, nextHigh);
    };
    const end = () => {
      setMovingRange(false);
      grab.removeEventListener("pointermove", move);
      grab.removeEventListener("pointerup", end);
      grab.removeEventListener("pointercancel", end);
    };
    grab.addEventListener("pointermove", move);
    grab.addEventListener("pointerup", end);
    grab.addEventListener("pointercancel", end);
  };
  const startDrag = (handle: "low" | "high", value: number, ctrl: boolean) => {
    dragging.current = handle;
    onHoldRef.current?.(value);
    /* Ctrl can also be pressed or let go during the drag. */
    const center = detent ?? (low + high) / 2;
    mirror.current = ctrl ? center : null;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Control") mirror.current = event.type === "keydown" ? center : null;
    };
    const end = () => {
      dragging.current = null;
      mirror.current = null;
      onHoldRef.current?.(null);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      window.removeEventListener("blur", end);
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKey);
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    window.addEventListener("blur", end);
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKey);
  };
  const changeLow = (raw: number) => {
    const value = snapToDetent(raw, detent, min, max);
    if (mirror.current !== null) {
      const [moved, other] = mirrorAround(value, mirror.current, min, max, step);
      if (dragging.current === "low") onHoldRef.current?.(moved);
      onChange(moved, other);
      return;
    }
    if (dragging.current === "low") onHoldRef.current?.(value);
    onChange(value, high);
  };
  const changeHigh = (raw: number) => {
    const value = snapToDetent(raw, detent, min, max);
    if (mirror.current !== null) {
      const [moved, other] = mirrorAround(value, mirror.current, min, max, step);
      if (dragging.current === "high") onHoldRef.current?.(moved);
      onChange(other, moved);
      return;
    }
    if (dragging.current === "high") onHoldRef.current?.(value);
    onChange(low, value);
  };
  /** When the handles meet, the one nearer the middle is on top, so either can still be dragged out. */
  const lowOnTop = low > (min + max) / 2;
  const reversed = high < low;
  const [left, right] = reversed ? [high, low] : [low, high];
  return (
    <div className={`slider range ${reversed ? "reversed" : ""}`}>
      {detent !== undefined && <div className="slider-detent" style={{ left: rangePosition(detent, min, max) }} />}
      <div
        className={`range-grab ${movingRange ? "moving" : ""}`}
        style={{ left: rangePosition(left, min, max), width: `calc(${rangePosition(right, min, max)} - ${rangePosition(left, min, max)})` }}
        onPointerDown={startRangeMove}
        title="Drag to move the whole range. Ctrl + drag a handle to mirror it."
      >
        <div className="slider-fill" />
      </div>
      <div className="slider-marker" ref={markerRef} />
      <input
        type="range"
        className="range-low"
        aria-label={`${label} start`}
        min={min}
        max={max}
        step={step}
        value={low}
        style={{ zIndex: lowOnTop ? 2 : 1 }}
        title="Ctrl + drag: the other handle mirrors this one"
        onPointerDown={(event) => startDrag("low", low, event.ctrlKey)}
        onChange={(event) => changeLow(Number(event.target.value))}
      />
      <input
        type="range"
        className="range-high"
        aria-label={`${label} end`}
        min={min}
        max={max}
        step={step}
        value={high}
        style={{ zIndex: lowOnTop ? 1 : 2 }}
        title="Ctrl + drag: the other handle mirrors this one"
        onPointerDown={(event) => startDrag("high", high, event.ctrlKey)}
        onChange={(event) => changeHigh(Number(event.target.value))}
      />
    </div>
  );
}
