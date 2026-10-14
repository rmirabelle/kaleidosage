import { EASES, MAX_CUSTOM_SECONDS, PARAM_KEYS, REFERENCE_CYCLE, defaultPictureOrder, defaultShapeOrder, type Ease, type GroupKey, type Param, type Params, type PlayState } from "./params";

export const SCENE_EXTENSION = "ksage";
/** 2: ranges share one cycle, and a custom range keeps its own seconds. 1: each range had its own rate, and a speed. */
const SCENE_VERSION = 2;
const GROUP_KEYS: GroupKey[] = ["warp", "map", "kaleidoscope", "blur", "trails", "relief", "finish"];

/** The image inside a scene file: its original file bytes, as base64. */
export interface SceneImage {
  type: string;
  data: string;
}

/** The images a scene holds: the first one always, the second one when the scene fades between two. */
export interface SceneImages {
  image: SceneImage;
  image2?: SceneImage;
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
  const { groups, blendMode, warpMode, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, trailColor, time, clock, warpTime, mapTravel, shapeOrder, pictureOrder, layerBlend } = state;
  const scene: SceneFile = {
    app: "KaleidoSage",
    version: SCENE_VERSION,
    params: savedParams,
    state: { groups: { ...groups }, blendMode, warpMode, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, trailColor, time, clock, warpTime, mapTravel, shapeStack: [...shapeOrder], pictureOrder: [...pictureOrder], layerBlend: { ...layerBlend } },
    image,
    ...(image2 ? { image2 } : {})
  };
  return JSON.stringify(scene);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * A version 1 range's time from its start handle to its end handle, at 1×
 * speed: a wave made "rate" out-and-back trips per second; an angle turned
 * "rate" degrees per second (a whole circle is one full turn).
 */
function oldRateSeconds(param: Param, rate: number) {
  const width = Math.abs((param.high ?? param.max) - (param.low ?? param.min));
  if (param.drift === "spin") return (width >= param.max - param.min ? 360 : width) / Math.abs(rate);
  return 1 / (2 * rate);
}

/** A saved image, if it has an image type and data. */
function sceneImage(value: unknown): SceneImage | undefined {
  if (!isRecord(value) || typeof value.type !== "string" || !value.type.startsWith("image/") || typeof value.data !== "string" || !value.data) {
    return undefined;
  }
  return { type: value.type, data: value.data };
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

  if (isRecord(saved.groups)) {
    for (const key of GROUP_KEYS) if (typeof saved.groups[key] === "boolean") state.groups[key] = saved.groups[key] as boolean;
  }
  state.blendMode = mode(saved.blendMode, [0, 1] as const) ?? state.blendMode;
  state.warpMode = mode(saved.warpMode, [1, 2] as const) ?? state.warpMode;
  /* Scenes from before the warp types had only the noise warp. */
  state.warpType = mode(saved.warpType, [0, 1, 2, 3, 4, 5] as const) ?? 0;
  state.mapMode = mode(saved.mapMode, [1, 2, 3, 4, 5, 6] as const) ?? state.mapMode;
  /* Scenes from before the tile modes have no fold mode; they were radial. */
  state.foldMode = mode(saved.foldMode, [0, 1, 2] as const) ?? 0;
  /**
   * The shape order is saved as "shapeStack", in the order the steps act on
   * the picture. Earlier scenes saved "shapeOrder" the other way round, and
   * scenes before that kept the warp's place in the warp mode: 2 = the warp
   * acts first on the picture (inside the wedges), 1 = last.
   */
  const earlier = order(saved.shapeOrder, defaultShapeOrder());
  state.shapeOrder = order(saved.shapeStack, defaultShapeOrder())
    ?? (earlier && [...earlier].reverse())
    ?? (saved.warpMode === 2 ? ["warp", "kaleidoscope", "map"] : defaultShapeOrder());
  state.pictureOrder = order(saved.pictureOrder, defaultPictureOrder()) ?? defaultPictureOrder();
  const blends = isRecord(saved.layerBlend) ? saved.layerBlend : {};
  for (const step of ["warp", "map", "kaleidoscope"] as const) {
    state.layerBlend[step] = mode(blends[step], [0, 1, 2, 3, 4, 5, 6, 7] as const) ?? 0;
  }
  /* Scenes from before the masked blur had a motion blur mode instead; they get the default mask. */
  state.blurMask = mode(saved.blurMask, [0, 1, 2, 3, 4, 5] as const) ?? state.blurMask;
  state.trailMode = mode(saved.trailMode, [1, 2] as const) ?? state.trailMode;
  if (isNumber(saved.clock)) state.clock = Math.max(0, saved.clock);
  if (isNumber(saved.time)) state.time = Math.max(0, saved.time);
  if (isNumber(saved.warpTime)) state.warpTime = Math.max(0, saved.warpTime);
  if (isNumber(saved.mapTravel)) state.mapTravel = saved.mapTravel;
  if (typeof saved.overlayColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.overlayColor)) state.overlayColor = saved.overlayColor;
  if (typeof saved.trailColor === "string" && /^#[0-9a-f]{6}$/i.test(saved.trailColor)) state.trailColor = saved.trailColor;

  return image2 ? { image, image2 } : { image };
}

/**
 * A short text that changes when anything a scene file keeps changes: every
 * setting and range, the play state that is not animation timing, and which
 * images are loaded (by id). Animation time, the clocks and the range
 * timing are left out, so playing, pausing and Stop do not count as changes.
 */
export function sceneFingerprint(params: Params, state: PlayState, imageIds: [number | null, number | null]): string {
  const settings = PARAM_KEYS.map((key) => {
    const { value, low, high, on, ease, custom, seconds } = params[key];
    return [value, low, high, on, ease ?? null, custom ?? false, custom ? seconds : null];
  });
  const { groups, blendMode, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, trailColor, shapeOrder, pictureOrder, layerBlend } = state;
  return JSON.stringify([settings, groups, blendMode, warpType, mapMode, foldMode, blurMask, trailMode, overlayColor, trailColor, shapeOrder, pictureOrder, layerBlend, imageIds]);
}

export async function blobToSceneImage(blob: Blob): Promise<SceneImage> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  }
  return { type: blob.type || "image/png", data: btoa(binary) };
}

export function sceneImageToBlob(image: SceneImage): Blob {
  const binary = atob(image.data);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: image.type });
}
