import type { ParamKey, PlayState } from "./params";
import type { BlurMask, CycleMove, CyclePaint, FoldMode, FxStep, MapMode, SmearShape, SolidMap, SolidShape, WarpType, MandelPlace } from "./renderer";

/** The effects in the Add effect menu, in menu order, with the names their groups show. */
export const EFFECT_NAMES: readonly (readonly [FxStep, string])[] = [
  ["kaleidoscope", "Kaleidoscope"], ["map", "Algorithm"], ["warp", "Warp"], ["blur", "Blur"], ["trails", "Trails"],
  ["smear", "Time smear"], ["contours", "Contours"], ["relief", "Relief"], ["driver", "Driver"], ["camera", "Camera"], ["solid", "3D object"], ["sort", "Pixel sort"], ["particles", "Particles"], ["cycles", "Light cycles"], ["rays", "Light rays"], ["lasers", "Lasers"], ["picture", "Overlay"], ["bloom", "Bloom"], ["sharpen", "Sharpen"], ["color", "Color"], ["levels", "Levels"]
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
  5: ["warpAmount", "warpCellSize", "warpCellAngle", "warpCellSides", "warpCellRandom", "warpFlow"]
};
export const WARP_TYPES = [[0, "Noise"], [1, "Ripple"], [2, "Waves"], [3, "Swirl"], [4, "Bulge and pinch"], [5, "Cells"]] as const;

/** The sliders each complex map uses; the others are hidden. */
export const MAP_KEYS: Record<MapMode, ParamKey[]> = {
  0: [],
  1: ["mapPower", "mapAngle", "mapRoll", "mapCurl", "mapScale", "mapPanX", "mapPanY", "mapMix"],
  2: ["mobiusPoint", "mobiusTurn", "mobiusRotation", "mobiusTwist", "mobiusZoom", "mobiusPanX", "mobiusPanY", "mobiusFog", "mobiusFogSoftness", "mapMix"],
  3: ["juliaShape", "juliaEdge", "mapSteps", "mapAngle", "mapRoll", "mapCurl", "juliaZoom", "juliaFog", "juliaFogSoftness", "mapPanX", "mapPanY", "mapMix"],
  4: ["mapSpeed", "mapTwist", "mapAngle", "mapFog", "mapFogSoftness", "mapScale", "mapPanX", "mapPanY", "mapMix"],
  5: ["mapAngle", "mapRoll", "mapCurl", "mapScale", "mapPanX", "mapPanY", "mapMix"],
  6: ["mapSpeed", "tunnelTwist", "mapAngle", "mapFog", "mapFogSoftness", "mapScale", "mapPanX", "mapPanY", "mapMix"],
  7: ["mapSpeed", "mapArms", "mapAngle", "mapFog", "mapFogSoftness", "mapScale", "mapPanX", "mapPanY", "mapMix"],
  8: ["mapSpeed", "drosteSize", "drosteSpirals", "drosteSoftness", "drosteRound", "drostePictureTurn", "drosteRotation", "mapPanX", "mapPanY", "mapMix"],
  9: ["mandelDepth", "mandelEnd", "mandelSpeed", "mandelFade", "mandelSpread", "mandelInvert", "mandelEdge", "mandelEdgeWidth", "mandelBands", "mandelFlow", "mandelTerraces", "mandelSoftness", "mandelLight", "mandelLightAngle", "mapAngle", "mapPanX", "mapPanY", "mapMix"]
};
export const MAP_MODES = [[8, "Droste spiral"], [2, "Möbius"], [3, "Julia"], [9, "Mandelbrot"], [4, "Log spiral"], [5, "Sine"], [6, "Tunnel"], [7, "Seamless spiral"], [1, "Power (z^n)"]] as const;

/**
 * The Mandelbrot map's places to dive into. Each is the center of a deep
 * small copy of the set with a long loop (found with Newton's method; its
 * loop length, size and depth in brackets). A dive toward it passes layer
 * after layer of shapes that change, about halfway (in depth) to the copy,
 * then three quarters, and so on, so the shapes evolve from depth 6 or so
 * on. Exact to the 16 digits a double holds.
 */
export const MANDEL_PLACES = [[0, "Seahorse valley"], [1, "Spiral"], [5, "Branches"], [2, "Dendrite"], [3, "Mini copies"], [4, "Elephant valley"]] as const;
export const MANDEL_CENTERS: Record<MandelPlace, [number, number]> = {
  /* The well-known deep-zoom point of Seahorse valley (loop 998, 6.3e-16, depth 15.4). */
  0: [-0.7436438870371587, 0.1318259042053120],
  /* Loop 1080 (2.5e-14, depth 13.8), beside a spiral. */
  1: [-0.10134262871148131, 0.9535287700009097],
  /* Loop 455 (2.8e-13, depth 12.7), among fine dendrites. */
  2: [-0.04523284781423843, 0.9868047161954946],
  /* Loop 976 (1.8e-14, depth 13.9), with small copies around it. */
  3: [-1.396005521446242, 0.10596699543784054],
  /* Loop 1008 (4.5e-14, depth 13.5), among the elephants. */
  4: [0.2891996512212723, 0.013330587744320848],
  /* Loop 1692 (2.9e-13, depth 12.7), on star-shaped branches. */
  5: [-0.23573987601938484, 0.8300187774133859]
};

/** The sliders each time smear pattern uses; Angle only turns the Linear and Sweep patterns. */
export const SMEAR_KEYS: Record<SmearShape, ParamKey[]> = {
  0: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  1: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"],
  2: ["smearAmount", "smearDelay", "smearAngle", "smearBands", "smearRestart", "smearFade"],
  3: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"],
  4: ["smearAmount", "smearDelay", "smearBands", "smearRestart", "smearFade"]
};
export const SMEAR_SHAPES = [[0, "Linear"], [1, "Rings"], [2, "Sweep"], [3, "Brightness"], [4, "Noise"]] as const;

/**
 * The sliders of each way the light cycles move; Grid Size is for grid lanes
 * only. The Blend menu and Opacity (cyclesAmount) come after these, in the
 * Common part of the group.
 */
export const CYCLE_KEYS: Record<CycleMove, ParamKey[]> = {
  0: ["cyclesCount", "cyclesSpeed", "cyclesWidth", "cyclesLength", "cyclesTurns", "cyclesFollow", "cyclesDodge", "cyclesGrid", "cyclesHead", "cyclesBackground", "cyclesAmount"],
  1: ["cyclesCount", "cyclesSpeed", "cyclesWidth", "cyclesLength", "cyclesTurns", "cyclesFollow", "cyclesDodge", "cyclesHead", "cyclesBackground", "cyclesAmount"]
};
export const CYCLE_MOVES = [[0, "Grid"], [1, "Free"]] as const;

/**
 * The gradient sliders of each place the cycles' colors come from: Repeat
 * is not for one color per cycle, Angle is for a linear gradient on the
 * screen, and the center for a radial one.
 */
export const CYCLE_PAINT_KEYS: Record<CyclePaint, ParamKey[]> = {
  0: ["cyclesGradient", "cyclesShift"],
  1: ["cyclesGradient", "cyclesShift", "cyclesRepeat"],
  2: ["cyclesGradient", "cyclesShift", "cyclesRepeat", "cyclesAngle"],
  3: ["cyclesGradient", "cyclesShift", "cyclesRepeat", "cyclesCenterX", "cyclesCenterY"]
};
export const CYCLE_PAINTS = [[0, "Cycle"], [1, "Trail"], [2, "Position, linear"], [3, "Position, radial"]] as const;

/** The 3D Object's sliders, in panel order. Roundness and the map's own sliders show only where they do something (see SOLID_SHAPE_KEYS and SOLID_MAP_KEYS). */
export const SOLID_KEYS: readonly ParamKey[] = ["solidSize", "solidRound", "solidMorph", "solidBlobs", "solidBumps", "solidWaves", "solidSpikes", "solidSpikeCount", "solidSpikeTip", "solidLevels", "solidSpin", "solidTumble", "solidTilt", "solidTiles", "solidBend", "solidLight", "solidShading", "solidShine", "solidShadow", "solidBackground", "solidX", "solidY", "solidAmount"];
/**
 * Each shape's own sliders. The sphere and Morph have no edges to round;
 * for the blobs Roundness is how softly they merge, for the star how round
 * its spikes are, for the Menger sponge how round its holes are. Numbers 2 to 5 were the cylinder, cone, torus and capsule
 * until 2026-10-24 (no scene used them).
 */
export const SOLID_SHAPE_KEYS: Record<SolidShape, ParamKey[]> = {
  0: [], 1: ["solidRound"], 2: ["solidMorph"], 3: ["solidBlobs", "solidRound"], 4: ["solidBumps", "solidWaves"], 5: ["solidSpikes", "solidSpikeCount", "solidSpikeTip", "solidRound"],
  6: ["solidRound"], 7: ["solidRound"], 8: ["solidRound"], 9: ["solidLevels", "solidRound"]
};
/** The sliders that only some shapes show (see SOLID_SHAPE_KEYS). */
export const SOLID_SHAPE_ONLY: readonly ParamKey[] = ["solidRound", "solidMorph", "solidBlobs", "solidBumps", "solidWaves", "solidSpikes", "solidSpikeCount", "solidSpikeTip", "solidLevels"];
export const SOLID_SHAPES = [[0, "Sphere"], [1, "Cube"], [2, "Morph"], [3, "Blobs"], [4, "Wobbly ball"], [5, "Star"], [6, "Octahedron"], [7, "Icosahedron"], [8, "Pyramid"], [9, "Menger sponge"]] as const;
/** Tiles is for Wrap; Bend for Project. */
export const SOLID_MAP_KEYS: Record<SolidMap, ParamKey[]> = { 0: ["solidTiles"], 1: ["solidBend"], 2: [] };
export const SOLID_MAPS = [[0, "Wrap"], [1, "Project"], [2, "Mirror"]] as const;

export type SubmodeKey = "foldMode" | "warpType" | "mapMode" | "blurMask" | "smearShape" | "cyclesMove" | "cyclesPaint" | "solidShape" | "solidMap";

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
  { stateKey: "smearShape", options: SMEAR_SHAPES, keys: SMEAR_KEYS },
  { stateKey: "cyclesMove", options: CYCLE_MOVES, keys: CYCLE_KEYS },
  { stateKey: "cyclesPaint", options: CYCLE_PAINTS, keys: CYCLE_PAINT_KEYS },
  { stateKey: "solidShape", options: SOLID_SHAPES, keys: SOLID_SHAPE_KEYS },
  { stateKey: "solidMap", options: SOLID_MAPS, keys: SOLID_MAP_KEYS }
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
