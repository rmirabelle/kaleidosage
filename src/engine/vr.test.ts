import { expect, test } from "vitest";
import { eyeInverse, invert, multiply } from "./vr";

/** A WebGL perspective projection: "fov" radians up and down, square, near 0.1, far 100. */
function perspective(fov: number) {
  const f = 1 / Math.tan(fov / 2);
  const near = 0.1, far = 100;
  return [f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

/** A point of the eye's view (x, y, depth from -1 to 1) back in the room, as VR_SHADER finds it. */
function unproject(inverse: Float32Array, x: number, y: number, depth: number) {
  const point = [0, 1, 2, 3].map((row) => inverse[row] * x + inverse[4 + row] * y + inverse[8 + row] * depth + inverse[12 + row]);
  return point.slice(0, 3).map((value) => value / point[3]);
}

/** The ray VR_SHADER follows for a point of the eye's view: where it starts, and its direction. */
function ray(inverse: Float32Array, x: number, y: number) {
  const near = unproject(inverse, x, y, -1);
  const far = unproject(inverse, x, y, 1);
  const length = Math.hypot(...far.map((value, index) => value - near[index]));
  return { near, dir: far.map((value, index) => (value - near[index]) / length) };
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

test("invert undoes multiply", () => {
  const projection = perspective(1.6);
  const product = multiply(projection, invert(projection));
  for (let index = 0; index < 16; index++) expect(product[index]).toBeCloseTo(IDENTITY[index], 5);
});

test("the middle of the view looks ahead, from where the eye is", () => {
  /* An eye at (0.3, 1.6, -2) with no turn: its view matrix moves the room by the opposite. */
  const moved = [...IDENTITY.slice(0, 12), -0.3, -1.6, 2, 1];
  const { near, dir } = ray(eyeInverse(perspective(1.6), moved), 0, 0);
  expect(near[0]).toBeCloseTo(0.3, 4);
  expect(near[1]).toBeCloseTo(1.6, 4);
  expect(near[2]).toBeCloseTo(-2.1, 4);
  expect(dir[0]).toBeCloseTo(0, 5);
  expect(dir[1]).toBeCloseTo(0, 5);
  expect(dir[2]).toBeCloseTo(-1, 5);
});

test("a head turned 90 degrees to the right looks along +x", () => {
  /* The view matrix is the inverse of the head's turn: a turn to the right (about y) by -90 degrees. */
  const headTurn = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];
  const { dir } = ray(eyeInverse(perspective(1.6), invert(headTurn)), 0, 0);
  expect(dir[0]).toBeCloseTo(1, 5);
  expect(dir[1]).toBeCloseTo(0, 5);
  expect(dir[2]).toBeCloseTo(0, 5);
});

test("the top of the view looks up", () => {
  const { dir } = ray(eyeInverse(perspective(1.6), IDENTITY), 0, 1);
  expect(dir[1]).toBeGreaterThan(0.5);
});
