import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CaretRight, DiceFive, DotsSixVertical, Eye, EyeSlash, LockSimple, LockSimpleOpen, Play, SpeakerSimpleHigh, Trash, Wind, X } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import { GROUP_PARAMS, addEffect, applyRadialStart, createParams, removeEffect, type GroupKey, type ParamKey, type PlayState } from "../engine/params";
import { midi } from "../lib/midi";
import { audioInput } from "../lib/audioInput";
import { settingButtons } from "../lib/settingButtons";
import { GradientEditor } from "./GradientEditor";
import { EmptyState } from "./EmptyState";
import { commonRole, splitCommon } from "../engine/common";
import { BLUR_KEYS, BLUR_MASKS, CYCLE_KEYS, CYCLE_MOVES, CYCLE_PAINT_KEYS, FOLD_MODES, SOLID_KEYS, SOLID_MAPS, SOLID_MAP_KEYS, SOLID_SHAPES, SOLID_SHAPE_KEYS, KALEIDOSCOPE_KEYS, MAP_KEYS, MAP_MODES, SMEAR_KEYS, SMEAR_SHAPES, SUBMODES, WARP_KEYS, WARP_TYPES, isShown, submodeNote } from "../engine/submodes";
import type { BlurMask, CycleMove, CyclePaint, FoldMode, FxStep, MapMode, ShapeStep, SmearShape, SolidMap, SolidShape, WarpType } from "../engine/renderer";
import { AddEffectMenu } from "./AddEffectMenu";
import { ConfirmDialog } from "./ConfirmDialog";
import { ContextMenu } from "./ContextMenu";
import { Dropdown } from "./Dropdown";
import { MidiIcon } from "./MidiIcon";
import { RedDice } from "./RedDice";
import { useMidi } from "./useMidi";
import { useSceneHoldOnly } from "./SourcePanel";
import { useParamRows } from "./useParamRows";
import { help } from "../help/topics";
import { PointerTip } from "./PointerTip";

interface Props {
  engine: Engine;
  /** The open group; only one group is open at a time. All groups start closed. */
  openGroup: string | null;
  onOpenGroup: (group: string | null) => void;
  onRandomize: () => void;
  /** Moves every unlocked value a little (see nudgeParams). */
  onNudge: () => void;
  onReset: () => void;
  /** New random settings for one group only (its dice button). */
  onRandomizeGroup: (group: GroupKey) => void;
  /** The Source section (see SourcePanel), at the top of the panel, above the Designer. */
  source: ReactNode;
  /** The scene's play toolbar (see SceneTransport), at the bottom of the panel, under the FX card. */
  transport: ReactNode;
  /** A press anywhere in the panel but the scene's play toolbar: the user works on the scene (it turns Hold on, see App). */
  onWork: () => void;
  /** The file name of the Driver effect's own video, or null, and the button that picks one. */
  driverVideoName: string | null;
  onPickDriverVideo: () => void;
  /** The FX audio button was turned on while the app listens to nothing: the play toolbar shows a tip at its Input menu. */
  onNeedAudioInput: () => void;
  /** An input with sound was picked and turned the audio buttons on: a tip at the FX audio button tells what it does, and a tip shows the next step. */
  linksTip: boolean;
  onLinksTipDone: () => void;
  nextTip: boolean;
  onNextTipDone: () => void;
  /** "+ New" added an effect to an empty list: App shows the effect tips. */
  onFirstEffect: () => void;
}

const subscribeInput = (listener: () => void) => audioInput.subscribe(listener);
const inputHasSound = () => audioInput.settings.kind !== "none";

const TRAIL_KEYS: ParamKey[] = ["trailAmount", "trailZoom", "trailTurn", "trailHue", "trailFlow", "trailSwirl", "trailTint"];
const CONTOUR_KEYS: ParamKey[] = ["contourOpacity", "contourLines", "contourWidth", "contourResolution", "contourSteady"];
const RELIEF_KEYS: ParamKey[] = ["reliefAmount", "reliefDepth", "reliefSize", "lightAngle", "shine"];
const DRIVER_KEYS: ParamKey[] = ["driverAmount", "driverStrength", "driverScale", "driverSpeed", "driverContrast"];
const CAMERA_KEYS: ParamKey[] = ["cameraAmount", "cameraHeight", "cameraTilt", "cameraTurn", "cameraSpeed", "cameraDistance", "cameraLens", "cameraLightTurn", "cameraLightHeight", "cameraShadow", "cameraFog", "cameraSky", "cameraShine", "cameraSmooth"];
const SORT_KEYS: ParamKey[] = ["sortAmount", "sortLow", "sortHigh", "sortAngle", "sortLength", "sortThickness"];
/* The Blend menu and the Opacity slider (particleAmount) come after these, in the Common part at the bottom of the group. */
const PARTICLE_KEYS: ParamKey[] = ["particleLevel", "particleBackground", "particleCount", "particleSize", "particleLife", "particleSpeed", "particleFollow", "particleCling", "particleGravity", "particleAngle", "particleTurbulence", "particleDrag", "particleGradient", "particleBoost"];
const RAYS_KEYS: ParamKey[] = ["raysAmount", "raysThreshold", "raysLength", "raysFade", "raysX", "raysY"];
const BLOOM_KEYS: ParamKey[] = ["bloomAmount", "bloomThreshold", "bloomSoftness", "bloomSize"];
const SHARPEN_KEYS: ParamKey[] = ["sharpen", "sharpenRadius"];
const COLOR_KEYS: ParamKey[] = ["overlayOpacity"];
const LEVELS_KEYS: ParamKey[] = ["exposure", "blackLevel"];

const LAYER_BLENDS = [
  [0, "Normal"], [1, "Screen"], [2, "Multiply"], [3, "Overlay"], [4, "Difference"], [5, "Lighten"], [6, "Darken"], [7, "Add"]
] as const;
const TRAIL_MODES = [[1, "Mix (smoky)"], [2, "Lighten (glowing)"]] as const;
const PARTICLE_BLENDS = [[0, "Glow (add)"], [1, "Normal"]] as const;
const SORT_ORDERS = [[0, "Dark to bright"], [1, "Bright to dark"]] as const;
const DRIVER_SOURCES = [[0, "Caustics"], [1, "Smoke"], [2, "Ink"], [3, "Fire"], [4, "Ripples"], [5, "Video"]] as const;
const DRIVER_MODES = [[0, "Bend"], [1, "Reveal"], [2, "Light"]] as const;
/** How the camera's land goes on past the picture. Mirror is seamless for every picture; Tile is seamless only for a picture that tiles. */
const CAMERA_REPEATS = [[0, "Mirror"], [1, "Tile"], [2, "None"]] as const;

/** The left panel: the Source section, then the Designer: its toolbar, the scene length, and the effect groups. */

/** The controls of the left panel whose press is work on the scene (see onWork): buttons, fields, the sliders' parts, the gradient and the effect grips. */
const WORK_CONTROLS = "button, input, select, textarea, a, label, [role=slider], [role=button], [role=option], [role=menuitem], [contenteditable=true], .range-grab, .range-low, .range-high, .gradient-bar, .gradient-stop, .panel-group-grip";

export function ControlPanel({ engine, openGroup, onOpenGroup, onRandomize, onNudge, onReset, onRandomizeGroup, source, transport, onWork, driverVideoName, onPickDriverVideo, onNeedAudioInput, linksTip, onLinksTipDone, nextTip, onNextTipDone, onFirstEffect }: Props) {
  const holdOnly = useSceneHoldOnly();
  const row = useParamRows(engine);
  /** True while MIDI holds any range: the Effects header then shows a play button that plays them all again. */
  const [anyHeld, setAnyHeld] = useState(engine.anyHeld);
  useEffect(() => engine.onParamChange(() => setAnyHeld(engine.anyHeld)), [engine]);
  /**
   * The MIDI button before the FX title shows the settings' MIDI buttons; they
   * are hidden until then. It shows when a MIDI device is there or a setting
   * has a control. Hiding them stops a wait for a control and plays every
   * range that MIDI stopped (their play buttons are in the MIDI column).
   */
  const { available, devices, mapped } = useMidi();
  const midiReady = mapped.size > 0 || (available && devices.length > 0);
  /* Whether the settings show their MIDI and audio buttons: kept in settingButtons, so it outlives this panel. */
  const showMidi = useSyncExternalStore(settingButtons.subscribe, () => settingButtons.shown("midi"));
  const setShowMidi = (show: boolean) => settingButtons.set("midi", show);
  const toggleMidi = () => {
    if (showMidi) {
      midi.setLearning(false);
      engine.resumeAll();
    }
    else openFirstIfAllClosed();
    setShowMidi(!showMidi);
  };
  /**
   * The audio button before the FX title shows the settings' audio buttons
   * (see AudioLinkButton), in the same column as the MIDI buttons. It
   * always shows. Turned on while the app listens to nothing, it also shows
   * a tip at the Input menu, above the play controls.
   */
  const showAudio = useSyncExternalStore(settingButtons.subscribe, () => settingButtons.shown("audio"));
  const setShowAudio = (show: boolean) => settingButtons.set("audio", show);
  const midiButtons = showMidi && midiReady;
  const audioButtons = showAudio;
  /**
   * Turning on the MIDI or audio buttons while every effect is closed opens
   * the first effect of the list, so the new buttons are in view at once.
   */
  const openFirstIfAllClosed = () => {
    const first = fxOrder[0];
    if (first && !(fxOrder as readonly string[]).includes(openGroup ?? "")) onOpenGroup(first);
  };
  /**
   * The FX tips after a pick of an input with sound: the audio links tip, at
   * the right of the FX audio button, and the next step's tip. With no
   * effect yet, the next step is "+ New" in the empty list; else it is the
   * speaker of the first setting in view, so the tip opens the first effect
   * if all are closed. A click on a button of the FX card closes the links
   * tip; any press in the card closes the next step's tip. Both go when the
   * audio buttons hide, when the input is Nothing again, and when a setting
   * is linked to the sound (it did what the tips ask).
   */
  const speakerRef = useRef<HTMLButtonElement>(null);
  const fxCardRef = useRef<HTMLElement>(null);
  const soundInput = useSyncExternalStore(subscribeInput, inputHasSound);
  const tipsAllowed = showAudio && soundInput;
  const linksTipShown = linksTip && tipsAllowed;
  const nextTipShown = nextTip && tipsAllowed;
  const anyTip = linksTipShown || nextTipShown;
  const endTips = useCallback(() => {
    onLinksTipDone();
    onNextTipDone();
  }, [onLinksTipDone, onNextTipDone]);
  /* The anchor is looked up in each frame (see PointerTip), as the list's rows change under it. Only one of the two is in the list at a time. */
  const nextAnchor = useMemo(() => ({
    get current() {
      return fxCardRef.current?.querySelector<HTMLElement>(".panel-scroll .empty-state-action button, .panel-scroll .audio-link") ?? null;
    }
  }), []);
  useEffect(() => {
    if (anyTip) openFirstIfAllClosed();
    else if (linksTip || nextTip) endTips();
  }, [anyTip]);
  useEffect(() => {
    if (!anyTip) return;
    /* Only a new link counts, not a change of a setting that was linked before. */
    const linked = new Set(engine.soundLinks());
    return engine.onParamChange((key) => {
      if (!engine.soundOn(key)) linked.delete(key);
      else if (!linked.has(key)) endTips();
    });
  }, [engine, anyTip, endTips]);
  /** Opening a group closes the others; clicking the open group closes it. Each group's dice randomizes that group. */
  const accordion = (key: GroupKey) => ({
    open: openGroup === key,
    onToggle: () => onOpenGroup(openGroup === key ? null : key),
    onRandomize: () => onRandomizeGroup(key)
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
  /**
   * Turning the Algorithm on sets its mix and opacity to full. A Power map at
   * power 1 only folds the picture over its axis (a mirror line across the
   * middle), so it starts at power 2 instead. A power that is already set
   * stays as it is.
   */
  const enableMap = () => {
    for (const key of ["mapMix", "mapOpacity"] as const) {
      Object.assign(engine.params[key], { value: engine.params[key].max, on: false });
    }
    const power = engine.params.mapPower;
    if (engine.state.mapMode === 1 && power.value === 1 && !power.on) power.value = 2;
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
      driver: () => start("driverAmount", 1),
      camera: () => start("cameraAmount", 1),
      solid: () => start("solidAmount", 1),
      sort: () => start("sortAmount", 1),
      particles: () => start("particleAmount", 1),
      cycles: () => start("cyclesAmount", 1),
      rays: () => start("raysAmount", 1.5),
      bloom: () => start("bloomAmount", 1)
    };
    enable[step]?.();
    if (engine.state.fxOrder.length === 0) onFirstEffect();
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
        <ModeSelect engine={engine} stateKey="trailMode" options={TRAIL_MODES} name="Type" />
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
          <SplitRows keys={["contourHue", ...CONTOUR_KEYS]} row={row} blend={<ContourBlend engine={engine} />} />
        </Fragment>
      </Group>
    ),
    relief: (grip) => (
      <Group engine={engine} group="relief" title="Relief" grip={grip} {...accordion("relief")}>
        {RELIEF_KEYS.map(row)}
      </Group>
    ),
    driver: (grip) => (
      <Group engine={engine} group="driver" title="Driver" grip={grip} {...accordion("driver")}>
        <DriverSection engine={engine} row={row} videoName={driverVideoName} onPickVideo={onPickDriverVideo} />
      </Group>
    ),
    camera: (grip) => (
      <Group engine={engine} group="camera" title="Camera" grip={grip} {...accordion("camera")}>
        <CameraBlend engine={engine} />
        <CameraRepeatRow engine={engine} />
        <SplitRows keys={CAMERA_KEYS} row={row} />
      </Group>
    ),
    solid: (grip) => (
      <Group engine={engine} group="solid" title="3D object" grip={grip} {...accordion("solid")}>
        <SolidSection engine={engine} row={row} />
      </Group>
    ),
    sort: (grip) => (
      <Group engine={engine} group="sort" title="Pixel sort" grip={grip} {...accordion("sort")}>
        <ModeSelect engine={engine} stateKey="sortOrder" options={SORT_ORDERS} name="Order" />
        <SplitRows keys={SORT_KEYS} row={row} />
      </Group>
    ),
    particles: (grip) => (
      <Group engine={engine} group="particles" title="Particles" grip={grip} {...accordion("particles")}>
        {/* The life gradient's colors, under its Gradient slider, in the same row block (no line between them). */}
        <SplitRows
          keys={[...PARTICLE_KEYS, "particleAmount"]}
          row={(key) => key === "particleGradient" ? <Fragment key={key}>{row(key)}<GradientEditor engine={engine} /></Fragment> : row(key)}
          blend={<ModeSelect engine={engine} stateKey="particleBlend" options={PARTICLE_BLENDS} name="Blend" />}
        />
      </Group>
    ),
    cycles: (grip) => (
      <Group engine={engine} group="cycles" title="Light cycles" grip={grip} {...accordion("cycles")}>
        <CyclesSection engine={engine} row={row} />
      </Group>
    ),
    rays: (grip) => (
      <Group engine={engine} group="rays" title="Light rays" grip={grip} {...accordion("rays")}>
        {RAYS_KEYS.map(row)}
      </Group>
    ),
    bloom: (grip) => (
      <Group engine={engine} group="bloom" title="Bloom" grip={grip} {...accordion("bloom")}>
        {BLOOM_KEYS.map(row)}
      </Group>
    ),
    sharpen: (grip) => (
      <Group engine={engine} group="sharpen" title="Sharpen" grip={grip} {...accordion("sharpen")}>
        {SHARPEN_KEYS.map(row)}
      </Group>
    ),
    color: (grip) => (
      <Group engine={engine} group="color" title="Color" grip={grip} {...accordion("color")}>
        <SplitRows keys={COLOR_KEYS} row={row} blend={<ColorBlend engine={engine} />} />
      </Group>
    ),
    levels: (grip) => (
      <Group engine={engine} group="levels" title="Levels" grip={grip} {...accordion("levels")}>
        {LEVELS_KEYS.map(row)}
      </Group>
    )
  };

  return (
    <aside
      className={`side-panel control-panel ${midiButtons || audioButtons ? "" : "midi-hidden"} ${midiButtons ? "" : "no-midi-buttons"} ${audioButtons ? "" : "no-audio-buttons"}`}
      /* A press on a control here is work on the scene (a slider, a menu, a random image); a press on an empty place is not, nor on the play toolbar, and an effect's header counts only when it opens the effect (see openEffectGroup in App). */
      onPointerDownCapture={(event) => {
        const target = event.target as Element;
        /* A tip's portal is outside the panel on the page; a press on it is no work. */
        if (!event.currentTarget.contains(target)) return;
        if (target.closest(WORK_CONTROLS) && !target.closest(".scene-transport, .panel-group-header")) onWork();
      }}
    >
      {/* The scene's card (see SourcePanel): its name, its sources, its Length and its play controls. */}
      {source}
      {/* The FX card: its title bar (Random all, Nudge, Clear all, then New), then the effect groups, which scroll. */}
      <section
        ref={fxCardRef}
        className="panel-card fx-card"
        {...help("fx")}
        onPointerDownCapture={(event) => {
          /* A press on a tip (a portal: React passes its events here) is not a press in the card. */
          if (!event.currentTarget.contains(event.target as Node)) return;
          if (nextTip) onNextTipDone();
          if (linksTip && (event.target as Element).closest("button")) onLinksTipDone();
        }}
      >
        <div className="side-panel-header panel-header-bar">
          {linksTipShown && <PointerTip anchor={speakerRef} text="Toggle to show or hide audio links for FX settings." onClose={onLinksTipDone} />}
          {nextTipShown && (
            <PointerTip
              anchor={nextAnchor}
              text={fxOrder.length === 0
                ? "Start by adding one or more FX to this scene."
                : "Click this speaker icon next to any setting to enable it to react to the music."}
              onClose={onNextTipDone}
            />
          )}
          <button
            ref={speakerRef}
            className={`panel-title-midi panel-title-audio ${showAudio ? "on" : ""}`}
            data-tip={showAudio ? "Hide the audio buttons of the settings" : "Show the audio buttons of the settings, to make them move with the sound"}
            aria-label="Show audio buttons"
            aria-pressed={showAudio}
            onClick={() => {
              if (!showAudio) {
                openFirstIfAllClosed();
                if (audioInput.settings.kind === "none") onNeedAudioInput();
              }
              setShowAudio(!showAudio);
            }}
          >
            <SpeakerSimpleHigh size={17} weight={showAudio ? "fill" : "regular"} />
          </button>
          {midiReady && (
            <button
              className={`panel-title-midi ${showMidi ? "on" : ""}`}
              data-tip={showMidi ? "Hide the MIDI buttons of the settings" : "Show the MIDI buttons of the settings, to assign knobs and faders"}
              aria-label="Show MIDI buttons"
              aria-pressed={showMidi}
              onClick={toggleMidi}
            >
              <MidiIcon size={16} />
            </button>
          )}
          <h2 className="side-panel-title">FX</h2>
          {/* While MIDI holds any range: a play button that plays them all again (Esc does the same). */}
          {anyHeld && (
            <button
              className="midi-play panel-title-play"
              data-tip="MIDI stopped some ranges. Click (or press `Esc`) to play them all again."
              aria-label="Play every range that MIDI stopped"
              aria-keyshortcuts="Escape"
              onClick={() => engine.resumeAll()}
            >
              <Play size={12} weight="fill" />
            </button>
          )}
          {/* "All" Random, Nudge and Clear as icon buttons, at the right of the title; Nudge and Clear are off with no effect. Stop and Play are in the app toolbar. */}
          <span className="panel-title-all">All</span>
          <div className="panel-buttons panel-title-buttons">
            <button className="panel-button icon" onClick={onRandomize} data-tip="Random all `x`: new random settings for every unlocked effect" aria-label="Random all">
              <RedDice size={16} />
            </button>
            <button
              className="panel-button icon"
              disabled={fxOrder.length === 0}
              onClick={onNudge}
              data-tip="Nudge all: move every unlocked value a little, up or down at random. Values at 0 stay at 0."
              aria-label="Nudge all"
            >
              <Wind size={16} />
            </button>
            <button
              className="panel-button icon"
              disabled={fxOrder.length === 0}
              onClick={onReset}
              data-tip="Clear all: remove every effect from the list and set its controls back to no effect. Locked groups stay as they are."
              aria-label="Clear all"
            >
              <Trash size={16} />
            </button>
          </div>
          <AddEffectMenu taken={fxOrder} onAdd={add} />
        </div>

        {/* Only the effect groups scroll; the scene length, the Source section and the FX title stay in view. */}
        <div className="panel-scroll">
          <StageList
            order={fxOrder}
            onReorder={(next) => {
              engine.state.fxOrder = next;
              setFxOrder(next);
            }}
            onRemove={remove}
            render={(key, grip) => groups[key](grip)}
          />
          {fxOrder.length === 0 && (
            <EmptyState text="Add an effect to change the picture.">
              <AddEffectMenu taken={fxOrder} onAdd={add} />
            </EmptyState>
          )}
          {/* A copy of the title bar's New button, at the end of the list, while an effect group is open. */}
          {fxOrder.some((step) => step === openGroup) && (
            <div className="add-effect-end">
              <AddEffectMenu taken={fxOrder} onAdd={add} />
            </div>
          )}
        </div>
        {/* In Follow mode the scene's controls are one Scene Hold button, at the bottom of this card, under the list (see SceneTransport). */}
        {holdOnly && transport}
      </section>
      {!holdOnly && transport}
    </aside>
  );
}

/** The controls a group header gets from the list: the drag grip, and the button that takes the group out of the list. */
interface Grip {
  onPointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
  dragging: boolean;
  onRemove?: () => void;
}

/**
 * The list of effect groups. A group is dragged by its grip:
 * while the mouse moves, the group takes the place whose middle the pointer
 * has passed, and the new order is sent at once, so the picture changes live.
 */
function StageList<K extends string>({ order, onReorder, onRemove, render }: {
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
function Group({ engine, group, title, grip, open, onToggle, onEnable, onRandomize, children }: {
  engine?: Engine;
  group?: GroupKey;
  title: string;
  /** New random settings for this group only. */
  onRandomize?: () => void;
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
  const { mapped } = useMidi();
  const groupKeys = group ? GROUP_PARAMS[group] : [];
  const midiMapped = groupKeys.some((key) => mapped.has(key));
  /** True while a MIDI control moves a slider of this group, and for 1 second after: the title lights orange. */
  const [touched, setTouched] = useState(false);
  const groupKeyList = groupKeys.join(",");
  useEffect(() => {
    if (!groupKeyList) return;
    const keys = groupKeyList.split(",");
    let timer = 0;
    const stop = midi.onTouch((key) => {
      if (!keys.includes(key)) return;
      setTouched(true);
      window.clearTimeout(timer);
      timer = window.setTimeout(() => setTouched(false), 1000);
    });
    return () => {
      stop();
      window.clearTimeout(timer);
    };
  }, [groupKeyList]);
  /** Where the header's right-click menu opened, while it is open. */
  const [menu, setMenu] = useState<{ left: number; top: number } | null>(null);
  /** The section's MIDI assignments, while the dialog that asks to remove them is open. */
  const [removing, setRemoving] = useState<ReturnType<typeof midi.mappings> | null>(null);

  return (
    <section className={`panel-group ${showing ? "" : "disabled"} ${open ? "open" : ""} ${touched ? "midi-touched" : ""}`} {...help("fx.group")}>
      <header
        className="panel-group-header"
        data-tip={engine && group ? "`Ctrl` + hold to bypass; `Ctrl+Shift` + hold to solo this effect. Right-click to enable or disable, lock, or remove MIDI." : undefined}
        onContextMenu={(event) => {
          if (!engine || !group) return;
          event.preventDefault();
          setMenu({ left: event.clientX, top: event.clientY });
        }}
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
        <button className="panel-group-title" onClick={onToggle} aria-expanded={open}>
          <CaretRight size={12} weight="bold" className="panel-group-caret" />
          {title}{solo && <span className="panel-group-solo">Solo</span>}
        </button>
        {/* Lock and Remove MIDI are in the header's right-click menu; a locked group shows its lock. */}
        {locked && (
          <span className="panel-group-lock locked" data-tip="Locked against Randomize. Right-click the header to unlock.">
            <LockSimple size={13} weight="fill" />
          </span>
        )}
        {/* The empty part of the header opens and closes the group too. */}
        <span className="panel-group-fill" onClick={onToggle} aria-hidden="true" />
        {/* A locked group cannot be randomized, so its dice hides. */}
        {engine && group && onRandomize && !locked && (
          <button
            className="panel-group-dice"
            aria-label={`Random settings for ${title.toLowerCase()}`}
            data-tip={`New random settings for ${title.toLowerCase()} only`}
            onClick={onRandomize}
          >
            <DiceFive size={14} />
          </button>
        )}
        {menu && engine && group && createPortal(
          <ContextMenu
            position={menu}
            onClose={() => setMenu(null)}
            items={[
              {
                /* Turning a group on also gives it settings that show (see onEnable). */
                label: enabled ? "Disable" : "Enable",
                icon: enabled ? <EyeSlash size={14} /> : <Eye size={14} />,
                run: () => {
                  engine.state.groups[group] = !enabled;
                  setEnabled(!enabled);
                  if (!enabled) onEnable?.();
                }
              },
              {
                label: locked ? "Unlock" : "Lock (no random)",
                icon: locked ? <LockSimpleOpen size={14} /> : <LockSimple size={14} weight="fill" />,
                run: () => {
                  engine.state.locks[group] = !locked;
                  setLocked(!locked);
                }
              },
              { label: "Remove MIDI mappings…", icon: <MidiIcon size={14} />, disabled: !midiMapped, run: () => setRemoving(midi.mappings(groupKeys)) }
            ]}
          />,
          document.body
        )}
        {removing && engine && createPortal(
          <ConfirmDialog
            title={`Remove MIDI from ${title}?`}
            message={removing.length === 1 ? "This MIDI control stops moving its slider:" : `These ${removing.length} MIDI controls stop moving their sliders:`}
            details={(
              <ul className="confirm-dialog-list">
                {removing.map(({ device, control, key }) => {
                  const [channel, number] = control.split(":");
                  /* A slider that only some submodes show says so, and whether the current one hides it. */
                  const note = submodeNote(key);
                  const where = note ? ` (${isShown(key, engine.state) ? "" : "hidden now, "}${note})` : "";
                  return (
                    <li key={`${device}|${control}|${key}`}>
                      <strong>{engine.params[key].label}{where}</strong>
                      <span>Control {number}, channel {channel}, {device}</span>
                    </li>
                  );
                })}
              </ul>
            )}
            confirmLabel="Remove"
            onCancel={() => setRemoving(null)}
            onConfirm={() => {
              midi.clearAll(groupKeys);
              setRemoving(null);
            }}
          />,
          document.body
        )}
        {grip?.onRemove && (
          <button
            className="panel-group-remove"
            aria-label={`Remove ${title.toLowerCase()}`}
            data-tip={`Remove ${title.toLowerCase()} from the list. Its settings stay for when you add it again.`}
            onClick={grip.onRemove}
          >
            <X size={13} weight="bold" />
          </button>
        )}
        {grip && (
          <span className={`panel-group-grip ${grip.dragging ? "dragging" : ""}`} onPointerDown={grip.onPointerDown} data-tip="Drag to change the order">
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

type ModeKey = "blendMode" | "warpType" | "mapMode" | "foldMode" | "blurMask" | "trailMode" | "smearShape" | "cameraRepeat" | "sortOrder" | "particleBlend" | "cyclesMove" | "cyclesBlend" | "cyclesPaint" | "solidShape" | "solidMap" | "solidBlend" | "driverSource" | "driverMode";

/** A menu that sets one of the engine's mode values. */
export function ModeSelect<K extends ModeKey>({ engine, stateKey, options, name, onChange }: {
  engine: Engine;
  stateKey: K;
  options: readonly (readonly [PlayState[K], string])[];
  /** A name at the left of the menu, like the Blend menu's. */
  name?: string;
  onChange?: (mode: PlayState[K]) => void;
}) {
  const [mode, setMode] = useState<PlayState[K]>(engine.state[stateKey]);
  /**
   * A submode menu marks the other choices that show sliders with MIDI
   * controls that this choice hides: those controls do nothing here. The
   * menu button shows the mark too, while any other choice has it.
   */
  const { mapped } = useMidi();
  const submode = SUBMODES.find((each) => each.stateKey === stateKey);
  const hiddenHere = (value: PlayState[K]) => Boolean(submode) &&
    (submode!.keys[value as number] ?? []).some((key) => mapped.has(key) && !(submode!.keys[mode as number] ?? []).includes(key));
  const marks = new Set(options.map(([value]) => value).filter((value) => value !== mode && hiddenHere(value)));
  return (
    <div className={name ? "panel-select-row panel-select-named" : "panel-select-row"}>
      {name && <span className="panel-row-name">{name}</span>}
      <Dropdown
        value={mode}
        options={options}
        marks={marks}
        mark={<span className="dropdown-mark" data-tip="MIDI controls move sliders that only this choice shows"><MidiIcon size={11} /></span>}
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
      <ModeSelect engine={engine} stateKey="warpType" options={WARP_TYPES} name="Type" onChange={setType} />
      <SplitRows keys={[...WARP_KEYS[type], OPACITY_KEY.warp]} row={row} blend={<LayerBlend engine={engine} step="warp" />} />
    </>
  );
}

function MapSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [mode, setMode] = useState<MapMode>(engine.state.mapMode);
  return (
    <>
      <ModeSelect engine={engine} stateKey="mapMode" options={MAP_MODES} name="Type" onChange={setMode} />
      <SplitRows keys={[...MAP_KEYS[mode], OPACITY_KEY.map]} row={row} blend={<LayerBlend engine={engine} step="map" />} />
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
      <SplitRows keys={SMEAR_KEYS[shape]} row={row} />
    </>
  );
}

/**
 * The light cycles: how they move (Grid or Free) and the sliders for that
 * way, then where their gradient colors come from (Cycle, Trail or
 * Position, and for Position a linear or radial gradient) with the
 * gradient's sliders and its colors under the Gradient slider, then the
 * Blend menu and Opacity.
 */
function CyclesSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [move, setMove] = useState<CycleMove>(engine.state.cyclesMove);
  const [paint, setPaint] = useState<CyclePaint>(engine.state.cyclesPaint);
  const pick = (next: CyclePaint) => {
    engine.state.cyclesPaint = next;
    setPaint(next);
  };
  const position = paint >= 2;
  const buttons = (choices: readonly (readonly [CyclePaint, string, string, boolean])[]) => (
    <div className="panel-buttons">
      {choices.map(([value, name, tip, on]) => (
        <button key={name} className={`panel-button text-only ${on ? "active" : ""}`} aria-pressed={on} data-tip={tip} onClick={() => pick(value)}>{name}</button>
      ))}
    </div>
  );
  const colorRows = (
    <Fragment key="cycles-color">
      <div className="panel-select-row panel-select-named cycles-paint-row">
        <span className="panel-row-name">Color</span>
        {buttons([
          [0, "Cycle", "Each cycle takes one color from the gradient", paint === 0],
          [1, "Trail", "The colors run along each trail, from the head back", paint === 1],
          [position ? paint : 2, "Position", "The colors come from the place on the screen: a gradient over the whole screen", position]
        ])}
      </div>
      {position && (
        <div className="panel-select-row panel-select-named cycles-paint-row">
          <span className="panel-row-name">Shape</span>
          {buttons([
            [2, "Linear", "The gradient runs across the screen, at Angle", paint === 2],
            [3, "Radial", "The gradient runs out from the center", paint === 3]
          ])}
        </div>
      )}
    </Fragment>
  );
  return (
    <>
      <ModeSelect engine={engine} stateKey="cyclesMove" options={CYCLE_MOVES} name="Move" onChange={setMove} />
      <SplitRows
        keys={[...CYCLE_KEYS[move], ...CYCLE_PAINT_KEYS[paint]]}
        row={(key) => key === "cyclesGradient"
          ? <Fragment key={key}>{colorRows}{row(key)}<GradientEditor engine={engine} stateKey="cyclesStops" /></Fragment>
          : row(key)}
        blend={<ModeSelect engine={engine} stateKey="cyclesBlend" options={LAYER_BLENDS} name="Blend" />}
      />
    </>
  );
}

/** The 3D Object: its shape and map menus, then the sliders that the shape and the map use, then Blend and Opacity. */
function SolidSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [shape, setShape] = useState<SolidShape>(engine.state.solidShape);
  const [map, setMap] = useState<SolidMap>(engine.state.solidMap);
  const shown = (key: ParamKey) => key === "solidRound" ? SOLID_SHAPE_KEYS[shape].includes(key)
    : key === "solidTiles" || key === "solidBend" ? SOLID_MAP_KEYS[map].includes(key) : true;
  return (
    <>
      <ModeSelect engine={engine} stateKey="solidShape" options={SOLID_SHAPES} name="Shape" onChange={setShape} />
      <ModeSelect engine={engine} stateKey="solidMap" options={SOLID_MAPS} name="Map" onChange={setMap} />
      <KeepBackground engine={engine} />
      <SplitRows keys={SOLID_KEYS.filter(shown)} row={row} blend={<ModeSelect engine={engine} stateKey="solidBlend" options={LAYER_BLENDS} name="Blend" />} />
    </>
  );
}

/** The 3D Object's Keep background switch (see docs/LAYERS.md): the effects after it change only the object. */
function KeepBackground({ engine }: { engine: Engine }) {
  const [keep, setKeep] = useState(engine.state.solidKeep);
  return (
    <label
      className="panel-check-inline panel-keep-background"
      data-tip="Keep background: the effects after the 3D Object in the FX list change only the object. The picture behind it stays as it is here."
    >
      <input
        type="checkbox"
        checked={keep}
        onChange={(event) => {
          engine.state.solidKeep = event.target.checked;
          setKeep(event.target.checked);
        }}
      />
      Keep background
    </label>
  );
}

/** How the Color effect's overlay color combines with the picture under it. */
function ColorBlend({ engine }: { engine: Engine }) {
  const [blend, setBlend] = useState(engine.state.colorBlend);
  return (
    <div className="panel-select-row panel-layer-blend">
      <span className="panel-row-name">Blend</span>
      <Dropdown
        value={blend}
        options={LAYER_BLENDS}
        label="Color blend mode"
        onChange={(next) => {
          engine.state.colorBlend = next;
          setBlend(next);
        }}
      />
    </div>
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

/**
 * The Driver group's menus and sliders. With Video as the driver, a row
 * shows the video's name and a button that picks another; picking Video
 * with no video yet opens the picker at once.
 */
function DriverSection({ engine, row, videoName, onPickVideo }: { engine: Engine; row: (key: ParamKey) => ReactNode; videoName: string | null; onPickVideo: () => void }) {
  const [source, setSource] = useState(engine.state.driverSource);
  return (
    <>
      <ModeSelect
        engine={engine}
        stateKey="driverSource"
        options={DRIVER_SOURCES}
        name="Driver"
        onChange={(next) => {
          setSource(next);
          if (next === 5 && !videoName) onPickVideo();
        }}
      />
      {source === 5 && (
        <div className="panel-select-row panel-select-named driver-video-row">
          <span className="panel-row-name">Video</span>
          <span className="driver-video-name" data-tip={videoName ? `The driver video: ${videoName}` : "No driver video yet"}>{videoName ?? "None"}</span>
          <button className="button secondary small" onClick={onPickVideo} data-tip="Pick a video file. Its brightness drives the effect; the scene file keeps a copy of it.">Choose…</button>
        </div>
      )}
      <ModeSelect engine={engine} stateKey="driverMode" options={DRIVER_MODES} name="Mode" />
      <SplitRows keys={DRIVER_KEYS} row={row} />
    </>
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

function LayerBlend({ engine, step }: { engine: Engine; step: ShapeStep }) {
  const [blend, setBlend] = useState(engine.state.layerBlend[step]);
  return (
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
  );
}

/**
 * An effect's settings: its own settings first, then its common settings
 * (see engine/common.ts) under a Common heading. "blend" is the effect's
 * Blend menu, which is common too: it shows right before Opacity.
 */
function SplitRows({ keys, row, blend }: { keys: readonly ParamKey[]; row: (key: ParamKey) => ReactNode; blend?: ReactNode }) {
  const { own, common } = splitCommon(keys);
  const moves = common.filter((key) => commonRole(key) !== "opacity");
  const opacity = common.filter((key) => commonRole(key) === "opacity");
  return (
    <>
      {own.map(row)}
      {(common.length > 0 || blend) && (
        <>
          <div className="panel-common-head" data-tip="Settings that many effects share. A MIDI control on one of them moves it in every effect.">Common</div>
          {moves.map(row)}
          {blend}
          {opacity.map(row)}
        </>
      )}
    </>
  );
}

/** The mirror mode picker, and the sliders for the picked mode. */
function KaleidoscopeSection({ engine, row }: { engine: Engine; row: (key: ParamKey) => ReactNode }) {
  const [mode, setMode] = useState<FoldMode>(engine.state.foldMode);
  /** Picking Radial sets the Radial start values. The sliders then reload to show them. */
  const [revision, setRevision] = useState(0);
  const pick = (next: FoldMode) => {
    if (next === 0 && mode !== 0) {
      applyRadialStart(engine.params);
      setRevision((value) => value + 1);
    }
    setMode(next);
  };
  return (
    <>
      <ModeSelect engine={engine} stateKey="foldMode" options={FOLD_MODES} name="Type" onChange={pick} />
      <Fragment key={revision}>
        <SplitRows keys={[...KALEIDOSCOPE_KEYS[mode], OPACITY_KEY.kaleidoscope]} row={row} blend={<LayerBlend engine={engine} step="kaleidoscope" />} />
      </Fragment>
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
