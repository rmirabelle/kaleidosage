import { expect, test } from "vitest";
import { DEFAULT_VR_SCREEN, VR_SHAPES, eyeInverse, invert, moveVrScreen, multiply, readVrControls, vrPictureSize, type VrControls } from "./vr";

const still: VrControls = { right: [0, 0], left: [0, 0], next: false, reset: false };

test("sticks at rest, or nearly, leave the screen as it is", () => {
  const screen = { ...DEFAULT_VR_SCREEN };
  expect(moveVrScreen(screen, still, still, 0.016)).toBe(screen);
  expect(moveVrScreen(screen, { ...still, right: [0.1, -0.1] }, still, 0.016)).toBe(screen);
});

test("the right stick forward moves the screen away, and to the right makes it wider", () => {
  const screen = { ...DEFAULT_VR_SCREEN };
  const away = moveVrScreen(screen, { ...still, right: [0, -1] }, still, 1);
  expect(away.distance).toBeCloseTo(screen.distance * 2, 5);
  const wider = moveVrScreen(screen, { ...still, right: [1, 0] }, still, 1);
  expect(wider.width).toBeCloseTo(screen.width * 2, 5);
  expect(moveVrScreen(screen, { ...still, right: [-1, 0] }, still, 100).width).toBe(0.5);
});

test("the left stick forward curves the screen, up to 1", () => {
  const curved = moveVrScreen({ ...DEFAULT_VR_SCREEN }, { ...still, left: [0, -1] }, still, 1);
  expect(curved.curve).toBeCloseTo(0.5, 5);
  expect(moveVrScreen(curved, { ...still, left: [0, -1] }, still, 5).curve).toBe(1);
});

test("A goes to the next shape once per press, and B resets", () => {
  const screen = { ...DEFAULT_VR_SCREEN };
  const pressed = { ...still, next: true };
  const next = moveVrScreen(screen, pressed, still, 0.016);
  expect(next.aspect).toBe(VR_SHAPES[1].aspect);
  expect(moveVrScreen(next, pressed, pressed, 0.016)).toBe(next);
  const last = { ...screen, aspect: VR_SHAPES[VR_SHAPES.length - 1].aspect };
  expect(moveVrScreen(last, pressed, still, 0.016).aspect).toBe(VR_SHAPES[0].aspect);
  expect(moveVrScreen({ ...screen, width: 9 }, { ...still, reset: true }, still, 0.016)).toEqual(DEFAULT_VR_SCREEN);
});

test("controllers are read by hand: sticks are axes 2 and 3, A and B are buttons 4 and 5", () => {
  const button = (pressed: boolean) => ({ pressed });
  const controls = readVrControls([
    { handedness: "left", gamepad: { axes: [0, 0, 0.2, -0.7], buttons: [] } },
    { handedness: "right", gamepad: { axes: [0, 0, 0.5, 0.3], buttons: [0, 0, 0, 0, 1, 0].map((on) => button(on === 1)) } }
  ]);
  expect(controls).toEqual({ left: [0.2, -0.7], right: [0.5, 0.3], next: true, reset: false });
});

test("the picture is 1440 pixels tall in the screen's shape, in even pixels", () => {
  expect(vrPictureSize(16 / 9)).toEqual([2560, 1440]);
  expect(vrPictureSize(21 / 9)).toEqual([3360, 1440]);
});

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
