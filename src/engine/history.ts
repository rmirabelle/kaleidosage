import { PARAM_KEYS, type Param, type Params, type PlayState } from "./params";
import { sceneFingerprint } from "./scene";
import { audioLinkList } from "./audio";

/** The most steps that Undo can go back. */
const LIMIT = 200;

type SavedParam = Pick<Param, "value" | "low" | "high" | "on" | "ease" | "custom" | "seconds" | "startTime">;
type SavedState = Pick<PlayState, "groups" | "blendMode" | "warpType" | "mapMode" | "foldMode" | "blurMask" | "trailMode"
  | "overlayColor" | "colorBlend" | "trailColor" | "smearShape" | "contourTone" | "contourBlend" | "cameraBlend" | "skyColor" | "cameraRepeat" | "videoCrossfade" | "fxOrder" | "layerBlend" | "audioLinks" | "audioRelease" | "particleStops">;

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
      contourTone: state.contourTone,
      contourBlend: state.contourBlend,
      cameraBlend: state.cameraBlend,
      skyColor: state.skyColor,
      cameraRepeat: state.cameraRepeat,
      videoCrossfade: state.videoCrossfade,
      fxOrder: [...state.fxOrder],
      layerBlend: { ...state.layerBlend },
      audioLinks: Object.fromEntries(audioLinkList(state.audioLinks).map(([key, source, amount, release, threshold]) => [key, { source, amount, release, threshold }])),
      audioRelease: state.audioRelease,
      particleStops: state.particleStops.map((stop) => ({ ...stop }))
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
    const { groups, layerBlend, fxOrder, audioLinks, particleStops, ...modes } = step.state;
    Object.assign(this.state, modes, { fxOrder: [...fxOrder], audioLinks: structuredClone(audioLinks), particleStops: particleStops.map((stop) => ({ ...stop })) });
    Object.assign(this.state.groups, groups);
    Object.assign(this.state.layerBlend, layerBlend);
    this.current = step;
  }
}
