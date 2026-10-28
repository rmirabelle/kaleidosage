/**
 * Live VR (WebXR): shows the picture on a large virtual screen in front of
 * the viewer in a headset, such as a Quest through Quest Link. The engine
 * still draws the flat picture on its canvas, VR_HEIGHT pixels tall; after
 * each frame, each eye draws the screen (VR_SHADER) where it sits in the
 * room. The headset's session times the frames. On Windows the web view
 * finds the headset only with WebXR and OpenXR turned on
 * (additionalBrowserArgs in tauri.conf.json).
 */

/** The few WebXR types the app uses (TypeScript's DOM types have none). */
export interface XrView {
  projectionMatrix: Float32Array;
  transform: { inverse: { matrix: Float32Array } };
}
export interface XrViewport { x: number; y: number; width: number; height: number }
export interface XrLayer {
  readonly framebuffer: WebGLFramebuffer | null;
  getViewport(view: XrView): XrViewport | null;
}
export type XrSpace = object;
export interface XrFrame {
  getViewerPose(space: XrSpace): { views: readonly XrView[] } | null;
}
/** A controller: its thumbstick is axes 2 and 3, and A (or X) and B (or Y) are buttons 4 and 5 ("xr-standard"). */
export interface XrInputSource {
  handedness: "left" | "right" | "none";
  gamepad?: { axes: readonly number[]; buttons: readonly { pressed: boolean }[] } | null;
}
export interface XrSession extends EventTarget {
  readonly inputSources: Iterable<XrInputSource>;
  updateRenderState(state: { baseLayer: XrLayer }): void;
  requestReferenceSpace(type: "local"): Promise<XrSpace>;
  requestAnimationFrame(callback: (time: number, frame: XrFrame) => void): number;
  cancelAnimationFrame(id: number): void;
  end(): Promise<void>;
}
interface XrSystem extends EventTarget {
  isSessionSupported(mode: "immersive-vr"): Promise<boolean>;
  requestSession(mode: "immersive-vr"): Promise<XrSession>;
}

const xrSystem = () => (navigator as Navigator & { xr?: XrSystem }).xr ?? null;

/** The flat picture's height in pixels while the headset shows it; its width follows from the screen's shape. */
export const VR_HEIGHT = 1440;

/** The screen shapes, width to height; A on the right controller goes to the next one. */
export const VR_SHAPES = [
  { label: "16:9", aspect: 16 / 9 },
  { label: "21:9", aspect: 21 / 9 },
  { label: "4:3", aspect: 4 / 3 },
  { label: "1:1", aspect: 1 }
] as const;

/**
 * The virtual screen: its width and its distance from where the viewer
 * started, in meters, its curve (0 is flat; 1 curves it around the viewer,
 * as part of a circle with the viewer at its center), and its shape (width
 * to height, one of VR_SHAPES). Its middle is at eye height.
 */
export interface VrScreen {
  width: number;
  distance: number;
  curve: number;
  aspect: number;
}

export const DEFAULT_VR_SCREEN: VrScreen = { width: 4, distance: 3, curve: 0, aspect: 16 / 9 };

/** The settings with a slider. */
export type VrScreenSlider = "width" | "distance" | "curve";

/** The slider limits of each setting. */
export const VR_SCREEN_LIMITS: Record<VrScreenSlider, { min: number; max: number; step: number }> = {
  width: { min: 0.5, max: 30, step: 0.1 },
  distance: { min: 0.5, max: 30, step: 0.1 },
  curve: { min: 0, max: 1, step: 0.01 }
};

/** The picture's size in pixels for a screen of this shape. */
export const vrPictureSize = (aspect: number): [number, number] => [Math.round((VR_HEIGHT * aspect) / 2) * 2, VR_HEIGHT];

/** The shape in VR_SHAPES nearest to "aspect" (a stored shape may be any number). */
export const nearestShape = (aspect: number) => VR_SHAPES.reduce((best, shape) => Math.abs(shape.aspect - aspect) < Math.abs(best.aspect - aspect) ? shape : best);

/** The controllers as the screen controls read them: each stick (x to the right, y down, -1 to 1) and the right controller's A and B. */
export interface VrControls {
  right: [number, number];
  left: [number, number];
  next: boolean;
  reset: boolean;
}

export function readVrControls(sources: Iterable<XrInputSource>): VrControls {
  const controls: VrControls = { right: [0, 0], left: [0, 0], next: false, reset: false };
  for (const source of sources) {
    const pad = source.gamepad;
    if (!pad || source.handedness === "none") continue;
    const stick: [number, number] = [pad.axes[2] ?? 0, pad.axes[3] ?? 0];
    if (source.handedness === "left") {
      controls.left = stick;
    } else {
      controls.right = stick;
      controls.next = pad.buttons[4]?.pressed ?? false;
      controls.reset = pad.buttons[5]?.pressed ?? false;
    }
  }
  return controls;
}

/** Stick moves smaller than this do nothing, as a stick at rest is seldom exactly at 0. */
const DEAD_ZONE = 0.15;
const live = (value: number) => Math.abs(value) < DEAD_ZONE ? 0 : Math.sign(value) * (Math.abs(value) - DEAD_ZONE) / (1 - DEAD_ZONE);
const clamp = (key: VrScreenSlider, value: number) => Math.min(VR_SCREEN_LIMITS[key].max, Math.max(VR_SCREEN_LIMITS[key].min, value));
/** At full tilt the curve changes by this much each second. */
const CURVE_PER_SECOND = 0.5;

/**
 * The screen after "seconds" of the controllers: the right stick pushed
 * forward moves the screen away and pulled back brings it near, and to
 * the right makes it wider; at full tilt each doubles or halves in a
 * second. The left stick forward curves the screen more. A press of A goes
 * to the next shape, and B resets the screen ("before" are the controls of
 * the last frame, so a held button counts once). With no change, the
 * result is "screen" itself.
 */
export function moveVrScreen(screen: VrScreen, controls: VrControls, before: VrControls | null, seconds: number): VrScreen {
  if (controls.reset && !before?.reset) return { ...DEFAULT_VR_SCREEN };
  const [turn, push] = controls.right.map(live);
  const bend = live(controls.left[1]);
  const width = clamp("width", screen.width * 2 ** (turn * seconds));
  const distance = clamp("distance", screen.distance * 2 ** (-push * seconds));
  const curve = clamp("curve", screen.curve - bend * CURVE_PER_SECOND * seconds);
  let aspect = screen.aspect;
  if (controls.next && !before?.next) {
    const index = VR_SHAPES.indexOf(nearestShape(aspect));
    aspect = VR_SHAPES[(index + 1) % VR_SHAPES.length].aspect;
  }
  if (width === screen.width && distance === screen.distance && curve === screen.curve && aspect === screen.aspect) return screen;
  return { width, distance, curve, aspect };
}

/** True when the web view can show VR at all (with a headset that is ready). */
export const vrSupported = () => xrSystem() !== null;

/** True when a VR headset is ready (for a Quest: Quest Link or Air Link is on). */
export async function vrAvailable() {
  const xr = xrSystem();
  return xr ? xr.isSessionSupported("immersive-vr").catch(() => false) : false;
}

/** Starts showing in the headset. It must follow a click or a key press. */
export function startVrSession() {
  const xr = xrSystem();
  if (!xr) return Promise.reject(new Error("This version of the app's web view cannot show VR."));
  return xr.requestSession("immersive-vr");
}

/** One eye: where it draws in the headset's frame, and the u_inverse of VR_SHADER. */
export interface VrEye {
  viewport: XrViewport;
  inverse: Float32Array;
}

/** The eyes for this headset frame; none when the headset has lost track of where it is. */
export function vrEyes(frame: XrFrame, space: XrSpace, layer: XrLayer): VrEye[] {
  const pose = frame.getViewerPose(space);
  if (!pose) return [];
  return pose.views.flatMap((view) => {
    const viewport = layer.getViewport(view);
    return viewport ? [{ viewport, inverse: eyeInverse(view.projectionMatrix, view.transform.inverse.matrix) }] : [];
  });
}

/**
 * The inverse of the eye's projection times its view matrix: it turns a
 * point of the eye's view back into the room. All matrices are 4 by 4,
 * column by column, as WebGL has them.
 */
export function eyeInverse(projection: ArrayLike<number>, view: ArrayLike<number>) {
  return invert(multiply(projection, view));
}

export function multiply(a: ArrayLike<number>, b: ArrayLike<number>) {
  const out = new Float32Array(16);
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0;
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row] * b[column * 4 + k];
      out[column * 4 + row] = sum;
    }
  }
  return out;
}

/** The inverse of a 4 by 4 matrix (by cofactors); a matrix with no inverse gives all zeros. */
export function invert(m: ArrayLike<number>) {
  const [a00, a01, a02, a03, a10, a11, a12, a13, a20, a21, a22, a23, a30, a31, a32, a33] = Array.from(m);
  const b00 = a00 * a11 - a01 * a10;
  const b01 = a00 * a12 - a02 * a10;
  const b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11;
  const b04 = a01 * a13 - a03 * a11;
  const b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30;
  const b07 = a20 * a32 - a22 * a30;
  const b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31;
  const b10 = a21 * a33 - a23 * a31;
  const b11 = a22 * a33 - a23 * a32;
  const determinant = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  const out = new Float32Array(16);
  if (!determinant) return out;
  const d = 1 / determinant;
  out[0] = (a11 * b11 - a12 * b10 + a13 * b09) * d;
  out[1] = (a02 * b10 - a01 * b11 - a03 * b09) * d;
  out[2] = (a31 * b05 - a32 * b04 + a33 * b03) * d;
  out[3] = (a22 * b04 - a21 * b05 - a23 * b03) * d;
  out[4] = (a12 * b08 - a10 * b11 - a13 * b07) * d;
  out[5] = (a00 * b11 - a02 * b08 + a03 * b07) * d;
  out[6] = (a32 * b02 - a30 * b05 - a33 * b01) * d;
  out[7] = (a20 * b05 - a22 * b02 + a23 * b01) * d;
  out[8] = (a10 * b10 - a11 * b08 + a13 * b06) * d;
  out[9] = (a01 * b08 - a00 * b10 - a03 * b06) * d;
  out[10] = (a30 * b04 - a31 * b02 + a33 * b00) * d;
  out[11] = (a21 * b02 - a20 * b04 - a23 * b00) * d;
  out[12] = (a11 * b07 - a10 * b09 - a12 * b06) * d;
  out[13] = (a00 * b09 - a01 * b07 + a02 * b06) * d;
  out[14] = (a31 * b01 - a30 * b03 - a32 * b00) * d;
  out[15] = (a20 * b03 - a21 * b01 + a22 * b00) * d;
  return out;
}
