/**
 * Light Paths (see docs/PATHS.md): lines go out from one point in all
 * directions. Every arm follows the same path, a repeating list of moves,
 * turned around the center. Nothing is kept from frame to frame: the
 * settings alone give the lines, so every slider changes the whole pattern
 * at once and a video export draws the same frames each time.
 *
 * Places are in screen heights, with y up, as in cycles.ts.
 */
import { INSTANCE_FLOATS } from "./cycles";

/** The paths of the Path menu, as numbers in scene files. */
export type PathShape = 0 | 1 | 2 | 3 | 4 | 5;

/** One move: go this many Step lengths, then turn by this many Turn angles (plus is to the left). */
type Move = readonly [length: number, turn: number];

interface PathPlan {
  /** The direction of the first move, in Turn angles from straight out. */
  start: number;
  moves: readonly Move[];
  /** Each step is longer than the first by this part of its length, times the step's number. */
  grow: number;
}

/** The Circuit path: a list of straight runs and small turns that never goes backward and ends in the direction it started. */
function circuitMoves(): Move[] {
  let seed = 0x5eed;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const moves: Move[] = [];
  let heading = 0;
  for (let i = 0; i < 47; i++) {
    const turns = [-1, 0, 1].filter((turn) => Math.abs(heading + turn) <= 1);
    const turn = turns[Math.floor(random() * turns.length)];
    moves.push([1 + Math.floor(random() * 3), turn]);
    heading += turn;
  }
  moves.push([2, -heading]);
  return moves;
}

const PLANS: Record<PathShape, PathPlan> = {
  /* Left and right in turn. It starts half a turn to the right, so the arm goes straight out on average. */
  0: { start: -0.5, moves: [[1, 1], [1, -1]], grow: 0 },
  /* Forward, left, forward, right, forward, right, forward, left: at 90° a square wave. */
  1: { start: 0, moves: [[1, 1], [1, -1], [1, -1], [1, 1]], grow: 0 },
  /* At 90° the Greek key: a spiral in to the right, a spiral out to the left, and 6 lengths forward each time. */
  2: { start: 1, moves: [[4, -1], [4, -1], [3, -1], [2, -1], [1, -1], [1, 1], [1, 1], [2, 1], [3, 1], [5, 1]], grow: 0 },
  /* Always left, each step longer. */
  3: { start: 0, moves: [[1, 1]], grow: 0.25 },
  /* Always left, lengths 1, 2 and 3. At most angles the arm closes on itself as a small flower. */
  4: { start: 0, moves: [[1, 1], [2, 1], [3, 1]], grow: 0 },
  5: { start: 0, moves: circuitMoves(), grow: 0 }
};

/** The settings for one frame, as the renderer gets them. */
export interface PathSettings {
  shape: PathShape;
  arms: number;
  /** How many moves each arm has. */
  steps: number;
  /** One Step length, in screen heights. */
  step: number;
  /** The Turn angle, in radians. */
  turn: number;
  /** How far from the center each arm starts, in screen heights. */
  radius: number;
  /** The line width, in screen heights. */
  width: number;
  /** How much of each arm shows, from the center: 0 none, 1 all. */
  draw: number;
  /** 0: the same brightness along the arm. 1: nothing at its far end. */
  fade: number;
  /** The color at the center, 0 to 1 around the color wheel. */
  hue: number;
  /** How many times around the color wheel the color goes along the arm. */
  rainbow: number;
  /** The turn of the whole pattern on the screen, in radians. */
  rotation: number;
  /** Turn: the whole pattern turns around its upright line, in radians. */
  yaw: number;
  /** Tilt: then the pattern leans around its level line, in radians. */
  tilt: number;
  /** The center, in screen heights. */
  x: number;
  y: number;
}

/** The most arms and steps: the two sliders' tops (see SPECS in params.ts). */
export const MAX_PATH_ARMS = 180;
export const MAX_PATH_STEPS = 512;

/** The most lines the settings can ask for: arms times steps, each of them at least 1. */
export function pathSegments(arms: number, steps: number): number {
  return wholeIn(arms, MAX_PATH_ARMS) * wholeIn(steps, MAX_PATH_STEPS);
}

const wholeIn = (value: number, max: number) => Math.min(max, Math.max(1, Math.round(value)));
const POINT_FLOATS = 6;
const points = new Float32Array((MAX_PATH_STEPS + 1) * POINT_FLOATS);
/** One arm's points as the screen shows them. A point too near the eye has NaN. */
const shownX = new Float32Array(MAX_PATH_STEPS + 1);
const shownY = new Float32Array(MAX_PATH_STEPS + 1);
/** The eye is this many screen heights in front of the screen, as for the 3D Object. A point nearer to the eye than NEAR is not drawn. */
const EYE = 3;
const NEAR = 0.05;

/** The red, green or blue of a full color at "hue" (0 to 1); "n" is 5 for red, 3 for green, 1 for blue. */
function channel(hue: number, n: number): number {
  const k = (n + hue * 6) % 6;
  return 1 - Math.max(0, Math.min(k, 4 - k, 1));
}

/**
 * Walks one arm, along +x from the center before it is turned, and keeps
 * each point's place, color and opacity in "points". Returns the number of
 * points.
 */
function walk(s: PathSettings, steps: number): number {
  const plan = PLANS[s.shape] ?? PLANS[0];
  let x = Math.max(0, s.radius);
  let y = 0;
  let heading = plan.start * s.turn;
  const stride = Math.max(0, s.step);
  const write = (index: number) => {
    const t = index / steps;
    const hue = s.hue + s.rainbow * t;
    const wrapped = hue - Math.floor(hue);
    const o = index * POINT_FLOATS;
    points[o] = x;
    points[o + 1] = y;
    points[o + 2] = channel(wrapped, 5);
    points[o + 3] = channel(wrapped, 3);
    points[o + 4] = channel(wrapped, 1);
    points[o + 5] = 1 - Math.min(1, Math.max(0, s.fade)) * t;
  };
  write(0);
  const moves = plan.moves;
  for (let i = 0; i < steps; i++) {
    const [length, turn] = moves[i % moves.length];
    const distance = length * stride * (1 + plan.grow * i);
    x += Math.cos(heading) * distance;
    y += Math.sin(heading) * distance;
    heading += turn * s.turn;
    write(i + 1);
  }
  return steps + 1;
}

/**
 * Writes the lines into "out" as line instances (see CYCLE_VERTEX_SHADER:
 * INSTANCE_FLOATS each), and returns how many there are; the ones past
 * "max" are left out.
 */
export function writePathInstances(out: Float32Array, max: number, s: PathSettings): number {
  const arms = wholeIn(s.arms, MAX_PATH_ARMS);
  const steps = wholeIn(s.steps, MAX_PATH_STEPS);
  const visible = steps * Math.min(1, Math.max(0, s.draw));
  const lines = Math.ceil(visible);
  if (lines === 0) return 0;
  walk(s, steps);
  /* Draw stops part of the way along the last line that shows. */
  const part = visible - (lines - 1);
  const from = (lines - 1) * POINT_FLOATS;
  const end = lines * POINT_FLOATS;
  for (let i = 0; i < POINT_FLOATS; i++) points[end + i] = points[from + i] + (points[end + i] - points[from + i]) * part;

  const radius = s.width / 2;
  const cosYaw = Math.cos(s.yaw);
  const sinYaw = Math.sin(s.yaw);
  const cosTilt = Math.cos(s.tilt);
  const sinTilt = Math.sin(s.tilt);
  let count = 0;
  for (let arm = 0; arm < arms; arm++) {
    const angle = s.rotation + (arm / arms) * Math.PI * 2;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let point = 0; point <= lines; point++) {
      const o = point * POINT_FLOATS;
      const flatX = points[o] * cos - points[o + 1] * sin;
      const flatY = points[o] * sin + points[o + 1] * cos;
      const turnedX = flatX * cosYaw;
      const turnedZ = -flatX * sinYaw;
      const leanedY = flatY * cosTilt - turnedZ * sinTilt;
      const distance = EYE - (flatY * sinTilt + turnedZ * cosTilt);
      const scale = distance < NEAR ? NaN : EYE / distance;
      shownX[point] = s.x + turnedX * scale;
      shownY[point] = s.y + leanedY * scale;
    }
    for (let line = 0; line < lines; line++) {
      if (Number.isNaN(shownX[line]) || Number.isNaN(shownX[line + 1])) continue;
      if (count >= max) return count;
      const a = line * POINT_FLOATS;
      const b = a + POINT_FLOATS;
      const o = count++ * INSTANCE_FLOATS;
      out[o] = shownX[line];
      out[o + 1] = shownY[line];
      out[o + 2] = shownX[line + 1];
      out[o + 3] = shownY[line + 1];
      out[o + 4] = points[a + 2]; out[o + 5] = points[a + 3]; out[o + 6] = points[a + 4]; out[o + 7] = points[a + 5];
      out[o + 8] = points[b + 2]; out[o + 9] = points[b + 3]; out[o + 10] = points[b + 4]; out[o + 11] = points[b + 5];
      out[o + 12] = radius; out[o + 13] = 0; out[o + 14] = 0; out[o + 15] = 0;
    }
  }
  return count;
}
