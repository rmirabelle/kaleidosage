import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CaretRight, DotsSixVertical, LockSimple, LockSimpleOpen } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { GroupKey, ParamKey, PlayState } from "../engine/params";
import type { BlurMask, FoldMode, MapMode, PictureStep, ShapeStep, WarpType } from "../engine/renderer";
import { Dropdown } from "./Dropdown";
import { MediaIcon } from "./MediaIcon";
import { PowerIcon } from "./PowerIcon";
import { RedDice } from "./RedDice";
import { useParamRows } from "./useParamRows";

interface Props {
  engine: Engine;
  /** Changes when the parameters change outside the panel (Randomize), so the controls reload. */
  revision: number;
  /** Changes each time Reset runs; the shape and picture groups then close. */
  resetCount: number;
  paused: boolean;
  onRandomize: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  onReset: () => void;
}

/** Radial mode uses segments; the tile modes use a tile size instead. */
const KALEIDOSCOPE_KEYS: Record<FoldMode, ParamKey[]> = {
  0: ["segments", "centerX", "centerY", "rotation", "zoom", "panX", "panY", "twirl"],
  1: ["tileSize", "panX", "panY", "centerX", "centerY", "rotation", "zoom", "twirl"],
  2: ["tileSize", "panX", "panY", "centerX", "centerY", "rotation", "zoom", "twirl"]
};
/** The sliders each blur mask uses; the others are hidden. */
const BLUR_KEYS: Record<BlurMask, ParamKey[]> = {
  0: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY"],
  1: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY"],
  2: ["blurAmount", "blurMaskAngle", "blurMaskSoft", "blurMaskX", "blurMaskY"],
  3: ["blurAmount", "blurMaskLevel", "blurMaskSoft"],
  4: ["blurAmount", "blurMaskLevel", "blurMaskSoft"],
  5: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY"]
};
const BLUR_MASKS = [
  [0, "Circle, sharp center"], [1, "Circle, blurred center"], [2, "Gradient"], [3, "Bright areas"], [4, "Dark areas"], [5, "Noise"]
] as const;
/** The sliders each kind of warp uses; the others are hidden. */
const WARP_KEYS: Record<WarpType, ParamKey[]> = {
  0: ["warpAmount", "warpScale", "warpMarble", "warpDetail", "warpFlow"],
  1: ["warpAmount", "warpScale", "warpFlow", "warpCenterX", "warpCenterY"],
  2: ["warpAmount", "warpScale", "warpAngle", "warpFlow"],
  3: ["warpAmount", "warpScale", "warpFlow", "warpCenterX", "warpCenterY"],
  4: ["warpAmount", "warpScale", "warpFlow", "warpCenterX", "warpCenterY"],
  5: ["warpAmount", "warpScale", "warpFlow"]
};
const WARP_TYPES = [[0, "Noise"], [1, "Ripple"], [2, "Waves"], [3, "Swirl"], [4, "Bulge and pinch"], [5, "Cells"]] as const;
/** The sliders each complex map uses; the others are hidden. */
const MAP_KEYS: Record<MapMode, ParamKey[]> = {
  0: [],
  1: ["mapPower", "mapAngle", "mapScale", "mapMix"],
  2: ["mapPointX", "mapPointY", "mapScale", "mapMix"],
  3: ["mapPointX", "mapPointY", "mapSteps", "mapScale", "mapMix"],
  4: ["mapTwist", "mapAngle", "mapScale", "mapMix"],
  5: ["mapScale", "mapMix"],
  6: ["mapSpeed", "tunnelTwist", "mapAngle", "mapFog", "mapScale", "mapMix"],
  7: ["mapArms", "mapAngle", "mapScale", "mapMix"]
};
const TRAIL_KEYS: ParamKey[] = ["trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint"];
const RELIEF_KEYS: ParamKey[] = ["reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine"];
const FINISH_KEYS: ParamKey[] = ["sharpen", "sharpenRadius", "overlayOpacity", "exposure", "blackLevel"];

const LAYER_BLENDS = [
  [0, "Normal"], [1, "Screen"], [2, "Multiply"], [3, "Overlay"], [4, "Difference"], [5, "Lighten"], [6, "Darken"], [7, "Add"]
] as const;
const FOLD_MODES = [[0, "Radial"], [1, "Triangle tiles"], [2, "Hexagon tiles"]] as const;
const MAP_MODES = [[1, "Power (z^n)"], [2, "Möbius"], [3, "Julia"], [4, "Log spiral"], [5, "Sine"], [6, "Tunnel"], [7, "Seamless spiral"]] as const;
const TRAIL_MODES = [[1, "Mix (smoky)"], [2, "Lighten (glowing)"]] as const;

/** The Effects panel, docked at the right: play buttons, then the effect groups. */
export function ControlPanel({ engine, revision, resetCount, paused, onRandomize, onTogglePause, onStop, onReset }: Props) {
  const row = useParamRows(engine);
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

  /* After Reset, every shape and picture group is closed. */
  const lastResetRef = useRef(resetCount);
  useEffect(() => {
    if (resetCount === lastResetRef.current) return;
    lastResetRef.current = resetCount;
    setOpenGroup(null);
    writeOpenGroup(null);
  }, [resetCount]);

  /**
   * Turning Algorithm on sets Map mix and Opacity to full, with no range, so
   * the map shows at once. The section then reloads to show the new values.
   */
  const [mapRevision, setMapRevision] = useState(0);

  /* Turning Blur on with no blur sets a blur that shows, so the power button visibly does something. */
  const [blurRevision, setBlurRevision] = useState(0);
  const enableBlur = () => {
    const blur = engine.params.blurAmount;
    if (blur.value > 0 || blur.on) return;
    blur.value = 20;
    setBlurRevision((value) => value + 1);
  };
  const enableMap = () => {
    for (const key of ["mapMix", "mapOpacity"] as const) {
      Object.assign(engine.params[key], { value: engine.params[key].max, on: false });
    }
    setMapRevision((value) => value + 1);
  };

  /** The groups run in these orders; dragging a group by its grip changes the order inside its stage. */
  const [shapeOrder, setShapeOrder] = useState(engine.state.shapeOrder);
  const [pictureOrder, setPictureOrder] = useState(engine.state.pictureOrder);
  const shapeGroups: Record<ShapeStep, (grip: Grip) => ReactNode> = {
    warp: (grip) => (
      <Group engine={engine} group="warp" title="Warp" grip={grip} {...accordion("warp")}>
        <WarpSection engine={engine} row={row} />
      </Group>
    ),
    map: (grip) => (
      <Group engine={engine} group="map" title="Algorithm" grip={grip} onEnable={enableMap} {...accordion("map")}>
        <MapSection key={mapRevision} engine={engine} row={row} />
      </Group>
    ),
    kaleidoscope: (grip) => (
      <Group engine={engine} group="kaleidoscope" title="Kaleidoscope" grip={grip} {...accordion("kaleidoscope")}>
        <KaleidoscopeSection engine={engine} row={row} />
      </Group>
    )
  };
  const pictureGroups: Record<PictureStep, (grip: Grip) => ReactNode> = {
    blur: (grip) => (
      <Group engine={engine} group="blur" title="Blur" grip={grip} onEnable={enableBlur} {...accordion("blur")}>
        <BlurSection key={blurRevision} engine={engine} row={row} />
      </Group>
    ),
    trails: (grip) => (
      <Group engine={engine} group="trails" title="Trails" grip={grip} {...accordion("trails")}>
        <ModeSelect engine={engine} stateKey="trailMode" options={TRAIL_MODES} />
        {TRAIL_KEYS.map(row)}
      </Group>
    ),
    relief: (grip) => (
      <Group engine={engine} group="relief" title="Relief" grip={grip} {...accordion("relief")}>
        {RELIEF_KEYS.map(row)}
      </Group>
    ),
    finish: (grip) => (
      <Group engine={engine} group="finish" title="Final effects" grip={grip} {...accordion("finish")}>
        {FINISH_KEYS.map(row)}
      </Group>
    )
  };

  return (
    <aside className="side-panel control-panel" key={revision}>
      <div className="side-panel-header panel-header-bar">
        <h2 className="side-panel-title">Designer</h2>
      </div>
      {/* Two toolbars: Random all and Clear all at the left; Stop and Play or Pause as icons at the right. Stop is off while paused. */}
      <div className="panel-toolbars">
        <div className="panel-buttons">
          <button className="panel-button" onClick={onRandomize}><RedDice size={16} /> Random all</button>
          <button
            className="panel-button text-only"
            onClick={onReset}
            title="Turn every effect off and set its controls back to no effect. Locked groups stay as they are."
          >
            Clear all
          </button>
        </div>
        <div className="panel-buttons">
          <button
            className="panel-button icon"
            onClick={onStop}
            disabled={paused}
            title="Stop: pause, and go back to the start"
            aria-label="Stop"
          >
            <MediaIcon kind="stop" size={17} />
          </button>
          <button
            className="panel-button icon"
            onClick={onTogglePause}
            title={paused ? "Play (Space)" : "Pause (Space)"}
            aria-label={paused ? "Play" : "Pause"}
          >
            {paused ? <MediaIcon kind="play" size={17} /> : <MediaIcon kind="pause" size={17} />}
          </button>
        </div>
      </div>

      {/* The cycle: first and always in view, because its timing affects every effect below. */}
      <div className="panel-root-row">{row("cycle")}</div>

      {/* Only the effect groups scroll; the title, the toolbars and the cycle stay in view. */}
      <div className="panel-scroll">
        <StageList
          label="Shape FX"
          order={shapeOrder}
          onReorder={(next) => {
            engine.state.shapeOrder = next;
            setShapeOrder(next);
          }}
          render={(key, grip) => shapeGroups[key](grip)}
        />
        <StageList
          label="Picture FX"
          order={pictureOrder}
          onReorder={(next) => {
            engine.state.pictureOrder = next;
            setPictureOrder(next);
          }}
          render={(key, grip) => pictureGroups[key](grip)}
        />
      </div>
    </aside>
  );
}

const OPEN_GROUP_KEY = "kaleidosage.openGroup";

/** The drag grip of a group header. */
interface Grip {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  dragging: boolean;
}

/**
 * One stage of groups under a small label. A group is dragged by its grip:
 * while the mouse moves, the group takes the place whose middle the pointer
 * has passed, and the new order is sent at once, so the picture changes live.
 */
function StageList<K extends string>({ label, order, onReorder, render }: {
  label: string;
  order: K[];
  onReorder: (order: K[]) => void;
  render: (key: K, grip: Grip) => ReactNode;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const orderRef = useRef(order);
  orderRef.current = order;
  const [dragging, setDragging] = useState<K | null>(null);

  const startDrag = (key: K) => (event: ReactPointerEvent<HTMLElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    setDragging(key);
    const move = (moveEvent: PointerEvent) => {
      /* The place is the number of other groups whose middle is above the pointer. */
      let place = 0;
      for (const item of listRef.current!.children as HTMLCollectionOf<HTMLElement>) {
        if (item.dataset.key === key) continue;
        const rect = item.getBoundingClientRect();
        if (moveEvent.clientY > rect.top + rect.height / 2) place++;
      }
      const current = orderRef.current;
      if (current.indexOf(key) === place) return;
      const next = current.filter((item) => item !== key);
      next.splice(place, 0, key);
      orderRef.current = next;
      onReorder(next);
    };
    /* The window gets the moves, not the grip: React moves the group in the page as the order changes, and a moved element loses the mouse. */
    const end = () => {
      setDragging(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  };

  return (
    <>
      <div className="stage-label">{label}</div>
      <div ref={listRef} className="stage-list">
        {order.map((key) => (
          <div key={key} data-key={key} className={`stage-item ${dragging === key ? "dragging" : ""}`}>
            {render(key, { onPointerDown: startDrag(key), dragging: dragging === key })}
          </div>
        ))}
      </div>
    </>
  );
}

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
 * engine and a group key, its power button turns the whole group's effect on
 * or off. A group that is off keeps its settings, shown dimmed, so turning
 * it on again restores them. Closed contents stay in the page, so they can
 * slide, but "inert" keeps the keyboard out of them.
 */
function Group({ engine, group, title, grip, open, onToggle, onEnable, children }: {
  engine?: Engine;
  group?: GroupKey;
  title: string;
  /** Called when the group's power button turns the group on. */
  onEnable?: () => void;
  /** Set for a group that can be dragged to a new place in its stage. */
  grip?: Grip;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const [enabled, setEnabled] = useState(engine && group ? engine.state.groups[group] : true);
  const [locked, setLocked] = useState(engine && group ? engine.state.locks[group] : false);

  return (
    <section className={`panel-group ${enabled ? "" : "disabled"} ${open ? "open" : ""}`}>
      <header className="panel-group-header">
        {engine && group && (
          <button
            type="button"
            role="switch"
            className="panel-group-toggle"
            aria-checked={enabled}
            aria-label={`${title} on`}
            title={enabled ? `${title} is on. Click to turn it off.` : `${title} is off. Click to turn it on.`}
            onClick={() => {
              const next = !enabled;
              engine.state.groups[group] = next;
              setEnabled(next);
              if (next) onEnable?.();
            }}
          >
            <PowerIcon on={enabled} size={18} />
          </button>
        )}
        <button className="panel-group-title" onClick={onToggle} aria-expanded={open}>
          <CaretRight size={12} weight="bold" className="panel-group-caret" />
          {title}
        </button>
        {engine && group && (
          <button
            className={`panel-group-lock ${locked ? "locked" : ""}`}
            aria-label={`Lock ${title.toLowerCase()} against Randomize`}
            aria-pressed={locked}
            onClick={() => {
              engine.state.locks[group] = !locked;
              setLocked(!locked);
            }}
          >
            {locked ? <LockSimple size={13} weight="fill" /> : <LockSimpleOpen size={13} />}
          </button>
        )}
        {grip && (
          <span className={`panel-group-grip ${grip.dragging ? "dragging" : ""}`} onPointerDown={grip.onPointerDown} title="Drag to change the order">
            <DotsSixVertical size={14} weight="bold" />
          </span>
        )}
      </header>
      <div className="panel-group-body" inert={!open}>
        <div className="panel-group-inner">{children}</div>
      </div>
    </section>
  );
}

type ModeKey = "blendMode" | "warpType" | "mapMode" | "foldMode" | "blurMask" | "trailMode";

/** A menu that sets one of the engine's mode values. */
export function ModeSelect<K extends ModeKey>({ engine, stateKey, options, onChange }: {
  engine: Engine;
  stateKey: K;
  options: readonly (readonly [PlayState[K], string])[];
  onChange?: (mode: PlayState[K]) => void;
}) {
  const [mode, setMode] = useState<PlayState[K]>(engine.state[stateKey]);
  return (
    <div className="panel-select-row">
      <Dropdown
        value={mode}
        options={options}
        onChange={(next) => {
          engine.state[stateKey] = next;
          setMode(next);
          onChange?.(next);
        }}
      />
    </div>
  );
}

/** The Algorithm group: the complex map picker, and the sliders for the picked map. */
/** The warp type picker, the sliders the picked type uses, and the layer settings. */
function WarpSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [type, setType] = useState<WarpType>(engine.state.warpType);
  return (
    <>
      <ModeSelect engine={engine} stateKey="warpType" options={WARP_TYPES} onChange={setType} />
      {WARP_KEYS[type].map(row)}
      <LayerRows engine={engine} step="warp" row={row} />
    </>
  );
}

function MapSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [mode, setMode] = useState<MapMode>(engine.state.mapMode);
  return (
    <>
      <ModeSelect engine={engine} stateKey="mapMode" options={MAP_MODES} onChange={setMode} />
      {MAP_KEYS[mode].map(row)}
      <LayerRows engine={engine} step="map" row={row} />
    </>
  );
}

const OPACITY_KEY: Record<ShapeStep, ParamKey> = { warp: "warpOpacity", map: "mapOpacity", kaleidoscope: "foldOpacity" };

/**
 * A shape group's opacity and blend mode: how its step's result mixes with
 * the picture without the step. It works the same wherever the group is in
 * the Shape list.
 */
function LayerRows({ engine, step, row }: { engine: Engine; step: ShapeStep; row: (key: ParamKey) => ReactNode }) {
  const [blend, setBlend] = useState(engine.state.layerBlend[step]);
  return (
    <>
      <div className="panel-select-row panel-layer-blend">
        <span className="panel-row-name">Blend</span>
        <Dropdown
          value={blend}
          options={LAYER_BLENDS}
          label="Layer blend mode"
          onChange={(next) => {
            engine.state.layerBlend[step] = next;
            setBlend(next);
          }}
        />
      </div>
      {row(OPACITY_KEY[step])}
    </>
  );
}

/** The mirror mode picker, and the sliders for the picked mode. */
function KaleidoscopeSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [mode, setMode] = useState<FoldMode>(engine.state.foldMode);
  return (
    <>
      <ModeSelect engine={engine} stateKey="foldMode" options={FOLD_MODES} onChange={setMode} />
      {KALEIDOSCOPE_KEYS[mode].map(row)}
      <LayerRows engine={engine} step="kaleidoscope" row={row} />
    </>
  );
}

/** The blur mask picker, and the sliders the picked mask uses. */
function BlurSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [mode, setMode] = useState<BlurMask>(engine.state.blurMask);
  return (
    <>
      <ModeSelect engine={engine} stateKey="blurMask" options={BLUR_MASKS} onChange={setMode} />
      {BLUR_KEYS[mode].map(row)}
    </>
  );
}
