import type { Engine } from "../engine/engine";
import type { ParamKey } from "../engine/params";

const DEGREES = Math.PI / 180;

/**
 * Mouse control of the Camera effect on the canvas, as in a 3D program. The
 * picture follows the mouse:
 * - Drag: Pan and Tilt.
 * - Right-drag or Shift-drag: Truck (left and right) and Pedestal (up and down).
 * - Wheel: Dolly (forward and back).
 * Pan, Tilt and Pedestal change their settings, so a drag is one Undo step;
 * Truck and Dolly move the camera's place, as the Dolly and Truck speeds do.
 * It does nothing while the Camera effect is off or "active" says no.
 * Returns a function that removes it.
 */
export function attachCameraDrag(canvas: HTMLCanvasElement, engine: Engine, active: () => boolean) {
  const on = () => active() && Boolean(engine.state.groups.camera);
  let drag: { id: number; x: number; y: number; move: boolean } | null = null;

  /** Where the setting is now: a range's held or moving value, else its value. */
  const current = (key: ParamKey) => {
    const param = engine.params[key];
    return param.on ? engine.heldValue(key) ?? engine.live(key) : param.value;
  };

  /** Sets a setting the way a MIDI knob does: it glides there, and a range holds there. */
  const set = (key: ParamKey, next: number) => {
    if (engine.bypassedParams.has(key)) return;
    const param = engine.params[key];
    const value = key === "cameraPan" ? ((next % 360) + 360) % 360 : Math.min(param.max, Math.max(param.min, next));
    if (param.on) {
      engine.holdRange(key, value);
    } else {
      if (value === param.value) return;
      param.value = value;
      engine.follow(key);
      engine.paramChanged(key);
    }
    engine.wake();
  };

  /** About how far the land at the middle of the picture is (screen heights), so a move there follows the mouse. */
  const groundDistance = () => {
    const tilt = engine.live("cameraTilt") * DEGREES;
    return engine.live("cameraPedestal") / Math.max(Math.sin(-tilt), 0.25);
  };

  const down = (event: PointerEvent) => {
    if (!on() || (event.button !== 0 && event.button !== 2) || drag) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, move: event.button === 2 || event.shiftKey };
    canvas.setPointerCapture(event.pointerId);
    canvas.classList.add("camera-dragging");
  };

  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (dx === 0 && dy === 0) return;
    const height = Math.max(1, canvas.clientHeight);
    /* One pixel of the picture's height, as an angle through the lens. */
    const lens = engine.live("cameraLens") * DEGREES;
    const perPixel = (2 * Math.tan(lens / 2)) / height;
    if (!drag.move) {
      set("cameraPan", current("cameraPan") + (dx * perPixel) / DEGREES);
      set("cameraTilt", current("cameraTilt") + (dy * perPixel) / DEGREES);
      return;
    }
    if (dx !== 0 && !engine.bypassedParams.has("cameraTruck")) {
      const pan = engine.live("cameraPan") * DEGREES;
      const across = dx * perPixel * groundDistance();
      engine.state.cameraX -= Math.sin(pan) * across;
      engine.state.cameraY += Math.cos(pan) * across;
      engine.wake();
    }
    if (dy !== 0) set("cameraPedestal", current("cameraPedestal") * Math.exp((dy / height) * 1.5));
  };

  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
    canvas.classList.remove("camera-dragging");
  };

  const wheel = (event: WheelEvent) => {
    if (!on() || engine.bypassedParams.has("cameraDolly")) return;
    event.preventDefault();
    /* One wheel notch (100) moves a tenth of the way to the land at the middle of the picture. */
    const notches = event.deltaMode === 1 ? event.deltaY / 3 : event.deltaMode === 2 ? event.deltaY * 3 : event.deltaY / 100;
    const ahead = -notches * 0.1 * groundDistance();
    const pan = engine.live("cameraPan") * DEGREES;
    engine.state.cameraX += Math.cos(pan) * ahead;
    engine.state.cameraY += Math.sin(pan) * ahead;
    engine.wake();
  };

  /* The right button drags; it opens no menu here. */
  const contextMenu = (event: MouseEvent) => { if (on()) event.preventDefault(); };

  canvas.addEventListener("pointerdown", down);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", up);
  canvas.addEventListener("pointercancel", up);
  canvas.addEventListener("lostpointercapture", up);
  canvas.addEventListener("wheel", wheel, { passive: false });
  canvas.addEventListener("contextmenu", contextMenu);
  return () => {
    canvas.removeEventListener("pointerdown", down);
    canvas.removeEventListener("pointermove", move);
    canvas.removeEventListener("pointerup", up);
    canvas.removeEventListener("pointercancel", up);
    canvas.removeEventListener("lostpointercapture", up);
    canvas.removeEventListener("wheel", wheel);
    canvas.removeEventListener("contextmenu", contextMenu);
    canvas.classList.remove("camera-dragging");
  };
}
