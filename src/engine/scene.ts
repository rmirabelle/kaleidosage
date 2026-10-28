import { CONTOUR_TONES, EASES, MAX_CUSTOM_SECONDS, MAX_GRADIENT_STOPS, PARAM_KEYS, REFERENCE_CYCLE, defaultCycleStops, defaultTerrainStops, defaultFxOrder, defaultOutlineStops, defaultGradientStops, defaultPictureOrder, defaultShapeOrder, effectShows, lensFocal, type ContourTone, type Ease, type GradientStop, type GroupKey, type Param, type Params, type PlayState } from "./params";
import { isShapeStep, type FxStep } from "./renderer";
import { readSound, soundList } from "./audio";

export const SCENE_EXTENSION = "ksage";
/** 6: the landscape effect is Terrain, and Camera views the flat picture with the same camera. 5: Terrain made the land, and Camera viewed it. 4: the camera Lens is a focal length in mm, not an angle. 3: reads as 2 (it changed only an effect that was later removed). 2: ranges share one cycle, and a custom range keeps its own seconds. 1: each range had its own rate, and a speed. */
const SCENE_VERSION = 6;
const GROUP_KEYS: GroupKey[] = ["warp", "map", "kaleidoscope", "blur", "trails", "smear", "contours", "relief", "driver", "terrain", "camera", "solid", "sort", "particles", "cycles", "rays", "lasers", "outlines", "bloom", "sharpen", "color", "levels"];

/** Still images and legacy videos use base64. New videos refer to an embedded archive entry. */
export type SceneImage = { type: string; data: string; video?: never }
  | { type: string; video: string; data?: never };

/**
 * The images a scene holds: the first one always, the second one when the
 * scene fades between two. Either can be a video, so a scene file plays
 * the same on any PC.
 */
export interface SceneImages {
  image: SceneImage;
  image2?: SceneImage;
  /** The Driver effect's own video, embedded like a source video, and its file name. */
  driverVideo?: { media: SceneImage; name: string };
  /** The Image or Video effect's own image or video (a video embedded like a source video), and its file name. */
  picture?: { media: SceneImage; name: string };
  /** Terrain's real land (see SceneTerrain). */
  terrain?: SceneTerrain;
}

/**
 * Real terrain as a scene file keeps it (see docs/TERRAIN.md): the place,
 * the area, the heights' size and range, the heights (16-bit, 0 to 65535
 * for 0 to 1, row by row from the north edge, little-endian, gzip, then
 * base64) and the area's picture, when it has one.
 */
export interface SceneTerrain {
  place: string;
  longitude: number;
  latitude: number;
  areaKm: number;
  width: number;
  height: number;
  lowest: number;
  highest: number;
  relief: number;
  heights: string;
  picture?: SceneImage;
}

/**
 * A .ksage file is JSON: every parameter (value, drift range, rate, phases),
 * the play state (groups, modes, speed, animation time) and the images.
 */
interface SceneFile {
  app: "KaleidoSage";
  version: number;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  image: SceneImage;
  image2?: SceneImage;
}

export function serializeScene(params: Params, state: PlayState, { image, image2 }: SceneImages): string {
  const savedParams: Record<string, unknown> = {};
  for (const key of PARAM_KEYS) {
    const { value, low, high, on, ease, custom, seconds, startTime } = params[key];
    savedParams[key] = { value, low, high, on, ease, custom, seconds, startTime };
  }
  const { groups, blendMode, tiling, warpMode, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, colorBlend, trailColor, smearShape, contourTone, contourBlend, cameraBlend, viewBlend, skyColor, cameraRepeat, cameraHeightSource, cameraColors, cameraStops, sortOrder, particleBlend, particleShape, pictureBlend, particleStops, cyclesMove, cyclesBlend, cyclesPaint, cyclesStops, solidShape, solidMap, solidBlend, solidKeep, mandelPlace, solidSpinTurns, solidTumbleTurns, outlineSpinTurns, outlineTumbleTurns, driverSource, driverMode, videoCrossfade, time, clock, warpTime, mandelFlowTime, driverTime, mapTravel, cameraX, cameraY, fxOrder, layerBlend, outlineShape, outlineDraw, outlineStops, outlineTime, outlineFlowTime } = state;
  /**
   * "effects" is the effect list. Earlier versions of the app read two full
   * orders of their own, so they get the list's order inside each kind,
   * with the other steps after it (their groups are off).
   */
  const fullOrder = [...fxOrder, ...defaultFxOrder().filter((step) => !fxOrder.includes(step))];
  const shapeStack = fullOrder.filter((step) => isShapeStep(step));
  const pictureOrder = fullOrder.filter((step) => !isShapeStep(step));
  const scene: SceneFile = {
    app: "KaleidoSage",
    version: SCENE_VERSION,
    params: savedParams,
    state: { groups: { ...groups }, blendMode, tiling, warpMode, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, colorBlend, trailColor, smearShape, contourTone, contourBlend, cameraBlend, viewBlend, skyColor, cameraRepeat, cameraHeightSource, cameraColors, cameraStops, sortOrder, particleBlend, particleShape, pictureBlend, particleStops: particleStops.map((stop) => ({ ...stop })), cyclesMove, cyclesBlend, cyclesPaint, cyclesStops: cyclesStops.map((stop) => ({ ...stop })), solidShape, solidMap, solidBlend, solidKeep, mandelPlace, solidSpinTurns, solidTumbleTurns, outlineSpinTurns, outlineTumbleTurns, driverSource, driverMode, videoCrossfade, time, clock, warpTime, mandelFlowTime, driverTime, mapTravel, cameraX, cameraY, effects: [...fxOrder], shapeStack, pictureOrder, layerBlend: { ...layerBlend }, outlineShape, outlineDraw, outlineStops: outlineStops.map((stop) => ({ ...stop })), outlineTime, outlineFlowTime, sound: soundList(state.sound) },
    image,
    ...(image2 ? { image2 } : {})
  };
  return JSON.stringify(scene);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);

/** The effects that older scenes had as one, Final effects ("finish"), in their order. */
const FINISH_PARTS: FxStep[] = ["sharpen", "color", "levels"];

/** A saved gradient's stops, kept inside 0 to 1 and in order, or undefined when fewer than 2 read well. */
function readGradientStops(saved: unknown): GradientStop[] | undefined {
  if (!Array.isArray(saved)) return undefined;
  const stops = saved
    .filter((stop): stop is { at: number; color: string } => isRecord(stop) && isNumber(stop.at) && typeof stop.color === "string" && /^#[0-9a-f]{6}$/i.test(stop.color))
    .map((stop) => ({ at: clamp(stop.at, 0, 1), color: stop.color.toLowerCase() }))
    .sort((a, b) => a.at - b.at)
    .slice(0, MAX_GRADIENT_STOPS);
  return stops.length >= 2 ? stops : undefined;
}
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A version 1 range's time from its start handle to its end handle, at 1×
 * speed: a wave made "rate" out-and-back trips per second; an angle turned
 * "rate" degrees per second (a whole circle is one full turn).
 */
/**
 * A scene from before the free camera: its camera circled an aim point
 * (cameraX, cameraY) by Turn, at Tilt from straight down and Distance away,
 * and flew by Speed. The free camera takes the same place and view: its
 * place and height are the old eye's, Pan looks the old way (Turn + 180°),
 * Tilt is the old tilt less 90°, and Dolly is the old Speed. A turning
 * orbit becomes a turning pan in place.
 */
function freeCameraOf(savedParams: Record<string, unknown>, params: Params, state: PlayState) {
  const old = (key: string) => (isRecord(savedParams[key]) ? savedParams[key] : undefined) as Record<string, unknown> | undefined;
  if (!old("cameraDistance") && !old("cameraTurn")) return;
  const value = (key: string, fallback: number) => isNumber(old(key)?.value) ? old(key)!.value as number : fallback;
  const toRadians = Math.PI / 180;
  const turn = value("cameraTurn", 270);
  const tilt = value("cameraTilt", 50);
  const distance = value("cameraDistance", 1.6);
  const top = Math.abs(params.cameraHeight.value);
  const away = distance * Math.sin(tilt * toRadians);
  state.cameraX += away * Math.cos(turn * toRadians);
  state.cameraY += away * Math.sin(turn * toRadians);
  /* Copies an old setting's range and timing into a new one, with its values mapped. */
  const take = (key: string, param: Param, map: (value: number) => number) => {
    const entry = old(key);
    param.value = clamp(map(value(key, param.value)), param.min, param.max);
    if (!entry || !param.drift) return;
    if (isNumber(entry.low)) param.low = clamp(map(entry.low), param.min, param.max);
    if (isNumber(entry.high)) param.high = clamp(map(entry.high), param.min, param.max);
    param.on = entry.on === true;
    param.ease = EASES.some(([kind]) => kind === entry.ease) ? entry.ease as Ease : undefined;
    param.custom = entry.custom === true && isNumber(entry.seconds);
    if (param.custom) param.seconds = clamp(entry.seconds as number, 1, MAX_CUSTOM_SECONDS);
    if (isNumber(entry.startTime)) param.startTime = entry.startTime;
  };
  /* A full-turn pan range stays 0 to 360°; a partial one moves half a turn. */
  const fullTurn = isNumber(old("cameraTurn")?.low) && isNumber(old("cameraTurn")?.high) && (old("cameraTurn")!.high as number) - (old("cameraTurn")!.low as number) >= 359;
  take("cameraTurn", params.cameraPan, (angle) => ((angle + 180) % 360 + 360) % 360);
  if (fullTurn) Object.assign(params.cameraPan, { low: 0, high: 360 });
  take("cameraTilt", params.cameraTilt, (angle) => angle - 90);
  take("cameraSpeed", params.cameraDolly, (speed) => speed);
  params.cameraPedestal.value = clamp(Math.max(top * 0.5 + distance * Math.cos(tilt * toRadians), top + 0.02), params.cameraPedestal.min, params.cameraPedestal.max);
  params.cameraPedestal.on = false;
}

/**
 * A scene from before Terrain had the landscape effect as Camera. Its
 * settings are Terrain's now (they kept their names), so its Camera becomes
 * Terrain, in the same place. (A scene saved by version 5, when a Terrain
 * could stand before a Camera, keeps one Terrain in the Camera's place.)
 */
function terrainOf(state: PlayState) {
  if (!state.fxOrder.includes("camera")) return;
  state.fxOrder = state.fxOrder.filter((step) => step !== "terrain").map((step) => (step === "camera" ? "terrain" : step));
  state.groups.terrain = state.groups.camera;
  state.groups.camera = false;
}

function oldRateSeconds(param: Param, rate: number) {
  const width = Math.abs((param.high ?? param.max) - (param.low ?? param.min));
  if (param.drift === "spin") return (width >= param.max - param.min ? 360 : width) / Math.abs(rate);
  return 1 / (2 * rate);
}

/** A saved image, if it has an image type and data. */
function sceneImage(value: unknown): SceneImage | undefined {
  if (!isRecord(value) || typeof value.type !== "string" || !/^(image|video)\//.test(value.type)) return undefined;
  if (typeof value.data === "string" && value.data) return { type: value.type, data: value.data };
  if (value.type.startsWith("video/") && typeof value.video === "string" && value.video) return { type: value.type, video: value.video };
  return undefined;
}

/** A scene's real terrain, or undefined when it is missing or broken (the scene then opens with no land loaded). */
function sceneTerrain(value: unknown): SceneTerrain | undefined {
  if (!isRecord(value)) return undefined;
  const { place, longitude, latitude, areaKm, width, height, lowest, highest, relief, heights } = value;
  if (typeof place !== "string" || typeof heights !== "string" || !heights) return undefined;
  if (!isNumber(longitude) || !isNumber(latitude) || !isNumber(areaKm) || !isNumber(lowest) || !isNumber(highest) || !isNumber(relief)) return undefined;
  if (!Number.isInteger(width) || !Number.isInteger(height) || (width as number) < 1 || (height as number) < 1) return undefined;
  const picture = sceneImage(value.picture);
  return { place, longitude, latitude, areaKm, width: width as number, height: height as number, lowest, highest, relief, heights, ...(picture?.data !== undefined ? { picture } : {}) };
}

/**
 * A saved order of steps, if each one is known and there only once. A scene
 * from before a step was added (for example Contours) gets the new step at
 * its default place, after the step it follows by default; the saved order
 * of the others stays.
 */
function orderWithNewSteps<T extends string>(value: unknown, steps: readonly T[]): T[] | undefined {
  if (!Array.isArray(value) || !value.every((step) => steps.includes(step)) || new Set(value).size !== value.length) return undefined;
  const result = [...value] as T[];
  steps.forEach((step, index) => {
    if (result.includes(step)) return;
    const before = index > 0 ? result.indexOf(steps[index - 1]) : -1;
    result.splice(before + 1, 0, step);
  });
  return result;
}

/** A saved order, if it has every step exactly once. */
function order<T extends string>(value: unknown, steps: readonly T[]): T[] | undefined {
  if (!Array.isArray(value) || value.length !== steps.length) return undefined;
  if (!steps.every((step) => value.includes(step))) return undefined;
  return value as T[];
}

/** A saved mode, if it is one of the allowed values. */
function mode<T extends number>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}

/**
 * Reads a scene file into params and state, and returns its images. Values
 * outside their limits are clamped, and unknown or broken entries are
 * skipped, so a file from a newer or older version still opens.
 */
export function applyScene(text: string, params: Params, state: PlayState): SceneImages {
  let scene: unknown;
  try {
    scene = JSON.parse(text);
  } catch {
    throw new Error("The file is not a Kaleido Sage scene.");
  }
  if (!isRecord(scene) || scene.app !== "KaleidoSage") throw new Error("The file is not a Kaleido Sage scene.");
  const image = sceneImage(scene.image);
  if (!image) throw new Error("The scene file has no image.");
  /* A broken second image is skipped, so the scene still opens with the first. */
  const image2 = sceneImage(scene.image2);

  const savedParams = isRecord(scene.params) ? scene.params : {};
  const saved = isRecord(scene.state) ? scene.state : {};
  /**
   * Version 1 had a speed and a rate for each range, unless its shared
   * cycle was on. Those ranges open with their own times, in the real
   * seconds they took at that speed, and the speed becomes the cycle.
   */
  const oldTiming = !(isNumber(scene.version) && scene.version >= 2) && saved.sharedCycle !== true;
  /* Scenes before version 4 saved the Lens as the view's vertical angle in degrees. */
  const lensDegrees = !(isNumber(scene.version) && scene.version >= 4) ? savedParams.cameraLens : undefined;
  if (isRecord(lensDegrees)) {
    for (const end of ["value", "low", "high"] as const) {
      if (isNumber(lensDegrees[end])) lensDegrees[end] = lensFocal(clamp(lensDegrees[end] as number, 1, 179));
    }
  }
  const oldSpeed = isRecord(savedParams.speed) && isNumber(savedParams.speed.value) ? savedParams.speed.value
    : isNumber(saved.speed) ? saved.speed : 1;
  if (oldTiming && !isRecord(savedParams.cycle)) {
    params.cycle.value = clamp(Math.round(REFERENCE_CYCLE / Math.max(oldSpeed, 1e-3)), params.cycle.min, params.cycle.max);
  }
  for (const key of PARAM_KEYS) {
    const entry = savedParams[key];
    if (!isRecord(entry)) continue;
    const param = params[key];
    if (isNumber(entry.value)) param.value = clamp(entry.value, param.min, param.max);
    if (!param.drift) continue;
    if (isNumber(entry.low)) param.low = clamp(entry.low, param.min, param.max);
    if (isNumber(entry.high)) param.high = clamp(entry.high, param.min, param.max);
    if (typeof entry.on === "boolean") param.on = entry.on;
    param.ease = EASES.some(([kind]) => kind === entry.ease) ? entry.ease as Ease : undefined;
    if (oldTiming) {
      const seconds = isNumber(entry.rate) ? oldRateSeconds(param, entry.rate) / Math.max(oldSpeed, 1e-3) : 0;
      if (seconds > 0 && Number.isFinite(seconds)) Object.assign(param, { custom: true, seconds: clamp(seconds, 1, MAX_CUSTOM_SECONDS), startTime: 0 });
      continue;
    }
    param.custom = entry.custom === true && isNumber(entry.seconds);
    if (param.custom) param.seconds = clamp(entry.seconds as number, 1, MAX_CUSTOM_SECONDS);
    if (isNumber(entry.startTime)) param.startTime = entry.startTime;
  }

  /**
   * Scenes from before the cell size sized the cells warp with the warp size,
   * where a larger size made smaller cells. The cell size gets the same cells.
   */
  if (!isRecord(savedParams.warpCellSize) && isRecord(savedParams.warpScale)) {
    const cell = params.warpCellSize;
    const scale = params.warpScale;
    const toCell = (size: number) => clamp(10 / (1.5 * size), cell.min, cell.max);
    Object.assign(cell, { value: toCell(scale.value), low: toCell(scale.low ?? scale.value), high: toCell(scale.high ?? scale.value), on: scale.on, ease: scale.ease, custom: scale.custom, seconds: scale.seconds, startTime: scale.startTime });
  }

  if (isRecord(saved.groups)) {
    for (const key of GROUP_KEYS) if (typeof saved.groups[key] === "boolean") state.groups[key] = saved.groups[key] as boolean;
    /* Scenes from before Sharpen, Color and Levels had them as one effect, Final effects ("finish"). */
    if (typeof saved.groups.finish === "boolean") for (const part of FINISH_PARTS) state.groups[part] = saved.groups.finish;
  }
  state.blendMode = mode(saved.blendMode, [0, 1] as const) ?? state.blendMode;
  /* Scenes from before tiling have none; auto works as they did, except for repeating test patterns. */
  state.tiling = mode(saved.tiling, [0, 1, 2] as const) ?? 0;
  state.warpMode = mode(saved.warpMode, [1, 2] as const) ?? state.warpMode;
  /* Scenes from before the warp types had only the noise warp. */
  state.warpType = mode(saved.warpType, [0, 1, 2, 3, 4, 5] as const) ?? 0;
  state.mapMode = mode(saved.mapMode, [1, 2, 3, 4, 5, 6, 7, 8, 9] as const) ?? state.mapMode;
  state.mandelPlace = mode(saved.mandelPlace, [0, 1, 2, 3, 4, 5] as const) ?? state.mandelPlace;
  /* Scenes from before the tile modes have no fold mode; they were radial. */
  state.foldMode = mode(saved.foldMode, [0, 1, 2, 3, 4] as const) ?? 0;
  /**
   * The effect list is saved as "effects". Earlier scenes listed every
   * effect in one order ("fxOrder"), and before that the shape steps came
   * first, then the picture steps, each kind with its own order.
   * The shape order was saved as "shapeStack", in the order the steps act on
   * the picture; scenes before that saved "shapeOrder" the other way round,
   * and scenes before that kept the warp's place in the warp mode: 2 = the
   * warp acts first on the picture (inside the wedges), 1 = last.
   */
  const earlier = order(saved.shapeOrder, defaultShapeOrder());
  const shapeOrder = order(saved.shapeStack, defaultShapeOrder())
    ?? (earlier && [...earlier].reverse())
    ?? (saved.warpMode === 2 ? ["warp", "kaleidoscope", "map"] : defaultShapeOrder());
  /* A step the app no longer has (such as the old branches effect) is dropped from the list. */
  /* Final effects in an older list becomes the parts of it that change the picture, in its place. */
  const splitFinish = (value: unknown, keep: (part: FxStep) => boolean = () => true) =>
    Array.isArray(value) ? value.flatMap((step) => step === "finish" ? FINISH_PARTS.filter(keep) : [step]) : value;
  const savedEffects = splitFinish(saved.effects, (part) => effectShows(part, params, state));
  const effects = Array.isArray(savedEffects) ? savedEffects.filter((step) => defaultFxOrder().includes(step)) : undefined;
  if (Array.isArray(effects) && effects.every((step) => defaultFxOrder().includes(step)) && new Set(effects).size === effects.length) {
    state.fxOrder = [...effects] as FxStep[];
  } else {
    /* Those scenes listed every effect; the list keeps the ones that are on and change the picture. */
    const fullOrder = orderWithNewSteps(splitFinish(saved.fxOrder), defaultFxOrder())
      ?? [...shapeOrder, ...(orderWithNewSteps(splitFinish(saved.pictureOrder), defaultPictureOrder()) ?? defaultPictureOrder())];
    state.fxOrder = fullOrder.filter((step) => effectShows(step, params, state));
  }
  /* An effect that is not in the list is off. */
  for (const step of defaultFxOrder()) if (!state.fxOrder.includes(step)) state.groups[step] = false;
  const blends = isRecord(saved.layerBlend) ? saved.layerBlend : {};
  for (const step of ["warp", "map", "kaleidoscope"] as const) {
    state.layerBlend[step] = mode(blends[step], [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? 0;
  }
  /* Scenes from before the audio switches had a link per setting: each linked setting has its switch on (see readSound). */
  state.sound = readSound(saved.sound, saved.audioLinks, params);
  /* Scenes from before the masked blur had a motion blur mode instead; they get the default mask. */
  state.blurMask = mode(saved.blurMask, [0, 1, 2, 3, 4, 5] as const) ?? state.blurMask;
  state.trailMode = mode(saved.trailMode, [1, 2] as const) ?? state.trailMode;
  if (isNumber(saved.clock)) state.clock = Math.max(0, saved.clock);
  if (isNumber(saved.time)) state.time = Math.max(0, saved.time);
  if (isNumber(saved.warpTime)) state.warpTime = Math.max(0, saved.warpTime);
  if (isNumber(saved.mandelFlowTime)) state.mandelFlowTime = saved.mandelFlowTime;
  if (isNumber(saved.driverTime)) state.driverTime = Math.max(0, saved.driverTime);
  if (isNumber(saved.mapTravel)) state.mapTravel = saved.mapTravel;
  if (isNumber(saved.cameraX)) state.cameraX = saved.cameraX;
  if (isNumber(saved.cameraY)) state.cameraY = saved.cameraY;
  freeCameraOf(savedParams, params, state);
  if (typeof saved.overlayColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.overlayColor)) state.overlayColor = saved.overlayColor;
  /* Scenes from before the color blend covered the picture with the color (Normal). */
  state.colorBlend = mode(saved.colorBlend, [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? 0;
  if (typeof saved.trailColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.trailColor)) state.trailColor = saved.trailColor;
  if (typeof saved.skyColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.skyColor)) state.skyColor = saved.skyColor;
  /* Scenes from before the life gradient have none, and get the default; stops that do not read well are dropped. */
  state.particleStops = readGradientStops(saved.particleStops) ?? defaultGradientStops();
  if (typeof saved.videoCrossfade === "boolean") state.videoCrossfade = saved.videoCrossfade;
  state.smearShape = mode(saved.smearShape, [0, 1, 2, 3, 4] as const) ?? state.smearShape;
  if (CONTOUR_TONES.includes(saved.contourTone as ContourTone)) state.contourTone = saved.contourTone as ContourTone;
  state.contourBlend = mode(saved.contourBlend, [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? state.contourBlend;
  state.cameraBlend = mode(saved.cameraBlend, [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? state.cameraBlend;
  state.viewBlend = mode(saved.viewBlend, [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? state.viewBlend;
  state.cameraRepeat = mode(saved.cameraRepeat, [0, 1, 2] as const) ?? state.cameraRepeat;
  /* Terrain's land is always real terrain colored by its picture; older scenes' other choices are not read. */
  state.cameraHeightSource = 2;
  state.cameraColors = 2;
  state.cameraStops = readGradientStops(saved.cameraStops) ?? defaultTerrainStops();
  if (!(isNumber(scene.version) && scene.version >= 6)) terrainOf(state);
  state.sortOrder = mode(saved.sortOrder, [0, 1] as const) ?? state.sortOrder;
  state.particleBlend = mode(saved.particleBlend, [0, 1] as const) ?? state.particleBlend;
  state.particleShape = mode(saved.particleShape, [0, 1, 2] as const) ?? state.particleShape;
  state.pictureBlend = mode(saved.pictureBlend, [0, 1, 2] as const) ?? state.pictureBlend;
  state.cyclesMove = mode(saved.cyclesMove, [0, 1] as const) ?? state.cyclesMove;
  state.cyclesBlend = mode(saved.cyclesBlend, [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? state.cyclesBlend;
  state.cyclesPaint = mode(saved.cyclesPaint, [0, 1, 2, 3] as const) ?? state.cyclesPaint;
  state.cyclesStops = readGradientStops(saved.cyclesStops) ?? defaultCycleStops();
  state.outlineShape = mode(saved.outlineShape, [0, 1, 2, 3] as const) ?? state.outlineShape;
  state.outlineDraw = mode(saved.outlineDraw, [0, 1, 2] as const) ?? state.outlineDraw;
  state.outlineStops = readGradientStops(saved.outlineStops) ?? defaultOutlineStops();
  if (isNumber(saved.outlineTime)) state.outlineTime = ((saved.outlineTime % 1) + 1) % 1;
  if (isNumber(saved.outlineFlowTime)) state.outlineFlowTime = ((saved.outlineFlowTime % 1) + 1) % 1;
  state.solidShape = mode(saved.solidShape, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9] as const) ?? state.solidShape;
  state.solidMap = mode(saved.solidMap, [0, 1, 2] as const) ?? state.solidMap;
  state.solidBlend = mode(saved.solidBlend, [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? state.solidBlend;
  /* A scene from before Freeze background has the 3D Object in the one picture, as it had then. */
  state.solidKeep = saved.solidKeep === true;
  if (isNumber(saved.solidSpinTurns)) state.solidSpinTurns = saved.solidSpinTurns % 1;
  if (isNumber(saved.outlineSpinTurns)) state.outlineSpinTurns = saved.outlineSpinTurns % 1;
  if (isNumber(saved.outlineTumbleTurns)) state.outlineTumbleTurns = saved.outlineTumbleTurns % 1;
  if (isNumber(saved.solidTumbleTurns)) state.solidTumbleTurns = saved.solidTumbleTurns % 1;
  state.driverSource = mode(saved.driverSource, [0, 1, 2, 3, 4, 5] as const) ?? state.driverSource;
  state.driverMode = mode(saved.driverMode, [0, 1, 2] as const) ?? state.driverMode;

  const driverMedia = sceneImage(scene.driverVideo);
  const driverVideo = driverMedia?.video !== undefined ? { media: driverMedia, name: isRecord(scene.driverVideo) && typeof scene.driverVideo.name === "string" ? scene.driverVideo.name : "Video" } : undefined;
  const pictureMedia = sceneImage(scene.picture);
  const picture = pictureMedia ? { media: pictureMedia, name: isRecord(scene.picture) && typeof scene.picture.name === "string" ? scene.picture.name : "Image or Video" } : undefined;
  const terrain = sceneTerrain(scene.terrain);
  return { image, ...(image2 ? { image2 } : {}), ...(driverVideo ? { driverVideo } : {}), ...(picture ? { picture } : {}), ...(terrain ? { terrain } : {}) };
}

/**
 * A short text that changes when anything a scene file keeps changes: every
 * setting and range, the play state that is not animation timing, and which
 * images are loaded (by id). Animation time, the clocks and the range
 * timing are left out, so playing, pausing and Stop do not count as changes.
 */
/** imageIds: the ids of the first and second images, then of the driver video, of the overlay's image or video and of the real terrain (missing or null when there is none). */
export function sceneFingerprint(params: Params, state: PlayState, imageIds: readonly (number | null)[]): string {
  const settings = PARAM_KEYS.map((key) => {
    const { value, low, high, on, ease, custom, seconds } = params[key];
    return [value, low, high, on, ease ?? null, custom ?? false, custom ? seconds : null];
  });
  const { groups, blendMode, tiling, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, colorBlend, trailColor, smearShape, contourTone, contourBlend, cameraBlend, viewBlend, skyColor, cameraRepeat, cameraHeightSource, cameraColors, cameraStops, sortOrder, particleBlend, particleShape, pictureBlend, particleStops, cyclesMove, cyclesBlend, cyclesPaint, cyclesStops, solidShape, solidMap, solidBlend, solidKeep, mandelPlace, driverSource, driverMode, videoCrossfade, fxOrder, layerBlend, outlineShape, outlineDraw, outlineStops } = state;
  return JSON.stringify([settings, outlineShape, outlineDraw, outlineStops, groups, blendMode, tiling, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, colorBlend, trailColor, smearShape, contourTone, contourBlend, cameraBlend, viewBlend, skyColor, cameraRepeat, cameraHeightSource, cameraColors, cameraStops, sortOrder, particleBlend, particleShape, pictureBlend, particleStops, cyclesMove, cyclesBlend, cyclesPaint, cyclesStops, solidShape, solidMap, solidBlend, solidKeep, mandelPlace, driverSource, driverMode, videoCrossfade, fxOrder, layerBlend, soundList(state.sound), imageIds]);
}

/** Uint8Array.fromBase64 and toBase64, in newer browsers; much faster for a large video. */
type Base64Bytes = { toBase64?: () => string };
type Base64Constructor = { fromBase64?: (text: string) => Uint8Array };

export async function blobToSceneImage(blob: Blob): Promise<SceneImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const type = blob.type || "image/png";
  const fast = (bytes as Base64Bytes).toBase64;
  if (fast) return { type, data: fast.call(bytes) };
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return { type, data: btoa(binary) };
}

export function sceneImageToBlob(image: SceneImage): Blob {
  if (image.data === undefined) throw new Error("Embedded videos must be opened as streams.");
  const fast = (Uint8Array as unknown as Base64Constructor).fromBase64;
  if (fast) return new Blob([fast(image.data) as Uint8Array<ArrayBuffer>], { type: image.type });
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: image.type });
}
