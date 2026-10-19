import { useEffect, useRef } from "react";
import type { Engine } from "../engine/engine";
import type { PassName } from "../engine/gpuTimer";

const PASS_LABELS: Record<PassName, string> = { fold: "Warp, map, fold", refold: "Later shape FX", blur: "Blur", trails: "Trails", smear: "Time smear", contours: "Contours", relief: "Relief", driver: "Driver", camera: "Camera", sort: "Pixel sort", particles: "Particles", rays: "Light rays", bloom: "Bloom", finish: "Final effects" };
/** The display updates a few times per second, so the numbers can be read. */
const UPDATE_MS = 250;

/**
 * Performance numbers over the picture. The time between frames shows
 * dropped frames; the GPU times show which drawing step costs the most.
 */
export function StatsOverlay({ engine }: { engine: Engine }) {
  const textRef = useRef<HTMLPreElement>(null);

  useEffect(() => {
    engine.timer.enabled = true;
    let last = 0;
    const stop = engine.onFrame(() => {
      const now = performance.now();
      if (now - last < UPDATE_MS || !textRef.current) return;
      last = now;
      const { frameMs, cpuMs } = engine.stats;
      const info = engine.renderInfo;
      const fps = frameMs > 0 ? 1000 / frameMs : 0;
      const lines = [
        `${fps.toFixed(0).padStart(3)} fps   ${frameMs.toFixed(1)} ms per frame`,
        `CPU      ${cpuMs.toFixed(2)} ms`
      ];
      if (engine.timer.supported) {
        let total = 0;
        for (const pass of Object.keys(PASS_LABELS) as PassName[]) {
          const ms = engine.timer.times[pass];
          if (ms === undefined) continue;
          total += ms;
          lines.push(`GPU      ${ms.toFixed(2).padStart(6)} ms  ${PASS_LABELS[pass]}`);
        }
        lines.push(`GPU      ${total.toFixed(2).padStart(6)} ms  total`);
      } else {
        lines.push("GPU      timing not available here");
      }
      lines.push(`Canvas   ${info.width} × ${info.height}`);
      lines.push(`Texture  ${info.textureWidth} × ${info.textureHeight} (with blur border)`);
      lines.push(`Blur     ${info.blurSamples} samples per pixel`);
      lines.push(`Shape    ${info.shapeVersions} ${info.shapeVersions === 1 ? "version" : "versions"} per pixel (opacity, blend)`);
      textRef.current.textContent = lines.join("\n");
    });
    return () => {
      stop();
      engine.timer.enabled = false;
    };
  }, [engine]);

  return <pre className="stats-overlay selectable" ref={textRef} />;
}
