import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { Plus, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { MAX_SPIRO_TEETH, MAX_SPIRO_WHEELS, MIN_SPIRO_TEETH, spiroOutline, spiroTurns, type SpiroShape, type SpiroWheel } from "../engine/spiro";
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
 * The Spirograph's wheels (state.spiroWheels): one card for each wheel, and
 * a button that adds a wheel. A card has a picture of the wheel with its
 * hole, a Shape menu, a Teeth slider, the line's color, and a button that
 * removes the wheel. A click or a drag in the picture puts the hole there.
 * "ring" is the ring's teeth when the card was drawn, for the count of
 * turns that a card shows.
 */
export function SpiroWheels({ engine }: { engine: Engine }) {
  const [wheels, setWheels] = useState<SpiroWheel[]>(() => engine.state.spiroWheels.map((wheel) => ({ ...wheel })));
  const write = (next: SpiroWheel[]) => {
    setWheels(next);
    engine.state.spiroWheels = next.map((wheel) => ({ ...wheel }));
  };
  const change = (index: number, part: Partial<SpiroWheel>) => write(wheels.map((wheel, other) => (other === index ? { ...wheel, ...part } : wheel)));
  const ring = Math.round(engine.params.spiroRing.value);

  const moveHole = (index: number, event: ReactPointerEvent<SVGSVGElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    const place = (at: number, start: number, length: number) => Math.round(Math.min(1, Math.max(-1, ((at - start) / length * 2 - 1) * VIEW)) * 100) / 100;
    change(index, { x: place(event.clientX, box.left, box.width), y: -place(event.clientY, box.top, box.height) });
  };

  return (
    <div className="spiro-wheels">
      {wheels.map((wheel, index) => (
        <div className="spiro-wheel" key={index}>
          <svg
            className="spiro-wheel-picture"
            viewBox={`${-VIEW} ${-VIEW} ${VIEW * 2} ${VIEW * 2}`}
            data-tip="Click or drag to put the pen hole here"
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
            <circle cx={wheel.x} cy={-wheel.y} r={0.1} fill="#fff" stroke="#000" strokeWidth={0.04} />
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
                <button className="spiro-wheel-remove" aria-label="Remove wheel" data-tip="Remove this wheel" onClick={() => write(wheels.filter((_, other) => other !== index))}>
                  <X size={12} weight="bold" />
                </button>
              )}
            </div>
          </div>
        </div>
      ))}
      {wheels.length < MAX_SPIRO_WHEELS && (
        <button
          className="spiro-wheel-add"
          data-tip="Add a wheel. Each wheel draws its own line."
          onClick={() => write([...wheels, { shape: 0, teeth: 40, x: 0.6, y: 0, color: NEW_COLORS[wheels.length % NEW_COLORS.length] }])}
        >
          <Plus size={12} weight="bold" /> Add wheel
        </button>
      )}
    </div>
  );
}
