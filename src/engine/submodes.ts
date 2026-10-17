import type { ParamKey, PlayState } from "./params";
import type { BlurMask, FoldMode, FxStep, MapMode, SmearShape, WarpType } from "./renderer";

/** The effects in the Add effect menu, in menu order, with the names their groups show. */
export const EFFECT_NAMES: readonly (readonly [FxStep, string])[] = [
  ["kaleidoscope", "Kaleidoscope"], ["map", "Algorithm"], ["warp", "Warp"], ["blur", "Blur"], ["trails", "Trails"],
  ["smear", "Time smear"], ["contours", "Contours"], ["relief", "Relief"], ["camera", "Camera"], ["finish", "Final effects"]
];

/**
 * The submode menus of the effect groups (Kaleidoscope's Radial or tiles,
 * the warp type, the algorithm, the blur mask, the smear pattern), and the
 * sliders each choice shows. A slider that only some choices show is
 * hidden under the others: it has no effect there, so a MIDI control does
 * not move it there either (see isShown).
 */

/** Radial mode uses segments; the tile modes use a tile size instead. */
export const KALEIDOSCOPE_KEYS: Record<FoldMode, ParamKey[]> = {
  0: ["segments", "panX", "panY", "rotation", "zoom", "twirl", "centerX", "centerY"],
  1: ["tileSize", "panX", "panY", "rotation", "zoom", "twirl", "centerX", "centerY"],
  2: ["tileSize", "panX", "panY", "rotation", "zoom", "twirl", "centerX", "centerY"]
};
export const FOLD_MODES = [[0, "Radial"], [1, "Triangle tiles"], [2, "Hexagon tiles"]] as const;

/** The sliders each blur mask uses; the others are hidden. */
export const BLUR_KEYS: Record<BlurMask, ParamKey[]> = {
  0: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY"],
  1: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY"],
  2: ["blurAmount", "blurMaskSoft", "blurMaskX", "blurMaskY", "blurMaskAngle"],
  3: ["blurAmount", "blurMaskLevel", "blurMaskSoft"],
  4: ["blurAmount", "blurMaskLevel", "blurMaskSoft"],
  5: ["blurAmount", "blurMaskSize", "blurMaskSoft", "blurMaskX", "blurMaskY"]
};
export const BLUR_MASKS = [
  [0, "Circle, sharp center"], [1, "Circle, blurred center"], [2, "Gradient"], [3, "Bright areas"], [4, "Dark areas"], [5, "Noise"]
] as const;

/** The sliders each kind of warp uses; the others are hidden. */
export const WARP_KEYS: Record<WarpType, ParamKey[]> = {
  0: ["warpAmount", "warpScale", "warpMarble", "warpDetail", "warpFlow"],
  1: ["warpAmount", "warpScale", "warpFlow", "warpCenterX", "warpCenterY"],
  2: ["warpAmount", "warpScale", "warpAngle", "warpFlow"],
  3: ["warpAmount", "warpScale", "warpFlow", "warpCenterX", "warpCenterY"],
  4: ["warpAmount", "warpScale", "warpFlow", "warpCenterX", "warpCenterY"],
  5: ["warpAmount", "warpCellSize", "warpCellAngle", "warpFlow"]
};
export const WARP_TYPES = [[0, "Noise"], [1, "Ripple"], [2, "Waves"], [3, "Swirl"], [4, "Bulge and pinch"], [5, "Cells"]] as const;

/** The sliders each complex map uses; the others are hidden. */
export const MAP_KEYS: Record<MapMode, ParamKey[]> = {
  0: [],
  1: ["mapPower", "mapAngle", "mapScale", "mapMix"],
  2: ["mapPointX", "mapPointY", "mapScale", "mapMix"],
  3: ["mapPointX", "mapPointY", "mapSteps", "mapScale", "mapMix"],
  4: ["mapTwist", "mapAngle", "mapScale", "mapMix"],
  5: ["mapScale", "mapMix"],
  6: ["mapSpeed", "tunnelTwist", "mapAngle", "mapFog", "mapScale", "mapMix"],
  7: ["mapArms", "mapAngle", "mapScale", "mapMix"]
};
export const MAP_MODES = [[1, "Power (z^n)"], [2, "Möbius"], [3, "Julia"], [4, "Log spiral"], [5, "Sine"], [6, "Tunnel"], [7, "Seamless spiral"]] as const;

/** The sliders each time smear pattern uses; Angle only turns the Linear and Sweep patterns. */
export const SMEAR_KEYS: Record<SmearShape, ParamKey[]> = {
  0: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  1: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"],
  2: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  3: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"],
  4: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"]
};
export const SMEAR_SHAPES = [[0, "Linear"], [1, "Rings"], [2, "Sweep"], [3, "Brightness"], [4, "Noise"]] as const;

export type SubmodeKey = "foldMode" | "warpType" | "mapMode" | "blurMask" | "smearShape";

/** One submode menu: the play-state setting it sets, its choices (value and name), and the sliders each choice shows. */
export interface Submode {
  stateKey: SubmodeKey;
  options: readonly (readonly [number, string])[];
  keys: Readonly<Record<number, readonly ParamKey[]>>;
}

export const SUBMODES: readonly Submode[] = [
  { stateKey: "foldMode", options: FOLD_MODES, keys: KALEIDOSCOPE_KEYS },
  { stateKey: "warpType", options: WARP_TYPES, keys: WARP_KEYS },
  { stateKey: "mapMode", options: MAP_MODES, keys: MAP_KEYS },
  { stateKey: "blurMask", options: BLUR_MASKS, keys: BLUR_KEYS },
  { stateKey: "smearShape", options: SMEAR_SHAPES, keys: SMEAR_KEYS }
];

/** The submode menu that shows or hides the slider, or undefined for a slider that always shows. */
export function submodeOf(key: ParamKey): Submode | undefined {
  return SUBMODES.find((submode) => Object.values(submode.keys).some((keys) => keys.includes(key)));
}

/** True when the slider shows (and so has an effect) under the group's current submode. */
export function isShown(key: ParamKey, state: Pick<PlayState, SubmodeKey>): boolean {
  const submode = submodeOf(key);
  return !submode || (submode.keys[state[submode.stateKey]] ?? []).includes(key);
}

/**
 * A short note on where a slider shows, or "" when every choice shows it:
 * the choices that show it when they are few ("Radial"), or "except" the
 * ones that do not when most choices show it ("except Cells").
 */
export function submodeNote(key: ParamKey): string {
  const shown = shownIn(key);
  if (!shown.length) return "";
  const submode = submodeOf(key)!;
  const hidden = submode.options.map(([, name]) => name).filter((name) => !shown.includes(name));
  return shown.length <= hidden.length ? shown.join(", ") : `except ${hidden.join(", ")}`;
}

/** The names of the choices that show the slider, or none when every choice shows it (or it has no submode). */
export function shownIn(key: ParamKey): string[] {
  const submode = submodeOf(key);
  if (!submode) return [];
  const names = submode.options.filter(([value]) => (submode.keys[value] ?? []).includes(key)).map(([, name]) => name);
  return names.length === submode.options.length ? [] : names;
}
