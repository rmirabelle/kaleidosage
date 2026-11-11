import { Fragment, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { Plus, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { SPIRO_HOLE_KEYS, addSpiroWheel, removeSpiroWheel, type ParamKey } from "../engine/params";
import { MAX_SPIRO_TEETH, MAX_SPIRO_WHEELS, MIN_SPIRO_TEETH, spiroOutline, spiroTurns, type SpiroShape, type SpiroWheelSpec } from "../engine/spiro";
import { SPIRO_SHAPES } from "../engine/submodes";
import { ColorPicker } from "./ColorPicker";
import { Dropdown } from "./Dropdown";

/** The colors that new wheels get, in turn. */
const NEW_COLORS = ["#ffd23f", "#39ff14", "#b46cff", "#ff7a1a", "#2fb8ff", "#ff3d7f"];
/** The picture of a wheel shows this far from the wheel's center, where 1 is the wheel's farthest point. */
const VIEW = 1.12;

/** The wheel's edge as an SVG path. The picture's y goes down, so y is turned over. */
function outlinePath(shape: SpiroShape): string {
  const outline = spiroOutline(shape);
  let path = "";
  for (let i = 0; i < outline.length; i += 2) path += `${i === 0 ? "M" : "L"}${outline[i].toFixed(3)} ${(-outline[i + 1]).toFixed(3)}`;
  return `${path}Z`;
}

/**
 * The Spirograph's wheels (state.spiroWheels): for each wheel a card, then
 * the two sliders of its pen hole (see SPIRO_HOLE_KEYS), and at the end a
 * button that adds a wheel. A card has a picture of the wheel with its
 * hole, a Shape menu, a Teeth slider, the line's color, and a button that
 * removes the wheel.
 *
 * The hole in the picture shows the live place, written by the frame loop,
 * so a hole with a range can be seen moving. A click or a drag in the
 * picture sets the hole sliders; a slider that has a range keeps its range.
 */
export function SpiroWheels({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [wheels, setWheels] = useState<SpiroWheelSpec[]>(() => engine.state.spiroWheels.map((wheel) => ({ ...wheel })));
  /** Goes up when a wheel is added or removed: the hole sliders then show their new values and ranges. */
  const [revision, setRevision] = useState(0);
  const holes = useRef<(SVGCircleElement | null)[]>([]);
  useEffect(() => engine.onFrame(() => {
    holes.current.forEach((hole, index) => {
      if (!hole || !SPIRO_HOLE_KEYS[index]) return;
      hole.setAttribute("cx", engine.live(SPIRO_HOLE_KEYS[index][0]).toFixed(3));
      hole.setAttribute("cy", (-engine.live(SPIRO_HOLE_KEYS[index][1])).toFixed(3));
    });
  }), [engine]);

  const reread = () => {
    setWheels(engine.state.spiroWheels.map((wheel) => ({ ...wheel })));
    setRevision((value) => value + 1);
  };
  const change = (index: number, part: Partial<SpiroWheelSpec>) => {
    const next = wheels.map((wheel, other) => (other === index ? { ...wheel, ...part } : wheel));
    setWheels(next);
    engine.state.spiroWheels = next.map((wheel) => ({ ...wheel }));
  };
  const ring = Math.round(engine.params.spiroRing.value);

  const moveHole = (index: number, event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const place = (at: number, start: number, length: number) => Math.round(Math.min(1, Math.max(-1, ((at - start) / length * 2 - 1) * VIEW)) * 100) / 100;
    const places = [place(event.clientX, box.left, box.width), -place(event.clientY, box.top, box.height)];
    SPIRO_HOLE_KEYS[index].forEach((key, axis) => {
      const param = engine.params[key];
      if (param.on) return;
      param.value = places[axis];
      engine.paramChanged(key);
    });
  };

  return (
    <>
      {wheels.map((wheel, index) => (
        <Fragment key={`${revision}-${index}`}>
          <div className="spiro-wheel">
            <svg
              className="spiro-wheel-picture"
              viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
              data-tip="Click or drag to put the pen hole here. A hole slider that has a range keeps its range."
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                moveHole(index, event);
              }}
              onPointerMove={(event) => {
                if (event.currentTarget.hasPointerCapture(event.pointerId)) moveHole(index, event);
              }}
            >
              <path d={outlinePath(wheel.shape)} fill={`${wheel.color}33`} stroke={wheel.color} strokeWidth={0.04} strokeLinejoin="round" />
              <circle cx={0} cy={0} r={0.03} fill="#8c91a1" />
              <circle ref={(element) => { holes.current[index] = element; }} cx={engine.live(SPIRO_HOLE_KEYS[index][0])} cy={-engine.live(SPIRO_HOLE_KEYS[index][1])} r={0.1} fill="#fff" stroke="#000" strokeWidth={0.04} />
            </svg>
            <div className="spiro-wheel-settings">
              <div className="spiro-wheel-row">
                <span className="panel-row-name">Shape</span>
                <Dropdown value={wheel.shape} options={SPIRO_SHAPES} onChange={(shape) => change(index, { shape })} label="Wheel shape" />
              </div>
              <div className="spiro-wheel-row">
                <span className="panel-row-name">Teeth</span>
                <input
                  type="range"
                  min={MIN_SPIRO_TEETH}
                  max={MAX_SPIRO_TEETH}
                  step={1}
                  value={wheel.teeth}
                  aria-label="Wheel teeth"
                  data-tip={`The wheel's size. With ${ring} ring teeth, this wheel goes around ${spiroTurns(ring, wheel.teeth)} times before its line closes.`}
                  onChange={(event) => change(index, { teeth: Number(event.target.value) })}
                />
                <span className="spiro-wheel-value">{wheel.teeth}</span>
              </div>
              <div className="spiro-wheel-row">
                <span className="panel-row-name">Color</span>
                <ColorPicker color={wheel.color} onChange={(color) => change(index, { color })} label="Line color" />
                <span className="spiro-wheel-space" />
                {wheels.length > 1 && (
                  <button
                    className="spiro-wheel-remove"
                    aria-label="Remove wheel"
                    data-tip="Remove this wheel"
                    onClick={() => {
                      removeSpiroWheel(engine.params, engine.state, index);
                      reread();
                    }}
                  >
                    <X size={12} weight="bold" />
                  </button>
                )}
              </div>
            </div>
          </div>
          {row(SPIRO_HOLE_KEYS[index][0])}
          {row(SPIRO_HOLE_KEYS[index][1])}
        </Fragment>
      ))}
      {wheels.length < MAX_SPIRO_WHEELS && (
        <button
          className="spiro-wheel-add"
          data-tip="Add a wheel. Each wheel draws its own line."
          onClick={() => {
            addSpiroWheel(engine.params, engine.state, { shape: 0, teeth: 40, color: NEW_COLORS[wheels.length % NEW_COLORS.length] });
            reread();
          }}
        >
          <Plus size={12} weight="bold" /> Add wheel
        </button>
      )}
    </>
  );
}
