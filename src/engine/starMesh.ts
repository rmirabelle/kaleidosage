/**
 * The Moravian star as triangles (see docs/SOLIDS.md, "The Moravian star as
 * a mesh"). The graphics card draws triangles with its own edge smoothing
 * (4 samples per pixel), which costs far less than more rays.
 *
 * The star is one of 8 cores (the same as the stellated distance function
 * in SOLID_SHADER), with a pyramid (a point) on each face. Each point's
 * sides are triangles from the face's corners to its tip.
 *
 * Hollow: each triangle becomes a frame, the triangle with a smaller
 * triangle (the window) inside it, joined by three bars. The bars have a
 * thickness: an inner surface (the star's surface moved in), and walls
 * around each window. Two triangles that share an edge share its bar, so
 * each bar is one strip, and each tip stays one point.
 */

type V3 = [number, number, number];

/** The point counts of the 8 cores. */
export const STAR_COUNTS = [4, 6, 8, 12, 14, 20, 26, 32] as const;

/** The cores' corners are this far from the middle (as V in starKind). */
const CORNER = 0.5;
/** Point length 1 puts the tips this far out. */
const TIP = 1.25;
const PHI = (1 + Math.sqrt(5)) / 2;

const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const length = (a: V3) => Math.sqrt(dot(a, a));
const unit = (a: V3): V3 => mul(a, 1 / (length(a) || 1));
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Every sign of a point's coordinates (a 0 keeps one sign). */
function signs(p: V3): V3[] {
  const out: V3[] = [];
  for (const sx of p[0] === 0 ? [1] : [1, -1]) {
    for (const sy of p[1] === 0 ? [1] : [1, -1]) {
      for (const sz of p[2] === 0 ? [1] : [1, -1]) out.push([p[0] * sx, p[1] * sy, p[2] * sz]);
    }
  }
  return out;
}
/** The three turns of (x, y, z): (y, z, x) and (z, x, y), with every sign. */
const cyclic = (p: V3): V3[] => [p, [p[1], p[2], p[0]] as V3, [p[2], p[0], p[1]] as V3].flatMap(signs);
/** All six orders of (x, y, z), with every sign. */
const orders = (p: V3): V3[] => [p, [p[0], p[2], p[1]] as V3, [p[1], p[0], p[2]] as V3, [p[1], p[2], p[0]] as V3, [p[2], p[0], p[1]] as V3, [p[2], p[1], p[0]] as V3].flatMap(signs);

/** The corners of each core, at any size (oriented as in SOLID_SHADER's STAR_N and STAR_CORNER). */
function coreCorners(kind: number): V3[] {
  const s2 = 1 + Math.SQRT2;
  switch (kind) {
    case 0: return [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]];
    case 1: return signs([1, 1, 1]);
    case 2: return orders([1, 0, 0]);
    case 3: return [...signs([1, 1, 1]), ...cyclic([0, 1 / PHI, PHI])];
    case 4: return orders([1, 1, 0]);
    case 5: return cyclic([1, 0, PHI]);
    case 6: return orders([s2, 1, 1]);
    default: return [...orders([0, 0, PHI]), ...cyclic([PHI * PHI / 2, 0.5, PHI / 2])];
  }
}

/** A face of a core: its outward direction, its corners in turn (counterclockwise seen from outside), as indexes. */
export interface CoreFace {
  normal: V3;
  corners: number[];
}

export interface Core {
  points: V3[];
  faces: CoreFace[];
}

/** The faces of a convex shape around the middle: every plane through three corners with all corners on its inner side. */
function hull(points: V3[]): CoreFace[] {
  const faces: CoreFace[] = [];
  const seen = new Set<string>();
  const eps = 1e-6;
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      for (let k = j + 1; k < points.length; k++) {
        let n = cross(sub(points[j], points[i]), sub(points[k], points[i]));
        if (length(n) < eps) continue;
        n = unit(n);
        let d = dot(n, points[i]);
        if (d < 0) {
          n = mul(n, -1);
          d = -d;
        }
        if (points.some((p) => dot(n, p) > d + eps)) continue;
        const key = n.map((x) => Math.round(x * 1e4)).join(",");
        if (seen.has(key)) continue;
        seen.add(key);
        const on = points.map((_, index) => index).filter((index) => Math.abs(dot(n, points[index]) - d) < eps);
        const middle = mul(on.reduce((sum, index) => add(sum, points[index]), [0, 0, 0] as V3), 1 / on.length);
        const u = unit(sub(points[on[0]], middle));
        const v = cross(n, u);
        on.sort((a, b) => {
          const pa = sub(points[a], middle);
          const pb = sub(points[b], middle);
          return Math.atan2(dot(pa, v), dot(pa, u)) - Math.atan2(dot(pb, v), dot(pb, u));
        });
        faces.push({ normal: n, corners: on });
      }
    }
  }
  return faces;
}

const cores: Core[] = [];
/** The core for a kind (0 to 7), with its corners CORNER from the middle. */
export function core(kind: number): Core {
  if (!cores[kind]) {
    /* The orders of a point with equal coordinates repeat it: keep each corner once. */
    const unique = new Map(coreCorners(kind).map((p) => [p.map((x) => Math.round(x * 1e6)).join(","), p]));
    const points = [...unique.values()].map((p) => mul(unit(p), CORNER));
    cores[kind] = { points, faces: hull(points) };
  }
  return cores[kind];
}

/** The bars' width across a face and their thickness, from Hollow (as in starKind: the bar is 0.53 near Hollow 0 and 0.03 at 1). */
export function barSize(hollow: number) {
  const open = Math.min(1, Math.max(0, hollow));
  if (open <= 0) return { width: 0, thick: 0 };
  const bar = 0.03 + 0.5 * (1 - open) * (1 - open);
  return { width: 1.6 * bar, thick: Math.min(bar, 0.06) };
}

/** A triangle of the star: its three corners (indexes into the star's points) and the bar width along each side (a to b, b to c, c to a). */
interface Tri {
  at: [number, number, number];
  widths: [number, number, number];
}

/**
 * The star's triangles for one core: points in its unit frame, then for
 * each triangle its position and normal (6 numbers per corner, 3 corners).
 */
export function starMesh(kind: number, pointLength: number, hollow: number): Float32Array {
  const c = core(kind);
  const reach = Math.min(1, Math.max(0, pointLength));
  const { width, thick } = barSize(hollow);
  const points: V3[] = [...c.points];
  const tris: Tri[] = [];
  for (const face of c.faces) {
    const r = dot(face.normal, c.points[face.corners[0]]);
    const tip = mix(r, TIP, reach);
    /* The side bars grow in as the point rises, so a bare core is framed only along its own edges (grow as in starKind). */
    const grow = smoothstep(0, 0.08, tip - r);
    const apex = points.length;
    points.push(mul(face.normal, tip));
    const count = face.corners.length;
    for (let i = 0; i < count; i++) {
      tris.push({ at: [face.corners[i], face.corners[(i + 1) % count], apex], widths: [width, width * grow, width * grow] });
    }
  }
  const out: number[] = [];
  const corner = (p: V3, n: V3) => out.push(p[0], p[1], p[2], n[0], n[1], n[2]);
  const triangle = (a: V3, b: V3, d: V3, n: V3) => {
    corner(a, n);
    corner(b, n);
    corner(d, n);
  };
  const quad = (a: V3, b: V3, d: V3, e: V3, n: V3) => {
    triangle(a, b, d, n);
    triangle(a, d, e, n);
  };
  const normals = tris.map((t) => unit(cross(sub(points[t.at[1]], points[t.at[0]]), sub(points[t.at[2]], points[t.at[0]]))));
  if (width <= 0) {
    tris.forEach((t, i) => triangle(points[t.at[0]], points[t.at[1]], points[t.at[2]], normals[i]));
    return new Float32Array(out);
  }
  const inner = innerPoints(points, tris, normals, thick);
  tris.forEach((t, i) => {
    const n = normals[i];
    const [a, b, d] = t.at.map((index) => points[index]);
    const [ia, ib, id] = t.at.map((index) => inner[index]);
    const back = mul(n, -1);
    const win = windowOf([a, b, d], t.widths, n);
    if (!win) {
      triangle(a, b, d, n);
      triangle(ia, id, ib, back);
      return;
    }
    const outer = [a, b, d];
    const shell = [ia, ib, id];
    const cut = win.map((p) => sub(p, mul(n, thick)));
    for (let side = 0; side < 3; side++) {
      const next = (side + 1) % 3;
      if (t.widths[side] < 1e-4) continue;
      /* The bar along this side: on the face, on the inner surface, and the wall of the window. */
      quad(outer[side], outer[next], win[next], win[side], n);
      quad(shell[side], cut[side], cut[next], shell[next], back);
      quad(win[side], win[next], cut[next], cut[side], unit(cross(n, sub(win[next], win[side]))));
    }
  });
  return new Float32Array(out);
}

/**
 * The window of a triangle: each side moved in by its bar width, and the
 * corners where the moved sides meet. None when the bars fill the triangle
 * (the moved sides cross).
 */
function windowOf(corners: V3[], widths: [number, number, number], n: V3): V3[] | null {
  const out: V3[] = [];
  for (let i = 0; i < 3; i++) {
    const here = corners[i];
    const next = corners[(i + 1) % 3];
    const last = corners[(i + 2) % 3];
    const toNext = unit(sub(next, here));
    const toLast = unit(sub(last, here));
    const sine = length(cross(toNext, toLast));
    if (sine < 1e-6) return null;
    /* The side from here to next has width widths[i], the side from last to here widths[i + 2]. */
    out.push(add(here, mul(add(mul(toNext, widths[(i + 2) % 3]), mul(toLast, widths[i])), 1 / sine)));
  }
  const area = dot(cross(sub(out[1], out[0]), sub(out[2], out[0])), n);
  const whole = dot(cross(sub(corners[1], corners[0]), sub(corners[2], corners[0])), n);
  return area > whole * 1e-4 ? out : null;
}

/**
 * The inner surface's point for each of the star's points: moved in by the
 * thickness, so each face's inner plane is that far behind it (the point
 * that is 1 thickness from all its faces' planes, as near as it can be;
 * where the faces lie flat, straight in).
 */
function innerPoints(points: V3[], tris: Tri[], normals: V3[], thick: number): V3[] {
  const sums = points.map(() => ({ a: [0, 0, 0, 0, 0, 0, 0, 0, 0], b: [0, 0, 0] as V3 }));
  tris.forEach((t, i) => {
    const n = normals[i];
    for (const index of t.at) {
      const s = sums[index];
      for (let r = 0; r < 3; r++) for (let k = 0; k < 3; k++) s.a[r * 3 + k] += n[r] * n[k];
      s.b = add(s.b, n);
    }
  });
  return points.map((p, index) => {
    const { a, b } = sums[index];
    /* A small extra on the diagonal: faces that lie flat leave the direction along them free; this keeps it near 0. */
    const m = solve(a.map((x, k) => (k % 4 === 0 ? x + 1e-3 : x)), b);
    const reach = length(m);
    const limited = reach > 4 ? mul(m, 4 / reach) : m;
    return sub(p, mul(limited, thick));
  });
}

/** Solves a 3 by 3 system (row by row in a) for x with a x = b. */
function solve(a: number[], b: V3): V3 {
  const det = (m: number[]) => m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6]);
  const d = det(a);
  if (Math.abs(d) < 1e-12) return [0, 0, 0];
  const column = (k: number) => a.map((x, i) => (i % 3 === k ? b[Math.floor(i / 3)] : x));
  return [det(column(0)) / d, det(column(1)) / d, det(column(2)) / d];
}

/**
 * The cores to draw for a Points value, with their weights: one core at a
 * whole count, two between counts (faded, the second by the smoothed part
 * between them, as in stellated).
 */
export function starKinds(points: number): { kind: number; weight: number }[] {
  const c = Math.min(32, Math.max(4, points));
  let i = 0;
  for (let j = 1; j < STAR_COUNTS.length; j++) if (c >= STAR_COUNTS[j]) i = j;
  const next = i < STAR_COUNTS.length - 1 ? smoothstep(0, 1, (c - STAR_COUNTS[i]) / (STAR_COUNTS[i + 1] - STAR_COUNTS[i])) : 0;
  const out = [{ kind: i, weight: 1 - next }];
  if (next > 0.001) out.push({ kind: i + 1, weight: next });
  return out.filter((each) => each.weight > 0.001);
}
