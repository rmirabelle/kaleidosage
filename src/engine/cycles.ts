/**
 * Light Cycles (see docs/CYCLES.md): cycles drive over the picture and leave
 * lines. A cycle that drives into a line, its own or another's, crashes: its
 * line goes away in a short fade, and a new cycle starts. The lines are
 * vectors (lists of points); the renderer draws them (see writeInstances).
 *
 * Places are in screen heights, with y up: the screen is x from 0 to the
 * aspect (width over height), y from 0 to 1, as in the GPU's textures.
 */

/** The settings for one step, as the renderer gets them (see FrameValues). */
export interface CycleSettings {
  /** 0 grid: straight lanes and right-angle turns. 1 free: curves at any angle. */
  move: 0 | 1;
  count: number;
  /** Screen heights per second. */
  speed: number;
  /** The line width, in screen heights. */
  width: number;
  /** The seconds a line takes to fade behind its cycle. Infinity: it stays until the cycle crashes. */
  length: number;
  /** Random turns per second (grid), or changes of the curve per second (free). */
  turns: number;
  /** 0 to 1: how strongly the cycles turn toward bright parts of the picture. */
  follow: number;
  /** 0 to 1: the chance that a cycle sees a line ahead and turns away from it. */
  dodge: number;
  /** How far past each screen edge a cycle can drive before it dies, as a part of the screen size (0 to MAX_BOUNDS). */
  bounds: number;
  /** Grid mode: the space between the lanes, in screen heights. */
  grid: number;
}

/** A small copy of the picture: RGBA bytes, bottom row first. */
export interface Picture {
  width: number;
  height: number;
  data: Uint8Array;
}

/** The most cycles at one time. */
export const MAX_CYCLES = 2000;
/** The largest Out of Bounds space; the crash grid always covers it, so a change of Out of Bounds starts nothing again. */
export const MAX_BOUNDS = 1;
/** The crash grid's cell, in screen heights (about 2.7 pixels at 1080p), and the most cells the grid may have. */
const CELL = 1 / 400;
const MAX_GRID_CELLS = 6_000_000;
/** A crashed cycle's line fades away in this many seconds. */
const CLEAR_SECONDS = 0.25;
/** A line gets a point at least this often (screen heights), so its color and its fade follow it. */
const POINT_SPACING = 0.02;
/** Free mode: a point when the direction has changed this much (radians) since the last one. */
const POINT_TURN = 0.06;
/** How far ahead a cycle looks for a line to dodge, and for bright parts to follow (screen heights). */
const LOOK = 0.04;
/** One point of a line: x, y, time, red, green, blue (0 to 1). */
const POINT = 6;
/** One instance for the renderer: start x, y, end x, y, start color and alpha, end color and alpha, radius, and 1 for a soft head dot. */
export const INSTANCE_FLOATS = 14;

const QUARTER = Math.PI / 2;

class Line {
  /** Points, oldest first from "first" (a multiple of POINT). The cycle's head is the line's last end, and is not stored. */
  points: number[] = [];
  first = 0;
  /** The grid cells the line covers, in the order they were marked first, from "firstCell". */
  cells: number[] = [];
  firstCell = 0;
  /** The time of the crash, or -1 while the line's cycle still drives. */
  ended = -1;
  constructor(readonly id: number) {}
}

interface Cycle {
  x: number;
  y: number;
  /** The direction in radians. In grid mode it is a whole number of quarter turns. */
  angle: number;
  line: Line;
  /** The color of the picture under the head. */
  color: [number, number, number];
  /** Free mode: how fast the cycle turns now (radians per second). */
  spin: number;
  /** The distance since the line's last point, and the direction at that point. */
  sincePoint: number;
  pointAngle: number;
  /** The grid cell under the head. */
  cell: number;
  /** Dodge: whether the cycle sees the line ahead of it (decided once per line it meets), or null when nothing is ahead. */
  sees: boolean | null;
}

const luma = (r: number, g: number, b: number) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

export class CycleSim {
  /** Seconds of play; the fades use it, so the lines do not fade while paused. */
  time = 0;
  readonly cycles: Cycle[] = [];
  /** The lines whose cycles crashed, while they fade away. */
  private readonly ended: Line[] = [];
  private nextId = 1;
  private aspect = 0;
  /** The crash grid: the id of the line that covers each cell (0: none), and when it was marked. */
  private owner = new Uint32Array(0);
  private marked = new Float32Array(0);
  private columns = 0;
  private rows = 0;
  private cell = CELL;
  private originX = 0;
  private originY = 0;
  private picture: Picture | null = null;

  constructor(private readonly random: () => number = Math.random) {}

  /** Takes every cycle and line away. The next step starts new cycles. */
  reset() {
    this.cycles.length = 0;
    this.ended.length = 0;
    this.owner.fill(0);
    this.time = 0;
  }

  /** Moves the cycles "dt" seconds on. A new screen shape starts everything again. */
  step(dt: number, s: CycleSettings, aspect: number, picture: Picture | null) {
    if (aspect !== this.aspect) this.resize(aspect);
    this.picture = picture;
    if (!(dt > 0)) return;
    this.time += dt;
    this.fade(s.length);
    const count = Math.max(0, Math.min(MAX_CYCLES, Math.round(s.count)));
    while (this.cycles.length > count) this.end(this.cycles.pop()!.line);
    for (let tries = 0; this.cycles.length < count && tries < count * 2; tries++) {
      const cycle = this.spawn(s);
      if (cycle) this.cycles.push(cycle);
    }
    for (let index = this.cycles.length - 1; index >= 0; index--) {
      const cycle = this.cycles[index];
      if (this.drive(cycle, dt, s)) continue;
      this.end(cycle.line);
      const fresh = this.spawn(s);
      if (fresh) this.cycles[index] = fresh;
      else this.cycles.splice(index, 1);
    }
  }

  /** Starts a cycle at a place and direction (or null when the place is taken). Tests use it; spawn picks random ones. */
  start(x: number, y: number, angle: number, s: CycleSettings): Cycle | null {
    const radius = this.radiusCells(s);
    const center = this.cellAt(x, y);
    if (center < 0 || !this.discFree(center, radius + 2)) return null;
    const line = new Line(this.nextId++);
    const cycle: Cycle = { x, y, angle, line, color: this.colorAt(x, y), spin: 0, sincePoint: 0, pointAngle: angle, cell: center, sees: null };
    this.addPoint(cycle);
    this.mark(center, -1, radius, line);
    return cycle;
  }

  /** The id of the line that covers the place, or 0. */
  lineAt(x: number, y: number) {
    const cell = this.cellAt(x, y);
    return cell < 0 ? 0 : this.owner[cell];
  }

  /**
   * Writes the lines and the heads as instances for the renderer (see
   * INSTANCE_FLOATS) and returns how many there are; the ones past "max"
   * are left out. "head" (0 to 1) makes the heads bigger and brighter.
   */
  writeInstances(out: Float32Array, max: number, s: CycleSettings, head: number): number {
    let count = 0;
    const radius = s.width / 2;
    /** One instance from the color at a[ia] to the color at b[ib] (red, green, blue). */
    const write = (ax: number, ay: number, a: ArrayLike<number>, ia: number, aAlpha: number, bx: number, by: number, b: ArrayLike<number>, ib: number, bAlpha: number, r: number, soft: number) => {
      if (count >= max) return;
      const o = count++ * INSTANCE_FLOATS;
      out[o] = ax; out[o + 1] = ay; out[o + 2] = bx; out[o + 3] = by;
      out[o + 4] = a[ia]; out[o + 5] = a[ia + 1]; out[o + 6] = a[ia + 2]; out[o + 7] = aAlpha;
      out[o + 8] = b[ib]; out[o + 9] = b[ib + 1]; out[o + 10] = b[ib + 2]; out[o + 11] = bAlpha;
      out[o + 12] = r; out[o + 13] = soft;
    };
    const finite = Number.isFinite(s.length);
    const length = Math.max(s.length, 1e-3);
    const drawLine = (line: Line, cycle: Cycle | null) => {
      const clear = line.ended < 0 ? 1 : Math.max(0, 1 - (this.time - line.ended) / CLEAR_SECONDS);
      const alphaAt = (time: number) => clear * (finite ? Math.max(0, 1 - (this.time - time) / length) : 1);
      const p = line.points;
      for (let i = line.first; i + POINT < p.length; i += POINT) {
        const j = i + POINT;
        write(p[i], p[i + 1], p, i + 3, alphaAt(p[i + 2]), p[j], p[j + 1], p, j + 3, alphaAt(p[j + 2]), radius, 0);
      }
      const last = p.length - POINT;
      if (cycle && last >= line.first) write(p[last], p[last + 1], p, last + 3, alphaAt(p[last + 2]), cycle.x, cycle.y, cycle.color, 0, alphaAt(this.time), radius, 0);
    };
    for (const cycle of this.cycles) drawLine(cycle.line, cycle);
    for (const line of this.ended) drawLine(line, null);
    if (head > 0) {
      const bright = (value: number) => Math.min(1, value * (1 + 2 * head) + 0.5 * head);
      const alpha = Math.min(1, 0.5 + head);
      const size = radius * (1.5 + 3 * head) + 0.002;
      const color = [0, 0, 0];
      for (const cycle of this.cycles) {
        for (let k = 0; k < 3; k++) color[k] = bright(cycle.color[k]);
        write(cycle.x, cycle.y, color, 0, alpha, cycle.x, cycle.y, color, 0, alpha, size, 1);
      }
    }
    return count;
  }

  private resize(aspect: number) {
    this.aspect = aspect;
    const width = aspect * (1 + 2 * MAX_BOUNDS);
    const height = 1 + 2 * MAX_BOUNDS;
    this.cell = Math.max(CELL, Math.sqrt(width * height / MAX_GRID_CELLS));
    this.columns = Math.ceil(width / this.cell);
    this.rows = Math.ceil(height / this.cell);
    this.originX = -aspect * MAX_BOUNDS;
    this.originY = -MAX_BOUNDS;
    this.owner = new Uint32Array(this.columns * this.rows);
    this.marked = new Float32Array(this.columns * this.rows);
    this.reset();
  }

  /** The line's half width in whole cells (0: one cell). */
  private radiusCells(s: CycleSettings) {
    return Math.max(0, Math.round(s.width / 2 / this.cell - 0.25));
  }

  private cellAt(x: number, y: number) {
    const column = Math.floor((x - this.originX) / this.cell);
    const row = Math.floor((y - this.originY) / this.cell);
    if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return -1;
    return row * this.columns + column;
  }

  private colorAt(x: number, y: number): [number, number, number] {
    const picture = this.picture;
    if (!picture) return [0.8, 0.8, 0.8];
    const column = Math.min(picture.width - 1, Math.max(0, Math.floor(x / this.aspect * picture.width)));
    const row = Math.min(picture.height - 1, Math.max(0, Math.floor(y * picture.height)));
    const o = (row * picture.width + column) * 4;
    return [picture.data[o] / 255, picture.data[o + 1] / 255, picture.data[o + 2] / 255];
  }

  /** The picture's brightness at a place; past the screen's edges it is dark. */
  private brightness(x: number, y: number) {
    if (!this.picture || x < 0 || y < 0 || x > this.aspect || y > 1) return 0;
    return luma(...this.colorAt(x, y));
  }

  private inBounds(x: number, y: number, bounds: number) {
    const b = Math.min(MAX_BOUNDS, Math.max(0, bounds));
    return x >= -b * this.aspect && x <= this.aspect * (1 + b) && y >= -b && y <= 1 + b;
  }

  /** True when no line covers the cells within "radius" cells of the cell. */
  private discFree(center: number, radius: number) {
    const column = center % this.columns;
    const row = (center - column) / this.columns;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + radius) continue;
        const c = column + dx;
        const r = row + dy;
        if (c < 0 || r < 0 || c >= this.columns || r >= this.rows) return false;
        if (this.owner[r * this.columns + c] !== 0) return false;
      }
    }
    return true;
  }

  /**
   * Marks the cells within "radius" cells of the cell as the line's. A step
   * from "previous" to a cell on a diagonal also marks a corner cell between
   * them, so a line has no diagonal gap that another cycle could pass through.
   */
  private mark(center: number, previous: number, radius: number, line: Line) {
    const column = center % this.columns;
    const row = (center - column) / this.columns;
    if (previous >= 0) this.markCell(this.corner(center, previous), line);
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        if (dx * dx + dy * dy > radius * radius + radius) continue;
        const c = column + dx;
        const r = row + dy;
        if (c >= 0 && r >= 0 && c < this.columns && r < this.rows) this.markCell(r * this.columns + c, line);
      }
    }
  }

  /**
   * For a step on a diagonal, the corner cell between the two cells (in the
   * row of "cell" and the column of "previous"); otherwise "cell" itself.
   */
  private corner(cell: number, previous: number) {
    if (previous < 0) return cell;
    const column = cell % this.columns;
    const previousColumn = previous % this.columns;
    if (previousColumn === column || previous - previousColumn === cell - column) return cell;
    return cell - column + previousColumn;
  }

  private markCell(cell: number, line: Line) {
    const owner = this.owner[cell];
    if (owner === 0) {
      this.owner[cell] = line.id;
      line.cells.push(cell);
    } else if (owner !== line.id) return;
    this.marked[cell] = this.time;
  }

  /**
   * True when the cell is free for the cycle: no line covers it, or only the
   * cycle's own line, marked so recently that it is the part just behind the
   * head (the cycle is still in it).
   */
  private open(cell: number, line: Line, grace: number) {
    if (cell < 0) return false;
    const owner = this.owner[cell];
    return owner === 0 || (owner === line.id && this.marked[cell] >= this.time - grace);
  }

  /** True when a line (or the edge of the grid) is within "distance" ahead of the cycle at "angle". */
  private blocked(cycle: Cycle, angle: number, distance: number, s: CycleSettings) {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const start = (this.radiusCells(s) + 1) * this.cell;
    const grace = this.grace(s);
    for (let along = start; along <= start + distance; along += this.cell * 0.5) {
      const x = cycle.x + dx * along;
      const y = cycle.y + dy * along;
      if (!this.inBounds(x, y, s.bounds) || !this.open(this.cellAt(x, y), cycle.line, grace)) return true;
    }
    return false;
  }

  /** How long a cycle's own cells count as the part just behind its head. */
  private grace(s: CycleSettings) {
    return (2 * this.radiusCells(s) + 3) * this.cell / Math.max(s.speed, 1e-4);
  }

  /** Adds a point at the head, with the head's color. */
  private addPoint(cycle: Cycle) {
    cycle.line.points.push(cycle.x, cycle.y, this.time, ...cycle.color);
    cycle.sincePoint = 0;
    cycle.pointAngle = cycle.angle;
  }

  /** A new cycle at a free random place on the screen, or null when none is found. */
  private spawn(s: CycleSettings): Cycle | null {
    for (let attempt = 0; attempt < 12; attempt++) {
      let x = this.random() * this.aspect;
      let y = this.random();
      let angle = this.random() * Math.PI * 2;
      if (s.move === 0) {
        const lane = Math.max(s.grid, this.cell);
        x = Math.min(this.aspect, Math.round(x / lane) * lane);
        y = Math.min(1, Math.round(y / lane) * lane);
        angle = Math.floor(this.random() * 4) * QUARTER;
      }
      const cycle = this.start(x, y, angle, s);
      if (cycle) return cycle;
    }
    return null;
  }

  /** Ends a line: its cells are free at once, and it fades away. */
  private end(line: Line) {
    for (let index = line.firstCell; index < line.cells.length; index++) {
      const cell = line.cells[index];
      if (this.owner[cell] === line.id) this.owner[cell] = 0;
    }
    line.cells.length = 0;
    line.firstCell = 0;
    line.ended = this.time;
    this.ended.push(line);
  }

  /** Takes away the parts of the lines older than "length" seconds, and the crashed lines that have faded. */
  private fade(length: number) {
    for (let index = this.ended.length - 1; index >= 0; index--) {
      if (this.time - this.ended[index].ended >= CLEAR_SECONDS) this.ended.splice(index, 1);
    }
    if (!Number.isFinite(length)) return;
    const cutoff = this.time - Math.max(length, 1e-3);
    for (const { line } of this.cycles) {
      const p = line.points;
      /* The newest point stays: the line runs from it to the head. */
      while (line.first + POINT < p.length && p[line.first + POINT + 2] < cutoff) line.first += POINT;
      /* A cell marked again later (just behind the head) waits until that mark is old too, and the cells after it with it. */
      while (line.firstCell < line.cells.length) {
        const cell = line.cells[line.firstCell];
        if (this.owner[cell] === line.id && this.marked[cell] >= cutoff) break;
        if (this.owner[cell] === line.id) this.owner[cell] = 0;
        line.firstCell++;
      }
      if (line.first > 4096 && line.first * 2 > p.length) {
        p.splice(0, line.first);
        line.first = 0;
      }
      if (line.firstCell > 4096 && line.firstCell * 2 > line.cells.length) {
        line.cells.splice(0, line.firstCell);
        line.firstCell = 0;
      }
    }
  }

  /**
   * Drives the cycle "dt" seconds on, in steps shorter than a cell, so it
   * cannot jump over a line. Returns false when it crashes.
   */
  private drive(cycle: Cycle, dt: number, s: CycleSettings): boolean {
    const radius = this.radiusCells(s);
    const grace = this.grace(s);
    const lane = Math.max(s.grid, this.cell * 2);
    if (s.move === 0) {
      const snapped = Math.round(cycle.angle / QUARTER) * QUARTER;
      if (snapped !== cycle.angle) {
        cycle.angle = snapped;
        this.addPoint(cycle);
      }
    }
    let remaining = Math.max(0, s.speed) * dt;
    while (remaining > 1e-12) {
      let ds = Math.min(remaining, this.cell * 0.5);
      let crossing = false;
      let laneAt = 0;
      const dx = Math.cos(cycle.angle);
      const dy = Math.sin(cycle.angle);
      if (s.move === 0) {
        /* The distance to the next lane across the cycle's way. */
        const along = Math.abs(dx) > 0.5 ? cycle.x : cycle.y;
        const sign = Math.abs(dx) > 0.5 ? Math.sign(dx) : Math.sign(dy);
        const next = sign > 0 ? Math.floor(along / lane + 1e-9) * lane + lane : Math.ceil(along / lane - 1e-9) * lane - lane;
        const toNext = Math.abs(next - along);
        if (toNext <= ds) {
          ds = toNext;
          crossing = true;
          laneAt = next;
        }
      } else {
        this.steer(cycle, ds / Math.max(s.speed, 1e-6), s);
      }
      remaining -= ds;
      cycle.x += Math.cos(cycle.angle) * ds;
      cycle.y += Math.sin(cycle.angle) * ds;
      /* At a crossing the place is the lane's exactly, so the lines stay on their lanes. */
      if (crossing && Math.abs(dx) > 0.5) cycle.x = laneAt;
      else if (crossing) cycle.y = laneAt;
      cycle.sincePoint += ds;
      if (!this.inBounds(cycle.x, cycle.y, s.bounds)) return false;
      const cell = this.cellAt(cycle.x, cycle.y);
      if (cell !== cycle.cell) {
        /* The front edge of the line: "radius" cells ahead of the head. */
        const ahead = this.cellAt(cycle.x + Math.cos(cycle.angle) * radius * this.cell, cycle.y + Math.sin(cycle.angle) * radius * this.cell);
        if (!this.open(cell, cycle.line, grace) || !this.open(ahead, cycle.line, grace) || !this.open(this.corner(cell, cycle.cell), cycle.line, grace)) return false;
        this.mark(cell, cycle.cell, radius, cycle.line);
        cycle.cell = cell;
      }
      cycle.color = this.colorAt(cycle.x, cycle.y);
      if (crossing) this.decide(cycle, lane, s);
      if (cycle.sincePoint >= POINT_SPACING || Math.abs(cycle.angle - cycle.pointAngle) >= POINT_TURN) this.addPoint(cycle);
    }
    return true;
  }

  /**
   * Grid mode, at a lane crossing: the cycle goes on or turns a quarter
   * turn. It turns at random (Turn Rate), toward a brighter side (Follow),
   * or away from a line ahead (Dodge, when it sees the line).
   */
  private decide(cycle: Cycle, lane: number, s: CycleSettings) {
    const options = [cycle.angle, cycle.angle + QUARTER, cycle.angle - QUARTER];
    const free = options.map((angle) => !this.blocked(cycle, angle, lane, s));
    const sees = this.random() < s.dodge;
    let turn = this.random() < 1 - Math.exp(-Math.max(0, s.turns) * lane / Math.max(s.speed, 1e-6));
    const look = (angle: number) => this.brightness(cycle.x + Math.cos(angle) * Math.max(LOOK, 2 * lane), cycle.y + Math.sin(angle) * Math.max(LOOK, 2 * lane));
    const light = options.map(look);
    if (s.follow > 0 && Math.max(light[1], light[2]) > light[0] + 0.08 && this.random() < s.follow) turn = true;
    if (sees && !free[0]) turn = true;
    if (!turn) return;
    const sides = [1, 2].filter((side) => !sees || free[side]);
    if (!sides.length) return;
    let side = sides[0];
    if (sides.length === 2) {
      const brighter = light[1] >= light[2] ? 1 : 2;
      side = this.random() < 0.5 + 0.5 * s.follow ? brighter : 3 - brighter;
    }
    cycle.angle = options[side];
    this.addPoint(cycle);
  }

  /**
   * Free mode, for one short step of "dt" seconds: the cycle's curve changes
   * at random (Turn Rate), it turns toward the brighter side (Follow), and
   * it turns hard away from a line ahead when it sees the line (Dodge).
   */
  private steer(cycle: Cycle, dt: number, s: CycleSettings) {
    if (this.random() < 1 - Math.exp(-Math.max(0, s.turns) * dt)) {
      cycle.spin = this.random() < 0.4 ? 0 : (this.random() < 0.5 ? -1 : 1) * (1 + 4 * this.random());
    }
    let turn = cycle.spin;
    if (s.follow > 0) {
      const look = (angle: number) => this.brightness(cycle.x + Math.cos(angle) * LOOK, cycle.y + Math.sin(angle) * LOOK);
      turn += s.follow * 6 * Math.max(-1, Math.min(1, (look(cycle.angle + 0.5) - look(cycle.angle - 0.5)) * 8));
    }
    if (this.blocked(cycle, cycle.angle, LOOK, s)) {
      cycle.sees ??= this.random() < s.dodge;
      if (cycle.sees) {
        const left = this.blocked(cycle, cycle.angle + 0.7, LOOK, s);
        const right = this.blocked(cycle, cycle.angle - 0.7, LOOK, s);
        const side = left === right ? (cycle.spin < 0 ? -1 : 1) : left ? -1 : 1;
        turn = side * 2 * Math.max(s.speed, 1e-6) / LOOK;
      }
    } else cycle.sees = null;
    cycle.angle += turn * dt;
  }
}
