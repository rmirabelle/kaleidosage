/**
 * Spirograph (see docs/SPIROGRAPH.md): a wheel rolls inside a fixed ring
 * without slip, and a pen in a hole of the wheel draws a line. The wheel
 * can be a circle or another shape, and the hole can be at any place in
 * it. Each wheel of the list draws its own line in its own color.
 *
 * Sizes are in teeth, as on the toy: the ring has "ring" teeth around its
 * inner edge, and a wheel has "teeth" around its outer edge. A line closes
 * when the wheel has gone around ring / gcd(ring, teeth) times.
 *
 * Nothing is kept from frame to frame but a record of how each wheel rolls,
 * which the settings alone give. Places are in screen heights, with y up, as in
 * cycles.ts.
 */
import { INSTANCE_FLOATS } from "./cycles";

/** The shapes of a wheel, as numbers in scene files: Circle, Football, Egg, Triangle, Square, Cross. */
export type SpiroShape = 0 | 1 | 2 | 3 | 4 | 5;
export const SPIRO_SHAPE_VALUES = [0, 1, 2, 3, 4, 5] as const;

/** One wheel as the play state keeps it: its shape, its size in teeth and the line's color. Its hole is two sliders (see SPIRO_HOLE_KEYS in params.ts). */
export interface SpiroWheelSpec {
  shape: SpiroShape;
  teeth: number;
  /** "#rrggbb". */
  color: string;
}

/** One wheel for one frame: with the hole's place now. */
export interface SpiroWheel extends SpiroWheelSpec {
  /** The hole, from the wheel's center; 1 is the distance to the farthest point of the wheel's edge. */
  x: number;
  y: number;
}

export const MAX_SPIRO_WHEELS = 6;
export const MIN_SPIRO_TEETH = 8;
export const MAX_SPIRO_TEETH = 150;
export const MIN_SPIRO_RING = 48;
export const MAX_SPIRO_RING = 150;

/** The wheels of a new scene: two wheels of the toy (52 and 63 teeth) in its 96 ring. */
export function defaultSpiroWheels(): SpiroWheelSpec[] {
  return [
    { shape: 0, teeth: 52, color: "#ff3d7f" },
    { shape: 0, teeth: 63, color: "#2fb8ff" }
  ];
}

/** The wheel sizes of the toy, in teeth. */
const TOY_TEETH = [24, 30, 32, 36, 40, 42, 45, 48, 52, 56, 60, 63, 64, 72, 75, 80, 84];

/** One to three random wheels, for Randomize: toy sizes, mostly round, in bright colors. */
export function randomSpiroWheels(): SpiroWheelSpec[] {
  const wheels: SpiroWheelSpec[] = [];
  const count = 1 + Math.floor(Math.random() * 3);
  const firstHue = Math.random();
  for (let i = 0; i < count; i++) {
    const hue = (firstHue + i * (0.2 + Math.random() * 0.2)) % 1;
    /* A full color at "hue": the same red, green and blue as hsl(hue, 100%, 60%). */
    const part = (n: number) => {
      const k = (n + hue * 12) % 12;
      return Math.round((0.6 - 0.4 * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255).toString(16).padStart(2, "0");
    };
    wheels.push({
      shape: Math.random() < 0.5 ? 0 : (1 + Math.floor(Math.random() * 5)) as SpiroShape,
      teeth: TOY_TEETH[Math.floor(Math.random() * TOY_TEETH.length)],
      color: `#${part(0)}${part(8)}${part(4)}`
    });
  }
  return wheels;
}

/** The wheels of a scene file, or undefined when "saved" is not a list with a wheel that reads well. */
export function readSpiroWheels(saved: unknown): SpiroWheelSpec[] | undefined {
  if (!Array.isArray(saved)) return undefined;
  const wheels: SpiroWheelSpec[] = [];
  for (const item of saved) {
    if (typeof item !== "object" || item === null) continue;
    const { shape, teeth, color } = item as Record<string, unknown>;
    if (!SPIRO_SHAPE_VALUES.includes(shape as SpiroShape) || typeof teeth !== "number" || !Number.isFinite(teeth)) continue;
    if (typeof color !== "string" || !/^#[0-9a-f]{6}$/i.test(color)) continue;
    wheels.push({ shape: shape as SpiroShape, teeth: whole(teeth, MIN_SPIRO_TEETH, MAX_SPIRO_TEETH), color: color.toLowerCase() });
  }
  return wheels.length > 0 ? wheels.slice(0, MAX_SPIRO_WHEELS) : undefined;
}

const whole = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));

/** How many times the wheel goes around itself before its line closes. */
export function spiroTurns(ring: number, teeth: number): number {
  const n = whole(ring, MIN_SPIRO_RING, MAX_SPIRO_RING);
  return n / gcd(n, whole(teeth, MIN_SPIRO_TEETH, MAX_SPIRO_TEETH));
}

/** A part of a circle around (cx, cy), from angle "from" to angle "to", as "count" points; the last point is left out. */
function arc(points: number[], cx: number, cy: number, radius: number, from: number, to: number, count: number) {
  for (let i = 0; i < count; i++) {
    const angle = from + (to - from) * (i / count);
    points.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
}

/** A shape with "sides" equal sides and round corners of radius "corner"; "turn" turns it. */
function roundPolygon(sides: number, corner: number, turn: number): number[] {
  const points: number[] = [];
  const half = Math.PI / sides;
  for (let k = 0; k < sides; k++) {
    const angle = turn + k * half * 2;
    arc(points, Math.cos(angle) * (1 - corner), Math.sin(angle) * (1 - corner), corner, angle - half, angle + half, 12);
    points.push(Math.cos(angle) * (1 - corner) + Math.cos(angle + half) * corner, Math.sin(angle) * (1 - corner) + Math.sin(angle + half) * corner);
  }
  return points;
}

/**
 * The edge of a wheel as x, y pairs that go around to the left. The center
 * is at 0, 0 and the farthest point is 1 away. The Cross has inner corners.
 */
function makeOutline(shape: SpiroShape): number[] {
  const points: number[] = [];
  if (shape === 1) {
    /* Two arcs through the tips at -1 and 1; the middle is 0.55 high. */
    const height = 0.55;
    const radius = (1 + height * height) / (2 * height);
    const reach = Math.asin(1 / radius);
    arc(points, 0, height - radius, radius, Math.PI / 2 - reach, Math.PI / 2 + reach, 60);
    arc(points, 0, radius - height, radius, -Math.PI / 2 - reach, -Math.PI / 2 + reach, 60);
  } else if (shape === 2) {
    /* The wide end is at the left. */
    for (let i = 0; i < 120; i++) {
      const angle = (i / 120) * Math.PI * 2;
      points.push(Math.cos(angle), Math.sin(angle) * (0.7 - 0.14 * Math.cos(angle)));
    }
  } else if (shape === 3) {
    return roundPolygon(3, 0.3, Math.PI / 2);
  } else if (shape === 4) {
    return roundPolygon(4, 0.25, Math.PI / 4);
  } else if (shape === 5) {
    /* Four arms with round ends; "arm" is half the width of an arm. */
    const arm = 0.32;
    for (let k = 0; k < 4; k++) {
      const angle = k * Math.PI / 2;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const from = points.length;
      arc(points, 1 - arm, 0, arm, -Math.PI / 2, Math.PI / 2, 16);
      points.push(1 - arm, arm, arm, arm);
      for (let i = from; i < points.length; i += 2) {
        const x = points[i];
        const y = points[i + 1];
        points[i] = x * cos - y * sin;
        points[i + 1] = x * sin + y * cos;
      }
    }
  } else {
    arc(points, 0, 0, 1, 0, Math.PI * 2, 120);
  }
  return points;
}

/** The smallest shape with no inner corners around "points", to the left, from the same first point if it is on the edge. */
function hull(points: readonly number[]): number[] {
  const order: number[] = [];
  for (let i = 0; i < points.length / 2; i++) order.push(i);
  order.sort((a, b) => points[a * 2] - points[b * 2] || points[a * 2 + 1] - points[b * 2 + 1]);
  const cross = (o: number, a: number, b: number) => (points[a * 2] - points[o * 2]) * (points[b * 2 + 1] - points[o * 2 + 1]) - (points[a * 2 + 1] - points[o * 2 + 1]) * (points[b * 2] - points[o * 2]);
  const build = (list: number[]) => {
    const chain: number[] = [];
    for (const index of list) {
      while (chain.length >= 2 && cross(chain[chain.length - 2], chain[chain.length - 1], index) <= 1e-12) chain.pop();
      chain.push(index);
    }
    chain.pop();
    return chain;
  };
  const kept = [...build(order), ...build([...order].reverse())];
  /* Start at the point with the lowest number, so a shape that has no inner corners keeps its first point. */
  const first = kept.indexOf(Math.min(...kept));
  const out: number[] = [];
  for (let i = 0; i < kept.length; i++) {
    const index = kept[(first + i) % kept.length];
    out.push(points[index * 2], points[index * 2 + 1]);
  }
  return out;
}

const outlines = new Map<SpiroShape, Float32Array>();
const hulls = new Map<SpiroShape, Float32Array>();

/** The edge of a wheel, for a picture of it: x, y pairs to the left, the farthest point 1 from the center. */
export function spiroOutline(shape: SpiroShape): Float32Array {
  let outline = outlines.get(shape);
  if (!outline) {
    outline = new Float32Array(makeOutline(SPIRO_SHAPE_VALUES.includes(shape) ? shape : 0));
    outlines.set(shape, outline);
  }
  return outline;
}

/** The edge that rolls: the wheel's edge with its inner corners bridged, because they can not touch the ring. */
function rollingEdge(shape: SpiroShape): Float32Array {
  let edge = hulls.get(shape);
  if (!edge) {
    edge = new Float32Array(hull(Array.from(spiroOutline(shape))));
    hulls.set(shape, edge);
  }
  return edge;
}

/** Between two points of a line, the wheel turns by no more than this, and the contact point goes no farther around the ring. */
const MAX_TURN = 3 * Math.PI / 180;
/** The most points one line can have. */
const MAX_POINTS = 90000;

/** How many numbers each point of a rolling record has. */
const ROLL_FLOATS = 4;

/**
 * How a wheel rolls in a ring with "ring" teeth, with no hole yet: for each
 * point of the line, the place the wheel's center has (2 numbers), then the
 * wheel's turn there as a cosine and a sine, times the wheel's size (2
 * numbers). The ring's center is at 0, 0 and its radius is 1. A hole at
 * x, y in the wheel is at center + (x cos - y sin, x sin + y cos). The last
 * point is the first point again.
 *
 * The contact point goes the same distance along the wheel's edge and along
 * the ring, and the two edges have the same direction there. At a corner of
 * the wheel the wheel turns around the contact point.
 */
function makeRolling(shape: SpiroShape, wheelTeeth: number, ring: number): Float32Array {
  const ringTeeth = whole(ring, MIN_SPIRO_RING, MAX_SPIRO_RING);
  const teeth = whole(wheelTeeth, MIN_SPIRO_TEETH, MAX_SPIRO_TEETH);
  const edge = rollingEdge(shape);
  const corners = edge.length / 2;
  let around = 0;
  for (let i = 0; i < corners; i++) {
    const j = (i + 1) % corners;
    around += Math.hypot(edge[j * 2] - edge[i * 2], edge[j * 2 + 1] - edge[i * 2 + 1]);
  }
  /* Lengths are in ring radiuses from here: the ring is 2 pi around, and the wheel is teeth / ringTeeth of that. */
  const scale = (teeth / ringTeeth) * Math.PI * 2 / around;
  const turns = ringTeeth / gcd(ringTeeth, teeth);
  const out: number[] = [];
  /** A point of the record: the wheel's point (cx, cy) touches the ring at "distance" along it, and the wheel's edge has the direction "heading" there. */
  const add = (distance: number, cx: number, cy: number, heading: number) => {
    const turn = distance + Math.PI / 2 - heading;
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    out.push(Math.cos(distance) - (cx * cos - cy * sin), Math.sin(distance) - (cx * sin + cy * cos), cos * scale, sin * scale);
  };
  const last = corners - 1;
  let before = Math.atan2(edge[1] - edge[last * 2 + 1], edge[0] - edge[last * 2]);
  let distance = 0;
  for (let turn = 0; turn < turns && out.length < MAX_POINTS * ROLL_FLOATS; turn++) {
    for (let i = 0; i < corners; i++) {
      const j = (i + 1) % corners;
      const ax = edge[i * 2] * scale;
      const ay = edge[i * 2 + 1] * scale;
      const bx = edge[j * 2] * scale;
      const by = edge[j * 2 + 1] * scale;
      const heading = Math.atan2(by - ay, bx - ax);
      let bend = heading - before;
      bend -= Math.round(bend / (Math.PI * 2)) * Math.PI * 2;
      const pivots = Math.floor(Math.abs(bend) / MAX_TURN);
      for (let k = 1; k <= pivots; k++) add(distance, ax, ay, before + bend * (k / (pivots + 1)));
      const length = Math.hypot(bx - ax, by - ay);
      const parts = Math.max(1, Math.ceil(length / MAX_TURN));
      for (let k = 0; k < parts; k++) add(distance + length * (k / parts), ax + (bx - ax) * (k / parts), ay + (by - ay) * (k / parts), heading);
      distance += length;
      before = heading;
    }
  }
  out.push(out[0], out[1], out[2], out[3]);
  return new Float32Array(out);
}

const rollings = new Map<string, Float32Array>();
const MAX_KEPT = 24;

/**
 * makeRolling, kept from frame to frame while the wheel's shape and teeth
 * and the ring stay the same. The hole is not a part of it, so a hole that
 * moves costs no new record.
 */
function rolling(wheel: SpiroWheelSpec, ring: number): Float32Array {
  const key = [wheel.shape, wheel.teeth, ring].join("|");
  let kept = rollings.get(key);
  if (!kept) {
    if (rollings.size >= MAX_KEPT) rollings.clear();
    kept = makeRolling(wheel.shape, wheel.teeth, ring);
    rollings.set(key, kept);
  }
  return kept;
}

/** The line of one wheel in a ring with "ring" teeth, as x, y pairs. The ring's center is at 0, 0 and its radius is 1. The last point is the first point again. */
export function spiroLine(wheel: SpiroWheel, ring: number): Float32Array {
  const roll = rolling(wheel, Math.round(ring));
  const line = new Float32Array(roll.length / ROLL_FLOATS * 2);
  for (let point = 0; point < line.length / 2; point++) {
    const o = point * ROLL_FLOATS;
    line[point * 2] = roll[o] + wheel.x * roll[o + 2] - wheel.y * roll[o + 3];
    line[point * 2 + 1] = roll[o + 1] + wheel.x * roll[o + 3] + wheel.y * roll[o + 2];
  }
  return line;
}

/** The settings for one frame, as the renderer gets them. */
export interface SpiroSettings {
  wheels: readonly SpiroWheel[];
  /** The ring's teeth. */
  ring: number;
  /** The ring's radius, in screen heights. */
  size: number;
  /** The line width, in screen heights. */
  width: number;
  /** How much of each line shows, from its start: 0 none, 1 all. */
  draw: number;
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

/** The most lines the settings can ask for. */
export function spiroSegments(wheels: readonly SpiroWheelSpec[], ring: number): number {
  let count = 0;
  for (const wheel of wheels.slice(0, MAX_SPIRO_WHEELS)) count += rolling(wheel, Math.round(ring)).length / ROLL_FLOATS - 1;
  return count;
}

/** The eye is this many screen heights in front of the screen, as for Light Paths. A point nearer to the eye than NEAR is not drawn. */
const EYE = 3;
const NEAR = 0.05;

/** The red, green and blue of "#rrggbb", each 0 to 1; white for a color that does not read. */
function colorOf(hex: string): [number, number, number] {
  const value = /^#[0-9a-f]{6}$/i.test(hex) ? parseInt(hex.slice(1), 16) : 0xffffff;
  return [(value >> 16) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

/**
 * Writes the lines into "out" as line instances (see CYCLE_VERTEX_SHADER:
 * INSTANCE_FLOATS each), and returns how many there are; the ones past
 * "max" are left out.
 */
export function writeSpiroInstances(out: Float32Array, max: number, s: SpiroSettings): number {
  const radius = s.width / 2;
  const cosTurn = Math.cos(s.rotation);
  const sinTurn = Math.sin(s.rotation);
  const cosYaw = Math.cos(s.yaw);
  const sinYaw = Math.sin(s.yaw);
  const cosTilt = Math.cos(s.tilt);
  const sinTilt = Math.sin(s.tilt);
  const size = Math.max(0, s.size);
  const draw = Math.min(1, Math.max(0, s.draw));
  let count = 0;
  for (const wheel of s.wheels.slice(0, MAX_SPIRO_WHEELS)) {
    const roll = rolling(wheel, Math.round(s.ring));
    const holeX = Number.isFinite(wheel.x) ? wheel.x : 0;
    const holeY = Number.isFinite(wheel.y) ? wheel.y : 0;
    const visible = (roll.length / ROLL_FLOATS - 1) * draw;
    const shown = Math.ceil(visible);
    if (shown === 0) continue;
    /* Draw stops part of the way along the last line that shows. */
    const part = visible - (shown - 1);
    const [red, green, blue] = colorOf(wheel.color);
    let fromX = NaN;
    let fromY = NaN;
    let beforeX = 0;
    let beforeY = 0;
    for (let point = 0; point <= shown; point++) {
      const at = point * ROLL_FLOATS;
      const wholeX = roll[at] + holeX * roll[at + 2] - holeY * roll[at + 3];
      const wholeY = roll[at + 1] + holeX * roll[at + 3] + holeY * roll[at + 2];
      let x = wholeX;
      let y = wholeY;
      if (point === shown && part < 1) {
        x = beforeX + (x - beforeX) * part;
        y = beforeY + (y - beforeY) * part;
      }
      beforeX = wholeX;
      beforeY = wholeY;
      const flatX = (x * cosTurn - y * sinTurn) * size;
      const flatY = (x * sinTurn + y * cosTurn) * size;
      const turnedX = flatX * cosYaw;
      const turnedZ = -flatX * sinYaw;
      const leanedY = flatY * cosTilt - turnedZ * sinTilt;
      const distance = EYE - (flatY * sinTilt + turnedZ * cosTilt);
      const scale = distance < NEAR ? NaN : EYE / distance;
      const toX = s.x + turnedX * scale;
      const toY = s.y + leanedY * scale;
      if (point > 0 && !Number.isNaN(fromX) && !Number.isNaN(toX)) {
        if (count >= max) return count;
        const o = count++ * INSTANCE_FLOATS;
        out[o] = fromX; out[o + 1] = fromY; out[o + 2] = toX; out[o + 3] = toY;
        out[o + 4] = red; out[o + 5] = green; out[o + 6] = blue; out[o + 7] = 1;
        out[o + 8] = red; out[o + 9] = green; out[o + 10] = blue; out[o + 11] = 1;
        out[o + 12] = radius; out[o + 13] = 0; out[o + 14] = 0; out[o + 15] = 0;
      }
      fromX = toX;
      fromY = toY;
    }
  }
  return count;
}
