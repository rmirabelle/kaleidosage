import { hull, type V3 } from "./starMesh";

/**
 * The 3D Object's flat-faced shapes as meshes (see docs/SOLIDS.md, "The
 * flat-faced shapes as meshes"): the Cube (shape 1), the Octahedron (6),
 * the Icosahedron (7) and the Pyramid (8).
 *
 * Each face of the sharp shape is a fine grid of triangles, closer near
 * the edges and corners. Roundness does not change the mesh: the vertex
 * shader (SOLID_MESH_VERTEX) moves each point along its direction from the
 * middle onto the rounded surface, the same surface the rays found. So a
 * moving Roundness costs nothing here.
 */

/** The face planes of each shape: outward direction (length 1) and distance from the middle, as facePlanes and box in SOLID_SHADER. */
function planes(shape: number): { normal: V3; offset: number }[] {
  const unit = (p: V3): V3 => {
    const l = Math.hypot(...p);
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  const corners: V3[] = [];
  for (let i = 0; i < 8; i++) corners.push(unit([(i & 1) * 2 - 1, ((i >> 1) & 1) * 2 - 1, ((i >> 2) & 1) * 2 - 1]));
  if (shape === 1) {
    const axes: V3[] = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
    return axes.map((normal) => ({ normal, offset: 0.8 }));
  }
  if (shape === 6) return corners.map((normal) => ({ normal, offset: 0.62 }));
  if (shape === 7) {
    const g = (1 + Math.sqrt(5)) / 2;
    const normals = [...corners];
    for (let i = 0; i < 4; i++) {
      const a = [((i & 1) * 2 - 1) / g, (((i >> 1) & 1) * 2 - 1) * g];
      normals.push(unit([0, a[0], a[1]]), unit([a[0], a[1], 0]), unit([a[1], 0, a[0]]));
    }
    return normals.map((normal) => ({ normal, offset: 0.82 }));
  }
  const side = unit([1.6, 0.95, 0]);
  const slant: V3[] = [[side[0], side[1], 0], [-side[0], side[1], 0], [0, side[1], side[0]], [0, side[1], -side[0]]];
  return [...slant.map((normal) => ({ normal, offset: side[1] * 0.9 })), { normal: [0, -1, 0] as V3, offset: 0.7 }];
}

/** The corners of the sharp shape: where three planes meet inside all the others. */
function corners(shape: number): V3[] {
  const p = planes(shape);
  const out = new Map<string, V3>();
  const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  for (let i = 0; i < p.length; i++) {
    for (let j = i + 1; j < p.length; j++) {
      for (let k = j + 1; k < p.length; k++) {
        const [a, b, c] = [p[i].normal, p[j].normal, p[k].normal];
        const det = dot(a, [b[1] * c[2] - b[2] * c[1], b[2] * c[0] - b[0] * c[2], b[0] * c[1] - b[1] * c[0]]);
        if (Math.abs(det) < 1e-9) continue;
        /* Cramer's rule for the point on all three planes. */
        const rows = [a, b, c];
        const d = [p[i].offset, p[j].offset, p[k].offset];
        const solve = (column: number) => {
          const m = rows.map((row, r) => row.map((x, s) => (s === column ? d[r] : x)) as V3);
          return dot(m[0], [m[1][1] * m[2][2] - m[1][2] * m[2][1], m[1][2] * m[2][0] - m[1][0] * m[2][2], m[1][0] * m[2][1] - m[1][1] * m[2][0]]) / det;
        };
        const point: V3 = [solve(0), solve(1), solve(2)];
        if (p.some((plane) => dot(plane.normal, point) > plane.offset + 1e-6)) continue;
        out.set(point.map((x) => Math.round(x * 1e6)).join(","), point);
      }
    }
  }
  return [...out.values()];
}

/** Rows of the grid from a face's middle to its edge: more of them near the edge, where Roundness bends the surface. */
const ROWS = 20;

const meshes = new Map<number, Float32Array>();

/**
 * The mesh of a flat-faced shape (1, 6, 7 or 8): for each corner of each
 * triangle its place on the sharp shape and its face's direction (twice,
 * MESH_STRIDE numbers). Each face is cut into triangles from its middle
 * to each edge, and each of those into a grid.
 */
export function flatMesh(shape: number): Float32Array {
  const kept = meshes.get(shape);
  if (kept) return kept;
  const points = corners(shape);
  const out: number[] = [];
  for (const face of hull(points)) {
    const ring = face.corners.map((index) => points[index]);
    const middle = ring.reduce((sum, p) => [sum[0] + p[0] / ring.length, sum[1] + p[1] / ring.length, sum[2] + p[2] / ring.length] as V3, [0, 0, 0] as V3);
    const n = face.normal;
    for (let e = 0; e < ring.length; e++) {
      const a = ring[e];
      const b = ring[(e + 1) % ring.length];
      /* Row i is s of the way from the middle to the edge; its points run t of the way from a to b, closer near the corners. */
      const grid: V3[][] = [];
      for (let i = 0; i <= ROWS; i++) {
        const s = 1 - (1 - i / ROWS) ** 2;
        const row: V3[] = [];
        for (let j = 0; j <= i; j++) {
          const t = i === 0 ? 0 : 0.5 - 0.5 * Math.cos((Math.PI * j) / i);
          const edge: V3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
          row.push([middle[0] + (edge[0] - middle[0]) * s, middle[1] + (edge[1] - middle[1]) * s, middle[2] + (edge[2] - middle[2]) * s]);
        }
        grid.push(row);
      }
      /* The face's direction stands in for the point's (MESH_STRIDE numbers per corner). */
      const put = (p: V3) => out.push(p[0], p[1], p[2], n[0], n[1], n[2], n[0], n[1], n[2]);
      for (let i = 0; i < ROWS; i++) {
        for (let j = 0; j <= i; j++) {
          put(grid[i][j]);
          put(grid[i + 1][j]);
          put(grid[i + 1][j + 1]);
          if (j < i) {
            put(grid[i][j]);
            put(grid[i + 1][j + 1]);
            put(grid[i][j + 1]);
          }
        }
      }
    }
  }
  const data = new Float32Array(out);
  meshes.set(shape, data);
  return data;
}

/** The shapes drawn as meshes: these four and the Moravian star (10). */
export const MESH_SHAPES: ReadonlySet<number> = new Set([1, 6, 7, 8, 10]);
