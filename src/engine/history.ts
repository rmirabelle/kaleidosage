import { PARAM_KEYS, type Param, type Params, type PlayState } from "./params";
import { sceneFingerprint } from "./scene";
import { soundList } from "./audio";

/** The most steps that Undo can go back. */
const LIMIT = 200;

type SavedParam = Pick<Param, "value" | "low" | "high" | "on" | "ease" | "custom" | "seconds" | "startTime">;
type SavedState = Pick<PlayState, "groups" | "blendMode" | "warpType" | "mapMode" | "foldMode" | "blurMask" | "trailMode"
  | "overlayColor" | "colorBlend" | "trailColor" | "smearShape" | "contourTone" | "contourBlend" | "cameraBlend" | "viewBlend" | "skyColor" | "cameraRepeat" | "cameraHeightSource" | "cameraColors" | "cameraStops" | "videoCrossfade" | "fxOrder" | "layerBlend" | "sound" | "particleStops" | "cyclesMove" | "cyclesBlend" | "laserBlend" | "cyclesPaint" | "cyclesStops" | "solidShape" | "solidMap" | "solidBlend" | "solidKeep" | "mandelPlace" | "particleShape" | "outlineShape" | "outlineDraw" | "outlineStops" | "maskMode" | "maskStops">;

/** The settings at one step, and their fingerprint, to tell whether two steps differ. */
interface Snapshot {
  fingerprint: string;
  params: Record<string, SavedParam>;
  state: SavedState;
}

function take(params: Params, state: PlayState): Snapshot {
  const savedParams: Record<string, SavedParam> = {};
  for (const key of PARAM_KEYS) {
    const { value, low, high, on, ease, custom, seconds, startTime } = params[key];
    savedParams[key] = { value, low, high, on, ease, custom, seconds, startTime };
  }
  return {
    fingerprint: sceneFingerprint(params, state, [null, null]),
    params: savedParams,
    state: {
      groups: { ...state.groups },
      blendMode: state.blendMode,
      warpType: state.warpType,
      mapMode: state.mapMode,
      foldMode: state.foldMode,
      blurMask: state.blurMask,
      trailMode: state.trailMode,
      overlayColor: state.overlayColor,
      colorBlend: state.colorBlend,
      trailColor: state.trailColor,
      smearShape: state.smearShape,
      particleShape: state.particleShape,
      outlineShape: state.outlineShape,
      outlineDraw: state.outlineDraw,
      outlineStops: state.outlineStops.map((stop) => ({ ...stop })),
      maskMode: state.maskMode,
      maskStops: state.maskStops.map((stop) => ({ ...stop })),
      contourTone: state.contourTone,
      contourBlend: state.contourBlend,
      cameraBlend: state.cameraBlend,
      viewBlend: state.viewBlend,
      skyColor: state.skyColor,
      cameraRepeat: state.cameraRepeat,
      cameraHeightSource: state.cameraHeightSource,
      cameraColors: state.cameraColors,
      cameraStops: state.cameraStops.map((stop) => ({ ...stop })),
      videoCrossfade: state.videoCrossfade,
      fxOrder: [...state.fxOrder],
      layerBlend: { ...state.layerBlend },
      sound: Object.fromEntries(soundList(state.sound).map((key) => [key, true])),
      particleStops: state.particleStops.map((stop) => ({ ...stop })),
      cyclesMove: state.cyclesMove,
      cyclesBlend: state.cyclesBlend,
      laserBlend: state.laserBlend,
      cyclesPaint: state.cyclesPaint,
      cyclesStops: state.cyclesStops.map((stop) => ({ ...stop })),
      solidShape: state.solidShape,
      solidMap: state.solidMap,
      solidBlend: state.solidBlend,
      solidKeep: state.solidKeep,
      mandelPlace: state.mandelPlace
    }
  };
}

/**
 * Undo and redo for the settings: every parameter and range, the modes, the
 * groups that are on, the colors, the step orders and the audio links. The images, the
 * animation time and the locks are not part of it.
 *
 * The owner calls commit() when a change is complete (not during a drag);
 * every change since the last commit then becomes one step.
 */
export class SettingsHistory {
  private undoSteps: Snapshot[] = [];
  private redoSteps: Snapshot[] = [];
  private current: Snapshot;

  constructor(private params: Params, private state: PlayState) {
    this.current = take(params, state);
  }

  get canUndo() {
    return this.undoSteps.length > 0 || take(this.params, this.state).fingerprint !== this.current.fingerprint;
  }

  get canRedo() {
    return this.redoSteps.length > 0;
  }

  /** Records the settings as a new step if they changed since the last step. Returns true when it records one. */
  commit(): boolean {
    const next = take(this.params, this.state);
    if (next.fingerprint === this.current.fingerprint) return false;
    this.undoSteps.push(this.current);
    if (this.undoSteps.length > LIMIT) this.undoSteps.shift();
    this.redoSteps = [];
    this.current = next;
    return true;
  }

  /** Goes back one step. Returns false when there is nothing to undo. */
  undo(): boolean {
    this.commit();
    const step = this.undoSteps.pop();
    if (!step) return false;
    this.redoSteps.push(this.current);
    this.restore(step);
    return true;
  }

  /** Goes forward one step. Returns false when there is nothing to redo. */
  redo(): boolean {
    /* A change made after the last undo starts a new history, so there is nothing to redo. */
    if (this.commit()) return false;
    const step = this.redoSteps.pop();
    if (!step) return false;
    this.undoSteps.push(this.current);
    this.restore(step);
    return true;
  }

  /** Forgets every step; the settings as they are now become the start. */
  clear() {
    this.undoSteps = [];
    this.redoSteps = [];
    this.current = take(this.params, this.state);
  }

  private restore(step: Snapshot) {
    for (const key of PARAM_KEYS) Object.assign(this.params[key], step.params[key]);
    const { groups, layerBlend, fxOrder, sound, particleStops, cyclesStops, outlineStops, maskStops, cameraStops, ...modes } = step.state;
    Object.assign(this.state, modes, {
      fxOrder: [...fxOrder], sound: { ...sound },
      particleStops: particleStops.map((stop) => ({ ...stop })), cyclesStops: cyclesStops.map((stop) => ({ ...stop })), outlineStops: outlineStops.map((stop) => ({ ...stop })), maskStops: maskStops.map((stop) => ({ ...stop })), cameraStops: cameraStops.map((stop) => ({ ...stop }))
    });
    Object.assign(this.state.groups, groups);
    Object.assign(this.state.layerBlend, layerBlend);
    this.current = step;
  }
}
