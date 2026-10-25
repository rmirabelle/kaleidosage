import type { Engine } from "../engine/engine";
import type { ParamKey } from "../engine/params";

/**
 * Dev only, for a bug hunt (2026-10-25: scenes whose picture stops or goes
 * black while their settings still move): every 2 seconds, right after a
 * frame, writes the engine's clocks, the effects in the list, a few live
 * values and five canvas pixels to the dev log ("[client] probe ...").
 * Remove it once the bug is found.
 */
const KEYS: ParamKey[] = ["rotation", "zoom", "mobiusPoint", "warpAmount", "trailAmount", "trailZoom", "trailFlow", "overlayOpacity", "exposure", "blackLevel"];

export function startFrameProbe(engine: Engine): () => void {
  const hot = import.meta.hot;
  if (!hot) return () => {};
  const inside = engine as unknown as {
    state: Engine["state"];
    songTime: number;
    gated: boolean;
    fade: unknown;
    speed: number;
    renderer: { gl: WebGL2RenderingContext };
  };
  let last = 0;
  let lastPixels = "";
  return engine.onFrame(() => {
    const now = performance.now();
    if (now - last < 2000) return;
    last = now;
    const gl = inside.renderer.gl;
    const { drawingBufferWidth: w, drawingBufferHeight: h } = gl;
    const pixel = new Uint8Array(4);
    const pixels = [[0.5, 0.5], [0.25, 0.25], [0.75, 0.25], [0.25, 0.75], [0.75, 0.75]].map(([x, y]) => {
      gl.readPixels(Math.floor(w * x), Math.floor(h * y), 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
      return Array.from(pixel.slice(0, 3)).join(",");
    }).join(" ");
    const state = inside.state;
    const values = KEYS.map((key) => `${key}=${Number(engine.live(key)).toPrecision(4)}`).join(" ");
    const line = [
      `probe drew=${engine.stats.drawing} glError=${gl.getError()} lost=${gl.isContextLost()} size=${w}x${h}`,
      `time=${state.time.toFixed(3)} clock=${state.clock.toFixed(3)} paused=${state.paused} gated=${inside.gated} script=${Boolean(engine.script)} songTime=${inside.songTime.toFixed(2)} speed=${inside.speed} fade=${Boolean(inside.fade)}`,
      `fx=${state.fxOrder.join(",")} sound=${Object.keys(state.sound).join(",")}`,
      values,
      `pixels=${pixels}${pixels === lastPixels ? " (same as last)" : ""}`
    ].join(" | ");
    lastPixels = pixels;
    hot.send("kaleidosage:log", { message: line });
  });
}
