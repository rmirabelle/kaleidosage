/**
 * Live VR (WebXR): shows the picture around the viewer in a headset, such
 * as a Quest through Quest Link. The engine still draws the flat picture,
 * square, on its canvas; after each frame, each eye gets the part of it
 * that the eye looks at (VR_SHADER), with the same wrap as the 360 video.
 * The headset's session times the frames. Both eyes see the same picture,
 * very far away. On Windows the web view finds the headset only with WebXR
 * and OpenXR turned on (additionalBrowserArgs in tauri.conf.json).
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
export interface XrSession extends EventTarget {
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

/** The flat picture's size, in pixels on each side, while the headset shows it. */
export const VR_SIZE = 2048;

/** True when a VR headset is ready (for a Quest: Quest Link or Air Link is on). */
export async function vrAvailable() {
  const xr = xrSystem();
  return xr ? xr.isSessionSupported("immersive-vr").catch(() => false) : false;
}

/** Calls "onChange" when a headset comes or goes. Returns the function that stops it. */
export function watchVr(onChange: () => void) {
  const xr = xrSystem();
  xr?.addEventListener("devicechange", onChange);
  return () => xr?.removeEventListener("devicechange", onChange);
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
 * The inverse of the eye's projection times its turn: the eye's view matrix
 * without its place, as the picture is very far away. All matrices are 4 by
 * 4, column by column, as WebGL has them.
 */
export function eyeInverse(projection: ArrayLike<number>, view: ArrayLike<number>) {
  const turn = Float32Array.from(view);
  turn[12] = turn[13] = turn[14] = 0;
  return invert(multiply(projection, turn));
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
