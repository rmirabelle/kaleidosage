import { useEffect, useRef, useState } from "react";
import { ArrowsLeftRight, BracketsSquare, Timer } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { MAX_CUSTOM_SECONDS, NO_EFFECT, defaultValue, formatValue, fullRange, setCustomTime, type ParamKey } from "../engine/params";
import { ColorPicker } from "./ColorPicker";
import { EaseMenu } from "./EaseMenu";
import { RangeSlider, Slider, rangePosition } from "./Slider";

/**
 * This file holds the hook and its row component, apart from the panels, so
 * the dev server can reload the panels in place when they change.
 */

/**
 * Rows of parameter controls whose readouts and drift lines follow the live
 * values. It returns a function that draws the row for one parameter.
 */
export function useParamRows(engine: Engine) {
  const readouts = useRef(new Map<ParamKey, HTMLSpanElement>());
  const markers = useRef(new Map<ParamKey, HTMLDivElement>());
  /** The value of a drift handle that is being dragged. Its readout shows it instead of the live value. */
  const held = useRef(new Map<ParamKey, number>());

  /** The readouts and drift lines show the live value each frame, so drifting values can be seen moving. */
  useEffect(() => engine.onFrame(() => {
    for (const [key, element] of readouts.current) {
      const heldValue = held.current.get(key);
      const text = formatValue(engine.params[key], heldValue ?? engine.live(key));
      if (element.textContent !== text) element.textContent = text;
      element.classList.toggle("held", heldValue !== undefined);
    }
    for (const [key, element] of markers.current) {
      const param = engine.params[key];
      element.style.left = rangePosition(engine.live(key), param.min, param.max);
    }
  }), [engine]);

  const register = (key: ParamKey) => (element: HTMLSpanElement | null) => {
    if (element) readouts.current.set(key, element);
    else readouts.current.delete(key);
  };
  const registerMarker = (key: ParamKey) => (element: HTMLDivElement | null) => {
    if (element) markers.current.set(key, element);
    else markers.current.delete(key);
  };

  return (key: ParamKey) => (
    <ParamRow
      key={key}
      engine={engine}
      paramKey={key}
      readout={register(key)}
      marker={registerMarker(key)}
      onHold={(value) => { if (value === null) held.current.delete(key); else held.current.set(key, value); }}
    />
  );
}

/**
 * One parameter. With drift off, one handle sets the value. With drift on,
 * two handles set where the drift starts and ends, and a thin line shows the
 * live value. The readout and the line are written by the frame loop, not by
 * React, because drifting values change every frame.
 */
function ParamRow({ engine, paramKey, readout, marker, onHold }: {
  engine: Engine;
  paramKey: ParamKey;
  readout: (element: HTMLSpanElement | null) => void;
  marker: (element: HTMLDivElement | null) => void;
  onHold: (value: number | null) => void;
}) {
  const param = engine.params[paramKey];
  const [value, setValue] = useState(param.value);
  const [drifting, setDrifting] = useState(param.on ?? false);
  const [range, setRange] = useState<[number, number]>([param.low ?? param.min, param.high ?? param.max]);
  /** A custom range has its own time (seconds from start to end) instead of the shared cycle. */
  const [custom, setCustom] = useState(param.custom ?? false);
  const [seconds, setSeconds] = useState(Math.round(param.seconds ?? engine.params.cycle.value));
  /** The zero point, when it is inside the slider: a tick mark, and what Ctrl + drag mirrors around. */
  const noEffect = NO_EFFECT[paramKey];

  const setHandles = ([low, high]: [number, number]) => {
    param.low = low;
    param.high = high;
    setRange([low, high]);
  };

  const toggleCustom = () => {
    /* A range that had its own time before gets it back; a new one starts at the cycle's length. */
    setCustomTime(param, custom ? null : seconds, engine.state);
    setCustom(!custom);
  };

  const reset = () => {
    if (drifting) {
      setHandles(fullRange(param));
    } else {
      param.value = defaultValue(paramKey);
      setValue(param.value);
    }
  };

  const toggleDrift = (on: boolean) => {
    /**
     * The end handle and the single value hand over to each other: value to
     * range sets the end, range to value takes the end. A control that goes
     * below zero instead starts its range around 0, 10% of the slider's span
     * on each side.
     */
    if (on && param.min < 0 && param.max > 0) {
      const decimals = (String(param.step).split(".")[1] ?? "").length;
      const distance = Number((Math.round((param.max - param.min) * 0.1 / param.step) * param.step).toFixed(decimals));
      setHandles([Math.max(param.min, -distance), Math.min(param.max, distance)]);
    } else if (on) {
      param.high = param.value;
      setRange([range[0], param.value]);
    } else {
      param.value = range[1];
      setValue(param.value);
    }
    param.on = on;
    setDrifting(on);
  };

  return (
    <div className="panel-row">
      <div className="panel-row-top">
        {/* Double-click on the name: back to the default value, or the full range. */}
        <span className="panel-row-name" onDoubleClick={reset}>{param.label}</span>
        <span className="panel-row-value" ref={readout} />
      </div>
      <div className="panel-row-control">
        {paramKey === "overlayOpacity" && <ColorSwatch engine={engine} stateKey="overlayColor" label="Overlay color" />}
        {paramKey === "trailTint" && <ColorSwatch engine={engine} stateKey="trailColor" label="Trail color" />}
        {drifting ? (
          <RangeSlider
            label={param.label}
            min={param.min}
            max={param.max}
            step={param.step}
            low={range[0]}
            high={range[1]}
            markerRef={marker}
            onHold={onHold}
            detent={noEffect}
            onChange={(low, high) => setHandles([low, high])}
          />
        ) : (
          <Slider
            label={param.label}
            min={param.min}
            max={param.max}
            step={param.step}
            value={value}
            detent={noEffect}
            onChange={(next) => { param.value = next; setValue(next); }}
          />
        )}

        {/* The range and reverse buttons, after the slider. A value without a range gets an empty space, so every slider lines up. */}
        {param.drift ? (
          <div className="panel-row-tools">
            <button
              className={`panel-drift ${drifting ? "on" : ""}`}
              aria-pressed={drifting}
              aria-label={`${param.label} range`}
              title={drifting ? "Range on: the value moves between two handles. Click for a single value." : "Move the value between two handles"}
              onClick={() => toggleDrift(!drifting)}
            >
              <BracketsSquare size={13} weight="bold" />
            </button>
            {/* Hidden, not removed, while the range is off, so the slider does not move. */}
            <button
              className={`panel-reverse ${range[1] < range[0] ? "on" : ""}`}
              title={range[1] < range[0] ? "Reversed: the value moves from the right handle to the left. Click to reverse." : "Reverse the range"}
              aria-label={`Reverse the ${param.label.toLowerCase()} range`}
              aria-pressed={range[1] < range[0]}
              disabled={!drifting}
              onClick={() => {
                const [low, high] = [range[1], range[0]];
                param.low = low;
                param.high = high;
                setRange([low, high]);
              }}
            >
              {/* One icon either way; the button's lit state shows a reversed range. */}
              <ArrowsLeftRight size={13} />
            </button>
            <EaseMenu param={param} disabled={!drifting} />
            <button
              className={`panel-custom ${custom ? "on" : ""}`}
              aria-pressed={custom}
              aria-label={`${param.label} own time`}
              title={custom ? "Own time: this range ignores the loop length. Click to follow the loop length again." : "Give this range its own time instead of the loop length"}
              disabled={!drifting}
              onClick={toggleCustom}
            >
              <Timer size={13} weight={custom ? "bold" : "regular"} />
            </button>
          </div>
        ) : (
          <span className="panel-drift-space" />
        )}
      </div>
      {drifting && custom && (
        <div className="panel-row-control panel-row-time">
          <Slider
            label={`${param.label} time from start to end`}
            min={1}
            max={MAX_CUSTOM_SECONDS}
            step={1}
            value={seconds}
            onChange={(next) => {
              setCustomTime(param, next, engine.state);
              setSeconds(next);
            }}
          />
          <span className="panel-time-value" title="Seconds from the start handle to the end handle">{seconds} s</span>
        </div>
      )}
    </div>
  );
}

/** A color of the play state (the overlay color or the trail color): a swatch that opens the color picker. */
function ColorSwatch({ engine, stateKey, label }: { engine: Engine; stateKey: "overlayColor" | "trailColor"; label: string }) {
  const [color, setColor] = useState(engine.state[stateKey]);
  return (
    <ColorPicker
      color={color}
      label={label}
      onChange={(next) => {
        engine.state[stateKey] = next;
        setColor(next);
      }}
    />
  );
}
