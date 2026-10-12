import { PARAM_KEYS, type GroupKey, type Params, type PlayState } from "./params";

export const SCENE_EXTENSION = "ksage";
const SCENE_VERSION = 1;
const GROUP_KEYS: GroupKey[] = ["warp", "map", "kaleidoscope", "blur", "trails", "finish"];

/** The image inside a scene file: its original file bytes, as base64. */
export interface SceneImage {
  type: string;
  data: string;
}

/**
 * A .ksage file is JSON: every parameter (value, drift range, rate, phases),
 * the play state (groups, modes, speed, animation time) and the image.
 */
interface SceneFile {
  app: "KaleidoSage";
  version: number;
  params: Record<string, unknown>;
  state: Record<string, unknown>;
  image: SceneImage;
}

export function serializeScene(params: Params, state: PlayState, image: SceneImage): string {
  const savedParams: Record<string, unknown> = {};
  for (const key of PARAM_KEYS) {
    const { value, low, high, rate, on, phase1, phase2 } = params[key];
    savedParams[key] = { value, low, high, rate, on, phase1, phase2 };
  }
  const { groups, warpMode, mapMode, blurMode, trailMode, speed, time, warpTime } = state;
  const scene: SceneFile = {
    app: "KaleidoSage",
    version: SCENE_VERSION,
    params: savedParams,
    state: { groups: { ...groups }, warpMode, mapMode, blurMode, trailMode, speed, time, warpTime },
    image
  };
  return JSON.stringify(scene);
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/** A saved mode, if it is one of the allowed values. */
function mode<T extends number>(value: unknown, allowed: readonly T[]): T | undefined {
  return allowed.includes(value as T) ? value as T : undefined;
}

/**
 * Reads a scene file into params and state, and returns its image. Values
 * outside their limits are clamped, and unknown or broken entries are
 * skipped, so a file from a newer or older version still opens.
 */
export function applyScene(text: string, params: Params, state: PlayState): SceneImage {
  let scene: unknown;
  try {
    scene = JSON.parse(text);
  } catch {
    throw new Error("The file is not a Kaleido Sage scene.");
  }
  if (!isRecord(scene) || scene.app !== "KaleidoSage") throw new Error("The file is not a Kaleido Sage scene.");
  const image = scene.image;
  if (!isRecord(image) || typeof image.type !== "string" || !image.type.startsWith("image/") || typeof image.data !== "string" || !image.data) {
    throw new Error("The scene file has no image.");
  }

  const savedParams = isRecord(scene.params) ? scene.params : {};
  for (const key of PARAM_KEYS) {
    const saved = savedParams[key];
    if (!isRecord(saved)) continue;
    const param = params[key];
    if (isNumber(saved.value)) param.value = clamp(saved.value, param.min, param.max);
    if (param.drift) {
      if (isNumber(saved.low)) param.low = clamp(saved.low, param.min, param.max);
      if (isNumber(saved.high)) param.high = clamp(saved.high, param.min, param.max);
      if (isNumber(saved.rate)) param.rate = saved.rate;
      if (typeof saved.on === "boolean") param.on = saved.on;
    }
    if (isNumber(saved.phase1)) param.phase1 = saved.phase1;
    if (isNumber(saved.phase2)) param.phase2 = saved.phase2;
  }

  const saved = isRecord(scene.state) ? scene.state : {};
  if (isRecord(saved.groups)) {
    for (const key of GROUP_KEYS) if (typeof saved.groups[key] === "boolean") state.groups[key] = saved.groups[key] as boolean;
  }
  state.warpMode = mode(saved.warpMode, [1, 2] as const) ?? state.warpMode;
  state.mapMode = mode(saved.mapMode, [1, 2, 3, 4, 5] as const) ?? state.mapMode;
  state.blurMode = mode(saved.blurMode, [0, 1, 2] as const) ?? state.blurMode;
  state.trailMode = mode(saved.trailMode, [1, 2] as const) ?? state.trailMode;
  if (isNumber(saved.speed)) state.speed = clamp(saved.speed, 0, 4);
  if (isNumber(saved.time)) state.time = Math.max(0, saved.time);
  if (isNumber(saved.warpTime)) state.warpTime = Math.max(0, saved.warpTime);

  return { type: image.type, data: image.data };
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
