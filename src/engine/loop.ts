import { GROUP_PARAMS, PARAM_KEYS, REFERENCE_CYCLE, WANDER, easeOf, isCustom, liveValue, type Param, type ParamKey, type Params, type PlayState } from "./params";
import type { WarpType } from "./renderer";

/**
 * Loop math for video export. Every range on the shared cycle goes from its
 * start handle to its end handle in one cycle and back in the next, so the
 * picture repeats after two cycles (after one when only full turns move).
 * Four things do not follow the cycle: ranges with their own time, the warp
 * flow, the tunnel travel and the camera flight. A seamless video changes
 * the first two slightly so they repeat too; the tunnel, the camera, the
 * noise and cell warps, and the random and drunk curves never repeat, so
 * their video crossfades its last moment into its first.
 */

/**
 * The warp time after which each kind of warp looks the same again (see
 * warpOffset in shaders.ts): ripple sin(4t), waves sin(4t) and sin(3t),
 * swirl t / 2 around a circle, bulge cos(2t). Noise and cells never repeat
 * in practice.
 */
const WARP_PERIODS: Record<WarpType, number | null> = {
  0: null,
  1: Math.PI / 2,
  2: Math.PI * 2,
  3: Math.PI * 4,
  4: Math.PI,
  5: null
};

const handles = (param: Param) => [param.low ?? param.min, param.high ?? param.max];

/** True when the parameter has a range that is on and moves. */
const moving = (param: Param) => {
  const [low, high] = handles(param);
  return Boolean(param.drift && param.on && low !== high);
};

/** A whole circle turns once per trip and never comes back, so it repeats after one trip, not two. */
const fullTurn = (param: Param) => {
  const [low, high] = handles(param);
  return param.drift === "spin" && Math.min(low, high) <= param.min && Math.max(low, high) >= param.max;
};

/** True when the value is ever not 0. */
const everNonZero = (param: Param) => {
  if (!param.drift || !param.on) return param.value !== 0;
  const [low, high] = handles(param);
  return low !== 0 || high !== 0;
};

/** False for a parameter of an effect that is off: its range moves nothing that shows. */
const inUse = (key: ParamKey, state: PlayState) =>
  !Object.entries(GROUP_PARAMS).some(([group, keys]) => keys.includes(key) && !state.groups[group as keyof PlayState["groups"]]);

/** Real seconds after which every range on the shared cycle that shows is back where it started. */
export function baseLoopSeconds(params: Params, state: PlayState) {
  const cycle = params.cycle.value;
  const there = PARAM_KEYS.some((key) => {
    const param = params[key];
    return inUse(key, state) && moving(param) && !isCustom(param) && !fullTurn(param);
  });
  return there ? cycle * 2 : cycle;
}

/**
 * How far the play is into the scene's Length (one cycle), from 0 to 1. It
 * is the Length only: a range that needs two cycles to come back, or one
 * with its own time, does not make it longer. On animation time each cycle
 * is REFERENCE_CYCLE seconds long, so a change to the Length keeps the place.
 */
export function scenePosition(state: PlayState) {
  return (((state.time % REFERENCE_CYCLE) + REFERENCE_CYCLE) % REFERENCE_CYCLE) / REFERENCE_CYCLE;
}

/**
 * The time each moving range with its own time gets in the video: the
 * nearest time that repeats a whole number of times (at least once) in
 * "videoSeconds".
 */
export function fittedCustomSeconds(params: Params, videoSeconds: number) {
  const fitted: Partial<Record<ParamKey, number>> = {};
  for (const key of PARAM_KEYS) {
    const param = params[key];
    if (!moving(param) || !isCustom(param)) continue;
    const trips = fullTurn(param) ? 1 : 2;
    const repeats = Math.max(1, Math.round(videoSeconds / (param.seconds! * trips)));
    fitted[key] = videoSeconds / (repeats * trips);
  }
  return fitted;
}

/** True when something moves on and never comes back: a range on a random or drunk curve, a noise or cell warp that flows, a tunnel that flies, or a camera that flies. */
export function needsSeamFade(params: Params, state: PlayState) {
  const wandering = PARAM_KEYS.some((key) => inUse(key, state) && moving(params[key]) && WANDER.has(easeOf(params[key])));
  const warp = state.groups.warp && WARP_PERIODS[state.warpType] === null && everNonZero(params.warpFlow);
  const tunnel = state.groups.map && state.mapMode === 6 && everNonZero(params.mapSpeed);
  const camera = state.groups.camera && everNonZero(params.cameraSpeed);
  return wandering || warp || tunnel || camera;
}

/**
 * The extra warp flow (see Engine.warpFlowOffset) that makes the warp time
 * grow by a whole number of its repeats over "frames" steps, from "start"
 * (the time of the first video frame). Each step moves animation time by
 * "animatedStep" and real time by "realStep", as Engine.step does. 0 when
 * the warp is off or never repeats.
 */
export function warpFlowCorrection(params: Params, start: PlayState, frames: number, animatedStep: number, realStep: number) {
  const period = WARP_PERIODS[start.warpType];
  if (!period || !start.groups.warp || frames < 1 || animatedStep <= 0) return 0;
  const probe = { ...start };
  let travel = 0;
  for (let index = 1; index <= frames; index++) {
    probe.time = start.time + index * animatedStep;
    probe.clock = start.clock + index * realStep;
    travel += animatedStep * liveValue(params.warpFlow, probe);
  }
  const target = Math.round(travel / period) * period;
  return (target - travel) / (frames * animatedStep);
}

/**
 * The animation time after which the trails no longer remember a picture:
 * less than 1/2000 of it is left. Each frame keeps the trail amount to the
 * power of 60 x the animation time that passed (see drawTrails), so the
 * longest trail amount sets the time.
 */
export function trailSettleTime(params: Params) {
  const param = params.trailAmount;
  const amount = param.drift && param.on ? Math.max(...handles(param)) : param.value;
  if (amount <= 0) return 0;
  if (amount >= 1) return Infinity;
  return Math.log(2000) / (-Math.log(amount) * 60);
}
