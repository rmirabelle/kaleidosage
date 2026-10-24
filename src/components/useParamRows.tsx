import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowsLeftRight, BracketsSquare, Play, Timer, Trash } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { MAX_CUSTOM_SECONDS, NO_EFFECT, SLIDER_STEPS, defaultValue, formatValue, fromSlider, fullRange, setCustomTime, toSlider, type ContourTone, type Param, type ParamKey } from "../engine/params";
import { ColorPicker } from "./ColorPicker";
import { EaseMenu } from "./EaseMenu";
import { RangeSlider, Slider, rangePosition, trackPosition } from "./Slider";
import { createPortal } from "react-dom";
import { NOT_MAPPABLE, midi } from "../lib/midi";
import { RANGE_ON_EVENT } from "../lib/pointerEvents";
import { ContextMenu, type MenuItem } from "./ContextMenu";
import { MidiIcon } from "./MidiIcon";
import { useMidi } from "./useMidi";
import { AudioLinkButton } from "./AudioLinkButton";
import { audioLinkable } from "../engine/audio";
import { help } from "../help/topics";
import { commonKeys, commonName } from "../engine/common";

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
  /** The live lines of single-value sliders: they show only while the sound moves the value away from its handle. */
  const singleMarkers = useRef(new Map<ParamKey, HTMLDivElement>());
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
    /* A line is blue while the sound or the song script moves its setting (the audio color), else the drift color. */
    for (const [key, element] of markers.current) {
      const param = engine.params[key];
      const [min, max] = sliderLimits(param);
      element.style.left = rangePosition(toSlider(param, engine.live(key)), min, max);
      element.classList.toggle("audio", engine.soundFamily(key) !== null);
    }
    for (const [key, element] of singleMarkers.current) {
      const param = engine.params[key];
      const [min, max] = sliderLimits(param);
      const moving = engine.soundFamily(key) !== null;
      element.classList.toggle("idle", !moving);
      if (moving) element.style.left = trackPosition(toSlider(param, engine.live(key)), min, max);
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
  const registerSingleMarker = (key: ParamKey) => (element: HTMLDivElement | null) => {
    if (element) singleMarkers.current.set(key, element);
    else singleMarkers.current.delete(key);
  };

  const rowWith = (key: ParamKey, { after, badge, menu }: { after?: ReactNode; badge?: ReactNode; menu?: MenuItem[] } = {}) => (
    <ParamRow
      key={key}
      engine={engine}
      paramKey={key}
      readout={register(key)}
      marker={registerMarker(key)}
      singleMarker={registerSingleMarker(key)}
      after={after}
      badge={badge}
      menu={menu}
      onHold={(value) => { if (value === null) held.current.delete(key); else held.current.set(key, value); }}
    />
  );
  /**
   * The row for one parameter. "with" can also put a control after its
   * slider, in the same row (the video crossfade after Scene length), a
   * badge after its value (HOLD after the Length), and give the row a
   * right-click menu (the Crossfade blend type).
   */
  return Object.assign((key: ParamKey) => rowWith(key), { with: rowWith });
}

/** The slider's ends and step: the parameter's own, or positions for a log slider (see toSlider). */
function sliderLimits(param: Param): [number, number, number] {
  return param.scale === "log" ? [0, SLIDER_STEPS, 1] : [param.min, param.max, param.step];
}

/** Hue sliders show the fully saturated colors along their track. */
/**
 * Counts that crossfade between whole numbers (the Droste spirals, the
 * Kaleidoscope segments): each whole number has a tick mark, and the
 * handles snap to it. The values between still work.
 */
const WHOLE_SNAP_KEYS: ParamKey[] = ["drosteSpirals", "segments"];

/** Settings whose small values near the zero point matter (a camera height of 0.01): the zero point keeps its tick mark, with no snap. */
const NO_DETENT_SNAP_KEYS: ParamKey[] = ["cameraHeight"];

/** What a setting is, at the start of its name's tooltip, for the settings that need it. */
const NAME_TIPS: Partial<Record<ParamKey, string>> = {
  cycle: "Scene loop length. Individual FX settings can have their own lengths."
};

const HUE_KEYS: ParamKey[] = ["contourHue"];

/**
 * One parameter. With drift off, one handle sets the value. With drift on,
 * two handles set where the drift starts and ends, and a thin line shows the
 * live value. The readout and the line are written by the frame loop, not by
 * React, because drifting values change every frame.
 */
function ParamRow({ engine, paramKey, readout, marker, singleMarker, after, badge, menu, onHold }: {
  engine: Engine;
  paramKey: ParamKey;
  /** A control after the slider, in the slider's row. */
  after?: ReactNode;
  /** A small button after the value. */
  badge?: ReactNode;
  /** The row's right-click menu, when it has one. */
  menu?: MenuItem[];
  readout: (element: HTMLSpanElement | null) => void;
  marker: (element: HTMLDivElement | null) => void;
  /** The single-value slider's live line, for a setting with an audio link. */
  singleMarker: (element: HTMLDivElement | null) => void;
  onHold: (value: number | null) => void;
}) {
  const param = engine.params[paramKey];
  const [value, setValue] = useState(param.value);
  const [drifting, setDrifting] = useState(param.on ?? false);
  const [range, setRange] = useState<[number, number]>([param.low ?? param.min, param.high ?? param.max]);
  /** A custom range has its own time (seconds from start to end) instead of the shared cycle. */
  const [custom, setCustom] = useState(param.custom ?? false);
  const [seconds, setSeconds] = useState(Math.round(param.seconds ?? engine.params.cycle.value));
  /** For the contour Color: black or white lines instead of the hue. Then the slider is off and has no range. */
  const [tone, setTone] = useState<ContourTone>(engine.state.contourTone);
  const toned = paramKey === "contourHue" && tone !== "hue";
  const pickTone = (next: ContourTone) => {
    engine.state.contourTone = next;
    setTone(next);
  };
  /** The zero point, when it is inside the slider: a tick mark, and what Ctrl + drag mirrors around. */
  const noEffect = NO_EFFECT[paramKey];
  /** The sliders work in slider positions; a log slider's positions are not its values (see toSlider). */
  const [sliderMin, sliderMax, sliderStep] = sliderLimits(param);
  const at = (number: number) => toSlider(param, number);
  const detent = noEffect === undefined ? undefined : at(noEffect);
  const snaps = WHOLE_SNAP_KEYS.includes(paramKey)
    ? Array.from({ length: Math.floor(param.max) - Math.ceil(param.min) + 1 }, (_, index) => at(Math.ceil(param.min) + index))
    : undefined;

  /** A MIDI knob moved this parameter: show its new value. */
  /**
   * Ctrl + mouse down on the name holds the setting at no effect until the
   * mouse button is released, for a quick comparison, like Ctrl + hold on
   * a group header. Nothing is saved or added to Undo.
   */
  const [bypassed, setBypassed] = useState(false);
  const releaseBypass = () => {
    engine.bypassedParams.delete(paramKey);
    setBypassed(false);
  };
  useEffect(() => {
    const release = () => {
      engine.bypassedParams.delete(paramKey);
      setBypassed(false);
    };
    window.addEventListener("blur", release);
    return () => {
      window.removeEventListener("blur", release);
      engine.bypassedParams.delete(paramKey);
    };
  }, [engine, paramKey]);
  /** True while a MIDI control moves this slider, and for 1 second after: the name lights orange. Each slider of a macro lights. */
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    let timer = 0;
    const stop = midi.onTouch((key) => {
      if (key !== paramKey) return;
      setTouched(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTouched(false), 1000);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [paramKey]);
  /** Where the row's right-click menu opened, while it is open. */
  const [menuAt, setMenuAt] = useState<{ left: number; top: number } | null>(null);
  /** A MIDI control holds this range's value; the play button lets the range play again. */
  const [held, setHeld] = useState(engine.isHeld(paramKey));
  useEffect(() => engine.onParamChange((key) => {
    if (key !== paramKey) return;
    const changed = engine.params[key];
    setValue(changed.value);
    setRange([changed.low ?? changed.min, changed.high ?? changed.max]);
    setHeld(engine.isHeld(key));
  }), [engine, paramKey]);

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
    <div
      className={`panel-row ${HUE_KEYS.includes(paramKey) ? "hue-track" : ""} ${NOT_MAPPABLE.includes(paramKey) ? "" : "has-midi"}`}
      {...help("row")}
      onContextMenu={menu && ((event) => {
        event.preventDefault();
        setMenuAt({ left: event.clientX, top: event.clientY });
      })}
    >
      {menu && menuAt && createPortal(<ContextMenu position={menuAt} items={menu} onClose={() => setMenuAt(null)} />, document.body)}
      {/**
        * The MIDI column, at the left of the setting while the MIDI view is
        * on: the MIDI button beside the name, with the remove button (while
        * it waits) at its right, and under it, beside the slider, the audio
        * button (while the audio view is on) and the play button of a range
        * that MIDI stopped.
        */}
      {!NOT_MAPPABLE.includes(paramKey) && (
        <>
          <div className="panel-row-midi top">
            <MidiAssign engine={engine} paramKey={paramKey} label={param.label} />
            <MidiRemove paramKey={paramKey} label={param.label} />
          </div>
          <div className="panel-row-midi bottom">
            {audioLinkable(paramKey, param) && <AudioLinkButton engine={engine} paramKey={paramKey} label={param.label} />}
            {held && (
              <button className="midi-play" data-tip="MIDI stopped this range at this value. Click to play the range again." aria-label={`Play the ${param.label.toLowerCase()} range again`} onClick={() => engine.resumeRange(paramKey)}>
                <Play size={12} weight="fill" />
              </button>
            )}
          </div>
        </>
      )}
      <div className="panel-row-top">
        <span className="panel-row-label">
          {/* Double-click on the name: back to the default value, or the full range. */}
          <span
            className={`panel-row-name ${touched ? "midi-touched" : ""} ${bypassed ? "bypassed" : ""}`}
            data-tip={`${NAME_TIPS[paramKey] ? `${NAME_TIPS[paramKey]} ` : ""}Double-click: back to the default. \`Ctrl\` + hold: no effect while held.${menu ? " Right-click: more choices." : ""}`}
            onDoubleClick={(event) => { if (!event.ctrlKey) reset(); }}
            onPointerDown={(event) => {
              if (!event.ctrlKey || event.button !== 0) return;
              event.preventDefault();
              engine.bypassedParams.add(paramKey);
              setBypassed(true);
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onLostPointerCapture={releaseBypass}
          >
            {param.label}
          </span>
        </span>
        <span className="panel-row-end">
          <span className="panel-row-value" ref={readout} />
          {badge}
        </span>
      </div>
      <div className="panel-row-control">
        {paramKey === "overlayOpacity" && <ColorSwatch engine={engine} stateKey="overlayColor" label="Overlay color" />}
        {paramKey === "trailTint" && <ColorSwatch engine={engine} stateKey="trailColor" label="Trail color" />}
        {paramKey === "cameraSky" && <ColorSwatch engine={engine} stateKey="skyColor" label="Sky color" />}
        {paramKey === "contourHue" && <ToneChips tone={tone} onChange={pickTone} />}
        {toned ? (
          /* A click on the dimmed slider goes back to the hue. */
          <div className="slider-off" data-tip="Click to use the Color slider again" onPointerDown={() => pickTone("hue")}>
            <Slider label={param.label} min={sliderMin} max={sliderMax} step={sliderStep} value={at(value)} onChange={() => {}} />
          </div>
        ) : drifting ? (
          <RangeSlider
            label={param.label}
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            low={at(range[0])}
            high={at(range[1])}
            markerRef={marker}
            onHold={(held) => onHold(held === null ? null : fromSlider(param, held))}
            detent={detent}
            snapToDetent={!NO_DETENT_SNAP_KEYS.includes(paramKey)}
            snaps={snaps}
            onChange={(low, high) => setHandles([fromSlider(param, low), fromSlider(param, high)])}
          />
        ) : (
          <Slider
            label={param.label}
            min={sliderMin}
            max={sliderMax}
            step={sliderStep}
            value={at(value)}
            detent={detent}
            snapToDetent={!NO_DETENT_SNAP_KEYS.includes(paramKey)}
            snaps={snaps}
            markerRef={param.drift ? singleMarker : undefined}
            onChange={(position) => {
              const next = fromSlider(param, position);
              param.value = next;
              setValue(next);
            }}
          />
        )}

        {/* The range and reverse buttons, after the slider. A value without a range gets an empty space, so every slider lines up. */}
        {param.drift && !toned ? (
          <div className="panel-row-tools">
            <button
              className={`panel-drift ${drifting ? "on" : ""}`}
              aria-pressed={drifting}
              aria-label={`${param.label} range`}
              data-tip={drifting ? "Range on: the value moves between two handles. Click for a single value." : "Move the value between two handles"}
              onClick={(event) => {
                /* A range that the user turns on can start the ranged slider tip (see App). */
                if (!drifting) event.currentTarget.dispatchEvent(new Event(RANGE_ON_EVENT, { bubbles: true }));
                toggleDrift(!drifting);
              }}
            >
              <BracketsSquare size={13} weight="bold" />
            </button>
            {/* Hidden, not removed, while the range is off, so the slider does not move. */}
            <button
              className={`panel-reverse ${range[1] < range[0] ? "on" : ""}`}
              data-tip={range[1] < range[0] ? "Reversed: the value moves from the right handle to the left. Click to reverse." : "Reverse the range"}
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
              data-tip={custom ? "Own time: this range ignores the scene length. Click to follow the scene length again." : "Give this range its own time instead of the scene length"}
              disabled={!drifting}
              onClick={toggleCustom}
            >
              <Timer size={13} weight={custom ? "bold" : "regular"} />
            </button>
          </div>
        ) : (
          <>
            {after}
            <span className="panel-drift-space" />
          </>
        )}
      </div>
      {drifting && custom && (
        <div className="panel-row-control panel-row-time">
          <span className="panel-time-label">Loop</span>
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
          <span className="panel-time-value" data-tip="Seconds from the start handle to the end handle">{seconds} s</span>
        </div>
      )}
    </div>
  );
}

/** The remove button under a slider's MIDI button: it shows while the slider waits for a control and has one, and removes its controls. */
function MidiRemove({ paramKey, label }: { paramKey: ParamKey; label: string }) {
  const { armed, mapped } = useMidi();
  if (!armed.includes(paramKey) || !mapped.has(paramKey)) return null;
  return (
    <button className="midi-remove" data-tip="Remove the MIDI control" aria-label={`Remove the MIDI control from ${label}`} onClick={() => midi.clearAll(commonKeys(paramKey))}>
      <Trash size={12} weight="bold" />
    </button>
  );
}

/**
 * The MIDI button of one slider, in the MIDI column at the left of the
 * setting (see the Show MIDI button before the FX title). A click waits for the
 * next knob or fader move and adds that control to this slider. Nothing is
 * taken away: a control can move several sliders (a macro), and a slider
 * can have several controls. A second click or Esc stops waiting. The
 * tooltip names the slider's controls and the other sliders they move. It is lit while a control is
 * assigned. While it waits, an assigned slider also shows a remove button (see MidiRemove);
 * a right-click on the lit icon removes the control too. It shows only
 * while a MIDI controller is connected, or when a control is assigned. On a
 * common setting (see engine/common.ts) it works on that setting in every
 * effect: one control moves every Pan X, for example.
 */
function MidiAssign({ engine, paramKey, label }: { engine: Engine; paramKey: ParamKey; label: string }) {
  const { available, devices, armed, mapped } = useMidi();
  const waiting = armed.includes(paramKey);
  const assigned = mapped.has(paramKey);
  const keys = commonKeys(paramKey);
  /** The common setting's shared name, for the tooltips, or null for a setting of the effect's own. */
  const shared = keys.length > 1 ? commonName(paramKey) ?? null : null;

  /* Capture, so Esc stops waiting and does not also leave full screen. */
  useEffect(() => {
    if (!waiting) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      midi.setLearning(false);
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [waiting]);

  if (NOT_MAPPABLE.includes(paramKey) || (!assigned && (!available || devices.length === 0))) return null;
  /** Where this slider's control is, and the other sliders that the same control moves. */
  const where = assigned ? midi.mappings([paramKey]).map(({ device, control }) => {
    const [channel, number] = control.split(":");
    const others = midi.sliders(device, control).filter((key) => !keys.includes(key)).map((key) => engine.params[key].label);
    return `Control ${number}, channel ${channel} (${device})${others.length ? `. It also moves ${others.join(", ")}` : ""}.`;
  }).join(" ") : "";
  const target = shared ? `${shared} in every effect` : "this slider";
  const title = waiting
    ? `Move a knob or fader to assign it to ${target}. Click or \`Esc\` to stop.`
    : assigned
      ? `${where} Click to add another control; right-click to remove every control from ${target}.`
      : `Assign a MIDI knob or fader to ${target}`;
  return (
    <>
      <button
        className={`midi-assign ${assigned ? "on" : ""} ${waiting ? "waiting" : ""}`}
        data-tip={title}
        aria-label={waiting ? `Stop waiting for a MIDI control for ${label}` : `Assign a MIDI control to ${label}`}
        aria-pressed={waiting}
        onClick={() => waiting ? midi.setLearning(false) : midi.assign(keys)}
        onContextMenu={(event) => {
          event.preventDefault();
          if (assigned) midi.clearAll(keys);
        }}
      >
        <MidiIcon size={13} />
      </button>
    </>
  );
}

/**
 * Two small chips before the contour Color slider: black and white. A
 * click picks that color for the lines; a click on the picked chip goes
 * back to the slider's hue.
 */
function ToneChips({ tone, onChange }: { tone: ContourTone; onChange: (tone: ContourTone) => void }) {
  return (
    <div className="tone-chips">
      {(["black", "white"] as const).map((chip) => (
        <button
          key={chip}
          className={`tone-chip ${chip} ${tone === chip ? "on" : ""}`}
          aria-pressed={tone === chip}
          aria-label={`${chip === "black" ? "Black" : "White"} lines`}
          data-tip={tone === chip ? `The lines are ${chip}. Click to use the Color slider again.` : `Make the lines ${chip}`}
          onClick={() => onChange(tone === chip ? "hue" : chip)}
        />
      ))}
    </div>
  );
}

/** A color of the play state (the overlay, trail or sky color): a swatch that opens the color picker. */
function ColorSwatch({ engine, stateKey, label }: { engine: Engine; stateKey: "overlayColor" | "trailColor" | "skyColor"; label: string }) {
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
