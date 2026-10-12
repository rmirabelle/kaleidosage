import { useEffect, useRef, useState, type ReactNode } from "react";
import { CaretRight, Pause, Play, Sparkle, Stop } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { formatValue, type GroupKey, type ParamKey, type PlayState } from "../engine/params";
import type { MapMode } from "../engine/renderer";
import { RangeSlider, Slider, rangePosition } from "./Slider";

interface Props {
  engine: Engine;
  /** Changes when the parameters change outside the panel (Randomize), so the controls reload. */
  revision: number;
  paused: boolean;
  onRandomize: () => void;
  onTogglePause: () => void;
  onStop: () => void;
}

const KALEIDOSCOPE_KEYS: ParamKey[] = ["segments", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl", "hue"];
const BLUR_KEYS: ParamKey[] = ["blurAngle", "blurDist", "focusSize", "focusSoft"];
const WARP_KEYS: ParamKey[] = ["warpAmount", "warpScale", "warpMarble", "warpDetail", "warpFlow"];
/** The sliders each complex map uses; the others are hidden. */
const MAP_KEYS: Record<MapMode, ParamKey[]> = {
  0: [],
  1: ["mapPower", "mapScale", "mapMix"],
  2: ["mapPointX", "mapPointY", "mapScale", "mapMix"],
  3: ["mapPointX", "mapPointY", "mapSteps", "mapScale", "mapMix"],
  4: ["mapTwist", "mapScale", "mapMix"],
  5: ["mapScale", "mapMix"]
};
const TRAIL_KEYS: ParamKey[] = ["trailAmount", "trailZoom", "trailTurn", "trailHue"];
const FINISH_KEYS: ParamKey[] = ["sharpen", "sharpenRadius", "contrast"];

const WARP_MODES = [[1, "Screen (breaks symmetry)"], [2, "Image (keeps symmetry)"]] as const;
const MAP_MODES = [[1, "Power (z^n)"], [2, "Möbius"], [3, "Julia"], [4, "Log spiral"], [5, "Sine"]] as const;
const BLUR_MODES = [[0, "Linear"], [1, "Radial (zoom)"], [2, "Spin"]] as const;
const TRAIL_MODES = [[1, "Mix (smoky)"], [2, "Lighten (glowing)"]] as const;

export function ControlPanel({ engine, revision, paused, onRandomize, onTogglePause, onStop }: Props) {
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
  /** Only one group is open at a time. Opening a group closes the others; clicking the open group closes it. */
  const [openGroup, setOpenGroup] = useState<string | null>(readOpenGroup);
  const accordion = (key: string) => ({
    open: openGroup === key,
    onToggle: () => {
      const next = openGroup === key ? null : key;
      setOpenGroup(next);
      writeOpenGroup(next);
    }
  });

  const row = (key: ParamKey) => (
    <ParamRow
      key={key}
      engine={engine}
      paramKey={key}
      readout={register(key)}
      marker={registerMarker(key)}
      onHold={(value) => { if (value === null) held.current.delete(key); else held.current.set(key, value); }}
    />
  );

  return (
    <aside className="control-panel" key={revision}>
      <div className="panel-buttons">
        <button className="panel-button" onClick={onRandomize} title="Random settings (X)"><Sparkle size={15} /> Randomize</button>
        <button className="panel-button" onClick={onTogglePause} title="Pause or play (Space)">
          {paused ? <><Play size={15} /> Play</> : <><Pause size={15} /> Pause</>}
        </button>
        <button className="panel-button" onClick={onStop} title="Stop: pause, and move every range to its minimum">
          <Stop size={15} /> Stop
        </button>
      </div>

      <Group engine={engine} group="warp" title="Noise warp" {...accordion("warp")}>
        <ModeSelect engine={engine} stateKey="warpMode" options={WARP_MODES} />
        {WARP_KEYS.map(row)}
      </Group>

      <Group engine={engine} group="map" title="Complex map" {...accordion("map")}>
        <MapSection engine={engine} row={row} />
      </Group>

      <Group engine={engine} group="kaleidoscope" title="Kaleidoscope" {...accordion("kaleidoscope")}>
        {KALEIDOSCOPE_KEYS.map(row)}
      </Group>

      <Group engine={engine} group="blur" title="Motion blur" {...accordion("blur")}>
        <ModeSelect engine={engine} stateKey="blurMode" options={BLUR_MODES} />
        {BLUR_KEYS.map(row)}
      </Group>

      <Group engine={engine} group="trails" title="Trails" {...accordion("trails")}>
        <ModeSelect engine={engine} stateKey="trailMode" options={TRAIL_MODES} />
        {TRAIL_KEYS.map(row)}
      </Group>

      <Group engine={engine} group="finish" title="Final effects" {...accordion("finish")}>
        {FINISH_KEYS.map(row)}
      </Group>

      <Group title="Animation" {...accordion("animation")}>
        <SpeedRow engine={engine} />
      </Group>
    </aside>
  );
}

const OPEN_GROUP_KEY = "kaleidosage.openGroup";

/** Reads which group was open, from this viewer's browser storage. All groups start closed. Storage can be missing or blocked. */
function readOpenGroup(): string | null {
  try {
    return localStorage.getItem(OPEN_GROUP_KEY);
  } catch {
    return null;
  }
}

function writeOpenGroup(key: string | null) {
  try {
    if (key) localStorage.setItem(OPEN_GROUP_KEY, key);
    else localStorage.removeItem(OPEN_GROUP_KEY);
  } catch {
    /* The open group is only a convenience. */
  }
}

/**
 * A titled group of settings that opens and closes with a slide. With an
 * engine and a group key, its check box turns the whole group's effect on
 * or off. A group that is off keeps its settings, shown dimmed, so turning
 * it on again restores them. Closed contents stay in the page, so they can
 * slide, but "inert" keeps the keyboard out of them.
 */
function Group({ engine, group, title, open, onToggle, children }: {
  engine?: Engine;
  group?: GroupKey;
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(engine && group ? engine.state.groups[group] : true);

  return (
    <section className={`panel-group ${enabled ? "" : "disabled"} ${open ? "open" : ""}`}>
      <header className="panel-group-header">
        <button className="panel-group-title" onClick={onToggle} aria-expanded={open}>
          <CaretRight size={12} weight="bold" className="panel-group-caret" />
          {title}
        </button>
        {engine && group && (
          <input
            type="checkbox"
            className="panel-group-toggle"
            checked={enabled}
            title={enabled ? `Turn off ${title.toLowerCase()}` : `Turn on ${title.toLowerCase()}`}
            aria-label={`${title} on`}
            onChange={(event) => {
              engine.state.groups[group] = event.target.checked;
              setEnabled(event.target.checked);
            }}
          />
        )}
      </header>
      <div className="panel-group-body" inert={!open}>
        <div className="panel-group-inner">{children}</div>
      </div>
    </section>
  );
}

type ModeKey = "warpMode" | "mapMode" | "blurMode" | "trailMode";

/** A menu that sets one of the engine's mode values. */
function ModeSelect<K extends ModeKey>({ engine, stateKey, options, onChange }: {
  engine: Engine;
  stateKey: K;
  options: readonly (readonly [PlayState[K], string])[];
  onChange?: (mode: PlayState[K]) => void;
}) {
  const [mode, setMode] = useState<PlayState[K]>(engine.state[stateKey]);
  return (
    <div className="panel-select-row">
      <select
        className="panel-select"
        value={mode}
        onChange={(event) => {
          const next = Number(event.target.value) as PlayState[K];
          engine.state[stateKey] = next;
          setMode(next);
          onChange?.(next);
        }}
      >
        {options.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </div>
  );
}

/** The complex map picker, and the sliders for the picked map. */
function MapSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [mode, setMode] = useState<MapMode>(engine.state.mapMode);
  return (
    <>
      <ModeSelect engine={engine} stateKey="mapMode" options={MAP_MODES} onChange={setMode} />
      {MAP_KEYS[mode].map(row)}
    </>
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

  const toggleDrift = (on: boolean) => {
    /* Stopping keeps the value where the drift left it, so the picture does not jump. */
    if (!on) {
      param.value = Number(engine.live(paramKey).toFixed(2));
      setValue(param.value);
    }
    param.on = on;
    setDrifting(on);
  };

  return (
    <div className="panel-row">
      <div className="panel-row-top">
        <span className="panel-row-name">{param.label}</span>
        <span className="panel-row-value" ref={readout} />
        {param.drift && (
          <label className="panel-drift" title="Animate this value between two limits">
            <input type="checkbox" checked={drifting} onChange={(event) => toggleDrift(event.target.checked)} />
            range
          </label>
        )}
      </div>
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
          onChange={(low, high) => { param.low = low; param.high = high; setRange([low, high]); }}
        />
      ) : (
        <Slider
          label={param.label}
          min={param.min}
          max={param.max}
          step={param.step}
          value={value}
          onChange={(next) => { param.value = next; setValue(next); }}
        />
      )}
    </div>
  );
}

function SpeedRow({ engine }: { engine: Engine }) {
  const [speed, setSpeed] = useState(engine.state.speed);
  return (
    <div className="panel-row">
      <div className="panel-row-top">
        <span className="panel-row-name">Speed</span>
        <span className="panel-row-value">{speed.toFixed(2)}×</span>
      </div>
      <Slider label="Speed" min={0} max={4} step={0.01} value={speed} onChange={(next) => { engine.state.speed = next; setSpeed(next); }} />
    </div>
  );
}
