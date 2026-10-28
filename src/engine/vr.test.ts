import { expect, test } from "vitest";
import { eyeInverse, invert, multiply } from "./vr";

/** A WebGL perspective projection: "fov" radians up and down, square, near 0.1, far 100. */
function perspective(fov: number) {
  const f = 1 / Math.tan(fov / 2);
  const near = 0.1, far = 100;
  return [f, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) / (near - far), -1, 0, 0, (2 * far * near) / (near - far), 0];
}

/** The direction VR_SHADER finds for a point of the eye's view (-1 to 1). */
function direction(inverse: Float32Array, x: number, y: number) {
  const far = [0, 1, 2, 3].map((row) => inverse[row] * x + inverse[4 + row] * y + inverse[8 + row] + inverse[12 + row]);
  const point = far.slice(0, 3).map((value) => value / far[3]);
  const length = Math.hypot(...point);
  return point.map((value) => value / length);
}

const IDENTITY = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

test("invert undoes multiply", () => {
  const projection = perspective(1.6);
  const product = multiply(projection, invert(projection));
  for (let index = 0; index < 16; index++) expect(product[index]).toBeCloseTo(IDENTITY[index], 5);
});

test("the middle of the view looks ahead, and the eye's place does not count", () => {
  const moved = [...IDENTITY.slice(0, 12), 0.3, -1.6, 2, 1];
  const [x, y, z] = direction(eyeInverse(perspective(1.6), moved), 0, 0);
  expect(x).toBeCloseTo(0, 5);
  expect(y).toBeCloseTo(0, 5);
  expect(z).toBeCloseTo(-1, 5);
});

test("a head turned 90 degrees to the right looks along +x", () => {
  /* The view matrix is the inverse of the head's turn: a turn to the right (about y) by -90 degrees. */
  const headTurn = [0, 0, 1, 0, 0, 1, 0, 0, -1, 0, 0, 0, 0, 0, 0, 1];
  const [x, y, z] = direction(eyeInverse(perspective(1.6), invert(headTurn)), 0, 0);
  expect(x).toBeCloseTo(1, 5);
  expect(y).toBeCloseTo(0, 5);
  expect(z).toBeCloseTo(0, 5);
});

test("the top of the view looks up", () => {
  const [, y] = direction(eyeInverse(perspective(1.6), IDENTITY), 0, 1);
  expect(y).toBeGreaterThan(0.5);
});
