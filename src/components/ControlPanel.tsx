import { Fragment, useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { CaretRight, DotsSixVertical, LockSimple, LockSimpleOpen, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { addEffect, createParams, removeEffect, type GroupKey, type ParamKey, type PlayState } from "../engine/params";
import type { BlurMask, FoldMode, FxStep, MapMode, ShapeStep, SmearShape, WarpType } from "../engine/renderer";
import { AddEffectMenu } from "./AddEffectMenu";
import { Dropdown } from "./Dropdown";
import { MediaIcon } from "./MediaIcon";
import { PowerIcon } from "./PowerIcon";
import { RedDice } from "./RedDice";
import { useParamRows } from "./useParamRows";

interface Props {
  engine: Engine;
  /** The open group; only one group is open at a time. All groups start closed. */
  openGroup: string | null;
  onOpenGroup: (group: string | null) => void;
  paused: boolean;
  onRandomize: () => void;
  /** Moves every unlocked value a little (see nudgeParams). */
  onNudge: () => void;
  onTogglePause: () => void;
  onStop: () => void;
  onReset: () => void;
  /** True when a source is a video; only then does the video crossfade choice show. */
  hasVideo: boolean;
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
  2: ["blurAmount", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle"],
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
  5: ["warpAmount", "warpCellSize", "warpCellAngle", "warpFlow"]
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
/** The sliders each time smear pattern uses; Angle only turns the Linear and Sweep patterns. */
const SMEAR_KEYS: Record<SmearShape, ParamKey[]> = {
  0: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  1: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"],
  2: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  3: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"],
  4: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"]
};
const SMEAR_SHAPES = [[0, "Linear"], [1, "Rings"], [2, "Sweep"], [3, "Brightness"], [4, "Noise"]] as const;
const CONTOUR_KEYS: ParamKey[] = ["contourOpacity", "contourLines", "contourWidth", "contourResolution", "contourSteady"];
const RELIEF_KEYS: ParamKey[] = ["reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine"];
const CAMERA_KEYS: ParamKey[] = ["cameraAmount", "cameraHeight", "cameraTilt", "cameraTurn", "cameraSpeed", "cameraDistance", "cameraLens", "cameraLightTurn", "cameraLightHeight", "cameraShadow", "cameraFog", "cameraSky", "cameraShine", "cameraSmooth"];
const FINISH_KEYS: ParamKey[] = ["sharpen", "sharpenRadius", "overlayOpacity", "exposure", "blackLevel"];

const LAYER_BLENDS = [
  [0, "Normal"], [1, "Screen"], [2, "Multiply"], [3, "Overlay"], [4, "Difference"], [5, "Lighten"], [6, "Darken"], [7, "Add"]
] as const;
const FOLD_MODES = [[0, "Radial"], [1, "Triangle tiles"], [2, "Hexagon tiles"]] as const;
const MAP_MODES = [[1, "Power (z^n)"], [2, "Möbius"], [3, "Julia"], [4, "Log spiral"], [5, "Sine"], [6, "Tunnel"], [7, "Seamless spiral"]] as const;
const TRAIL_MODES = [[1, "Mix (smoky)"], [2, "Lighten (glowing)"]] as const;
/** How the camera's land goes on past the picture. Mirror is seamless for every picture; Tile is seamless only for a picture that tiles. */
const CAMERA_REPEATS = [[0, "Mirror"], [1, "Tile"], [2, "None"]] as const;

/** The Effects panel, docked at the right: play buttons, then the effect groups. */
export function ControlPanel({ engine, openGroup, onOpenGroup, paused, onRandomize, onNudge, onTogglePause, onStop, onReset, hasVideo }: Props) {
  const row = useParamRows(engine);
  const [videoCrossfade, setVideoCrossfade] = useState(engine.state.videoCrossfade);
  /** Opening a group closes the others; clicking the open group closes it. */
  const accordion = (key: string) => ({
    open: openGroup === key,
    onToggle: () => onOpenGroup(openGroup === key ? null : key)
  });

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
  /**
   * Turning the Kaleidoscope on starts Pan X and Pan Y looping, so the
   * picture moves at once. When either pan already loops, both stay as they
   * are. A pan whose range has no width gets the default range.
   */
  const [kaleidoscopeRevision, setKaleidoscopeRevision] = useState(0);
  const enableKaleidoscope = () => {
    if (engine.params.panX.on || engine.params.panY.on) return;
    const defaults = createParams();
    for (const key of ["panX", "panY"] as const) {
      const pan = engine.params[key];
      const { low, high } = pan.low !== pan.high ? pan : defaults[key];
      Object.assign(pan, { low, high, on: true });
    }
    setKaleidoscopeRevision((value) => value + 1);
  };
  /**
   * Turning Contours on with no lines showing sets lines that show: black,
   * fully opaque, 16 levels, 1.5 px wide. Contours that already show stay as they are.
   */
  const [contourRevision, setContourRevision] = useState(0);
  const enableContours = () => {
    const opacity = engine.params.contourOpacity;
    if (opacity.value > 0 || opacity.on) return;
    engine.state.contourTone = "black";
    Object.assign(opacity, { value: 1, on: false });
    Object.assign(engine.params.contourLines, { value: 16, on: false });
    Object.assign(engine.params.contourWidth, { value: 1.5, on: false });
    setContourRevision((value) => value + 1);
  };
  /**
   * Turning a Noise warp on with no warp showing sets a warp that shows:
   * strength 0.5 and size 2. A warp that already shows stays as it is.
   */
  const [warpRevision, setWarpRevision] = useState(0);
  const enableWarp = () => {
    const strength = engine.params.warpAmount;
    if (engine.state.warpType !== 0 || strength.value > 0 || strength.on) return;
    Object.assign(strength, { value: 0.5, on: false });
    Object.assign(engine.params.warpScale, { value: 2, on: false });
    setWarpRevision((value) => value + 1);
  };
  const enableMap = () => {
    for (const key of ["mapMix", "mapOpacity"] as const) {
      Object.assign(engine.params[key], { value: engine.params[key].max, on: false });
    }
    setMapRevision((value) => value + 1);
  };

  /**
   * The effects in the list run in this order; dragging a group by its grip
   * moves it to any place in the list. Only added effects are in the list.
   */
  const [fxOrder, setFxOrder] = useState(engine.state.fxOrder);
  /**
   * Adds an effect at the end of the list and opens it. It starts with
   * settings that show, the same as its power button gives, so adding it
   * visibly does something; an effect with settings of its own keeps them.
   */
  const add = (step: FxStep) => {
    const start = (key: ParamKey, value: number) => {
      const param = engine.params[key];
      if (param.value === 0 && !param.on) param.value = value;
    };
    const enable: Partial<Record<FxStep, () => void>> = {
      warp: enableWarp, map: enableMap, kaleidoscope: enableKaleidoscope, blur: enableBlur, contours: enableContours,
      trails: () => start("trailAmount", 0.85),
      smear: () => start("smearAmount", 1),
      relief: () => start("reliefAmount", 0.6),
      camera: () => start("cameraAmount", 1)
    };
    enable[step]?.();
    addEffect(engine.state, step);
    setFxOrder(engine.state.fxOrder);
    onOpenGroup(step);
  };
  const remove = (step: FxStep) => {
    removeEffect(engine.state, step);
    setFxOrder(engine.state.fxOrder);
    if (openGroup === step) onOpenGroup(null);
  };
  const groups: Record<FxStep, (grip: Grip) => ReactNode> = {
    warp: (grip) => (
      <Group engine={engine} group="warp" title="Warp" grip={grip} onEnable={enableWarp} {...accordion("warp")}>
        <WarpSection key={warpRevision} engine={engine} row={row} />
      </Group>
    ),
    map: (grip) => (
      <Group engine={engine} group="map" title="Algorithm" grip={grip} onEnable={enableMap} {...accordion("map")}>
        <MapSection key={mapRevision} engine={engine} row={row} />
      </Group>
    ),
    kaleidoscope: (grip) => (
      <Group engine={engine} group="kaleidoscope" title="Kaleidoscope" grip={grip} onEnable={enableKaleidoscope} {...accordion("kaleidoscope")}>
        <KaleidoscopeSection key={kaleidoscopeRevision} engine={engine} row={row} />
      </Group>
    ),
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
    smear: (grip) => (
      <Group engine={engine} group="smear" title="Time smear" grip={grip} {...accordion("smear")}>
        <SmearSection engine={engine} row={row} />
      </Group>
    ),
    contours: (grip) => (
      <Group engine={engine} group="contours" title="Contours" grip={grip} onEnable={enableContours} {...accordion("contours")}>
        <Fragment key={contourRevision}>
          {row("contourHue")}
          <ContourBlend engine={engine} />
          {CONTOUR_KEYS.map(row)}
        </Fragment>
      </Group>
    ),
    relief: (grip) => (
      <Group engine={engine} group="relief" title="Relief" grip={grip} {...accordion("relief")}>
        {RELIEF_KEYS.map(row)}
      </Group>
    ),
    camera: (grip) => (
      <Group engine={engine} group="camera" title="Camera" grip={grip} {...accordion("camera")}>
        <CameraBlend engine={engine} />
        <CameraRepeatRow engine={engine} />
        {CAMERA_KEYS.map(row)}
      </Group>
    ),
    finish: (grip) => (
      <Group engine={engine} group="finish" title="Final effects" grip={grip} {...accordion("finish")}>
        {FINISH_KEYS.map(row)}
      </Group>
    )
  };

  return (
    <aside className="side-panel control-panel">
      <div className="side-panel-header panel-header-bar">
        <h2 className="side-panel-title">Designer</h2>
      </div>
      {/* Two toolbars: Random all and Clear all at the left; Stop and Play or Pause as icons at the right. Stop is off while paused. */}
      <div className="panel-toolbars">
        <div className="panel-buttons">
          <button className="panel-button" onClick={onRandomize}><RedDice size={16} /> Random all</button>
          <button
            className="panel-button text-only"
            onClick={onNudge}
            title="Nudge (N): move every unlocked value a little, up or down at random. Values at 0 stay at 0."
          >
            Nudge
          </button>
          <button
            className="panel-button text-only"
            onClick={onReset}
            title="Remove every effect from the list and set its controls back to no effect. Locked groups stay as they are."
          >
            Clear all
          </button>
        </div>
        <div className="panel-buttons">
          <button
            className="panel-button icon"
            onClick={onStop}
            disabled={paused}
            title="Stop (Shift+Space): pause, and go back to the start"
            aria-keyshortcuts="Shift+Space"
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
      <div className="panel-root-row">
        {row("cycle")}
        {hasVideo && (
          <label className="panel-check-row" title="A source video fades its end into its start, so it never jumps. Off, the video starts again at the start of each loop. A seamless video export always crossfades.">
            <input
              type="checkbox"
              checked={videoCrossfade}
              onChange={(event) => {
                engine.state.videoCrossfade = event.target.checked;
                setVideoCrossfade(event.target.checked);
              }}
            />
            Crossfade the video's loop
          </label>
        )}
      </div>

      {/* Only the effect groups scroll; the title, the toolbars and the cycle stay in view. */}
      <div className="panel-scroll">
        <StageList
          label="Effects"
          order={fxOrder}
          onReorder={(next) => {
            engine.state.fxOrder = next;
            setFxOrder(next);
          }}
          onRemove={remove}
          render={(key, grip) => groups[key](grip)}
        />
        {fxOrder.length === 0 && <p className="stage-empty">No effects yet. Add one to start.</p>}
        <AddEffectMenu options={EFFECT_NAMES.filter(([step]) => !fxOrder.includes(step))} onAdd={add} />
      </div>
    </aside>
  );
}

/** The controls a group header gets from the list: the drag grip, and the button that takes the group out of the list. */
interface Grip {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  dragging: boolean;
  onRemove?: () => void;
}

/** The effects in the Add effect menu, in menu order, with the names their groups show. */
const EFFECT_NAMES: readonly (readonly [FxStep, string])[] = [
  ["kaleidoscope", "Kaleidoscope"], ["map", "Algorithm"], ["warp", "Warp"], ["blur", "Blur"], ["trails", "Trails"],
  ["smear", "Time smear"], ["contours", "Contours"], ["relief", "Relief"], ["camera", "Camera"], ["finish", "Final effects"]
];

/**
 * One stage of groups under a small label. A group is dragged by its grip:
 * while the mouse moves, the group takes the place whose middle the pointer
 * has passed, and the new order is sent at once, so the picture changes live.
 */
function StageList<K extends string>({ label, order, onReorder, onRemove, render }: {
  label: string;
  order: K[];
  onReorder: (order: K[]) => void;
  onRemove?: (key: K) => void;
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
            {render(key, { onPointerDown: startDrag(key), dragging: dragging === key, onRemove: onRemove && (() => onRemove(key)) })}
          </div>
        ))}
      </div>
    </>
  );
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
  const [bypassed, setBypassed] = useState(false);
  const [solo, setSolo] = useState(false);
  const bypassPointer = useRef<number | null>(null);
  const suppressClick = useRef(false);
  const releaseBypass = useCallback(() => {
    if (engine && group) {
      engine.bypassedGroups.delete(group);
      if (engine.soloGroup === group) engine.soloGroup = null;
    }
    bypassPointer.current = null;
    setBypassed(false);
    setSolo(false);
  }, [engine, group]);

  useEffect(() => {
    const release = (event: PointerEvent) => {
      if (event.pointerId === bypassPointer.current) releaseBypass();
    };
    const hidden = () => { if (document.hidden) releaseBypass(); };
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", releaseBypass);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", releaseBypass);
      document.removeEventListener("visibilitychange", hidden);
      if (engine && group) {
        engine.bypassedGroups.delete(group);
        if (engine.soloGroup === group) engine.soloGroup = null;
      }
    };
  }, [engine, group, releaseBypass]);
  const showing = enabled && !bypassed;

  return (
    <section className={`panel-group ${showing ? "" : "disabled"} ${open ? "open" : ""}`}>
      <header
        className="panel-group-header"
        title={engine && group ? "Ctrl+hold to bypass; Ctrl+Shift+hold to solo this effect" : undefined}
        onPointerDownCapture={(event) => {
          suppressClick.current = false;
          if (!engine || !group || !event.ctrlKey || event.button !== 0) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = true;
          bypassPointer.current = event.pointerId;
          if (event.shiftKey) {
            engine.soloGroup = group;
            setSolo(true);
          } else {
            engine.bypassedGroups.add(group);
            setBypassed(true);
          }
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onLostPointerCapture={releaseBypass}
        onClickCapture={(event) => {
          if (!suppressClick.current) return;
          event.preventDefault();
          event.stopPropagation();
          suppressClick.current = false;
        }}
      >
        {engine && group && (
          <button
            type="button"
            role="switch"
            className="panel-group-toggle"
            aria-checked={showing}
            aria-label={`${title} on`}
            title={enabled ? `${title} is on. Click to turn it off.` : `${title} is off. Click to turn it on.`}
            onClick={() => {
              const next = !enabled;
              engine.state.groups[group] = next;
              setEnabled(next);
              if (next) onEnable?.();
            }}
          >
            <PowerIcon on={showing} size={18} />
          </button>
        )}
        <button className="panel-group-title" onClick={onToggle} aria-expanded={open}>
          <CaretRight size={12} weight="bold" className="panel-group-caret" />
          {title}{solo && <span className="panel-group-solo">Solo</span>}
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
        {grip?.onRemove && (
          <button
            className="panel-group-remove"
            aria-label={`Remove ${title.toLowerCase()}`}
            title={`Remove ${title.toLowerCase()} from the list. Its settings stay for when you add it again.`}
            onClick={grip.onRemove}
          >
            <X size={13} weight="bold" />
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

type ModeKey = "blendMode" | "warpType" | "mapMode" | "foldMode" | "blurMask" | "trailMode" | "smearShape" | "cameraRepeat";

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
/** The time smear's pattern picker, and the sliders for the picked pattern. */
function SmearSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [shape, setShape] = useState<SmearShape>(engine.state.smearShape);
  return (
    <>
      <ModeSelect engine={engine} stateKey="smearShape" options={SMEAR_SHAPES} onChange={setShape} />
      {SMEAR_KEYS[shape].map(row)}
    </>
  );
}

/** How the contour lines combine with the picture under them. */
function ContourBlend({ engine }: { engine: Engine }) {
  const [blend, setBlend] = useState(engine.state.contourBlend);
  return (
    <div className="panel-select-row panel-layer-blend">
      <span className="panel-row-name">Blend</span>
      <Dropdown
        value={blend}
        options={LAYER_BLENDS}
        label="Contour blend mode"
        onChange={(next) => {
          engine.state.contourBlend = next;
          setBlend(next);
        }}
      />
    </div>
  );
}

/** How the camera's raised land combines with the flat floor under it. */
function CameraBlend({ engine }: { engine: Engine }) {
  const [blend, setBlend] = useState(engine.state.cameraBlend);
  return (
    <div className="panel-select-row panel-layer-blend">
      <span className="panel-row-name">Blend</span>
      <Dropdown
        value={blend}
        options={LAYER_BLENDS}
        label="Camera blend mode"
        onChange={(next) => {
          engine.state.cameraBlend = next;
          setBlend(next);
        }}
      />
    </div>
  );
}

/** How the camera's land goes on past the picture's edge. */
function CameraRepeatRow({ engine }: { engine: Engine }) {
  const [repeat, setRepeat] = useState(engine.state.cameraRepeat);
  return (
    <div className="panel-select-row panel-layer-blend">
      <span className="panel-row-name">Repeat</span>
      <Dropdown
        value={repeat}
        options={CAMERA_REPEATS}
        label="How the land goes on past the picture"
        onChange={(next) => {
          engine.state.cameraRepeat = next;
          setRepeat(next);
        }}
      />
    </div>
  );
}

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
  /** Picking Gradient sets a sharp vertical edge with a blur that shows. The sliders then reload to show the new values. */
  const [revision, setRevision] = useState(0);
  const pick = (next: BlurMask) => {
    if (next === 2) {
      const values = { blurAmount: 20, blurMaskAngle: 90, blurMaskSoft: 0 } as const;
      for (const [key, value] of Object.entries(values) as [ParamKey, number][]) {
        Object.assign(engine.params[key], { value, on: false });
      }
      setRevision((value) => value + 1);
    }
    setMode(next);
  };
  return (
    <>
      <ModeSelect engine={engine} stateKey="blurMask" options={BLUR_MASKS} onChange={pick} />
      <Fragment key={revision}>{BLUR_KEYS[mode].map(row)}</Fragment>
    </>
  );
}
