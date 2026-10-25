import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle, Gauge, Warning, WarningOctagon } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { PassName } from "../engine/gpuTimer";
import { songFollow } from "../lib/songFollow";

const PASS_LABELS: Record<PassName, string> = { fold: "Warp, map, fold", refold: "Later shape FX", blur: "Blur", trails: "Trails", smear: "Time smear", contours: "Contours", relief: "Relief", driver: "Driver", camera: "Camera", solid: "3D object", sort: "Pixel sort", particles: "Particles", cycles: "Light cycles", rays: "Light rays", lasers: "Lasers", bloom: "Bloom", sharpen: "Sharpen", color: "Color", levels: "Levels" };
/** The panel updates a few times per second, so the numbers can be read. */
const UPDATE_MS = 250;
/** The FPS chart's length: one sample per update. */
const HISTORY = 120;
/**
 * Common screen refresh rates. The chart's line is the nearest one at or
 * above the usual fast frame rate: the 90th percentile of the samples, so
 * one odd sample (a burst of frames after a stall, as when the panel
 * opens) does not move it.
 */
const REFRESH_RATES = [60, 75, 90, 100, 120, 144, 165, 240];

function refreshRate(samples: readonly number[]) {
  const sorted = [...samples].sort((a, b) => a - b);
  const usual = sorted[Math.floor((sorted.length - 1) * 0.9)] ?? 60;
  return REFRESH_RATES.find((rate) => rate >= usual * 0.95) ?? REFRESH_RATES[REFRESH_RATES.length - 1];
}

interface Snapshot {
  fps: number;
  frameMs: number;
  slowestMs: number;
  cpuMs: number;
  drawing: boolean;
  gpuMs: number | null;
  passes: [string, number][];
  gpuBytes: number;
  heap: { used: number; limit: number } | null;
  info: { width: number; height: number; blurSamples: number; shapeVersions: number };
  /** The song clock's numbers while the picture follows a song (see songClock.ts), or null. */
  song: { latencyMs: number; jitterMs: number; jumps: number } | null;
}

/** Chromium's heap size (WebView2 has it; other browsers do not). */
const heapNow = () => {
  const memory = (performance as Performance & { memory?: { usedJSHeapSize: number; jsHeapSizeLimit: number } }).memory;
  return memory ? { used: memory.usedJSHeapSize, limit: memory.jsHeapSizeLimit } : null;
};

const megabytes = (bytes: number) => bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : `${Math.round(bytes / 1024 ** 2)} MB`;

/**
 * Smooth from 55 fps, fair from 30, slow below: fixed steps, so the grade
 * does not depend on a guess of the screen's refresh rate. Status colors
 * come with an icon and a word.
 */
function frameStatus(fps: number) {
  if (fps >= 55) return { name: "Smooth", tone: "good", icon: <CheckCircle size={14} weight="fill" /> };
  if (fps >= 30) return { name: "Fair", tone: "warning", icon: <Warning size={14} weight="fill" /> };
  return { name: "Slow", tone: "critical", icon: <WarningOctagon size={14} weight="fill" /> };
}

/**
 * The performance panel over the picture: the frame rate as the main
 * number with its state, a chart of the last 30 seconds, the GPU and JS
 * memory, the CPU and GPU time of a frame, and the GPU time of each
 * drawing step, in a fixed order (the rows do not move as times change). While paused with nothing changing, the app does not draw
 * (see needsDraw in engine.ts); the panel then says it rests.
 */
export function StatsOverlay({ engine }: { engine: Engine }) {
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [history, setHistory] = useState<number[]>([]);

  useEffect(() => {
    engine.timer.enabled = true;
    let windowStart = performance.now();
    let previous = windowStart;
    let frames = 0;
    let slowest = 0;
    const stop = engine.onFrame(() => {
      const now = performance.now();
      frames++;
      slowest = Math.max(slowest, now - previous);
      previous = now;
      if (now - windowStart < UPDATE_MS) return;
      const fps = frames * 1000 / (now - windowStart);
      const passes = (Object.keys(PASS_LABELS) as PassName[])
        .flatMap((pass) => engine.timer.times[pass] === undefined ? [] : [[PASS_LABELS[pass], engine.timer.times[pass]!] as [string, number]]);
      const info = engine.renderInfo;
      setSnapshot({
        fps,
        frameMs: engine.stats.frameMs,
        slowestMs: slowest,
        cpuMs: engine.stats.cpuMs,
        drawing: engine.stats.drawing,
        gpuMs: engine.timer.supported ? passes.reduce((sum, [, ms]) => sum + ms, 0) : null,
        passes,
        gpuBytes: engine.gpuBytes,
        heap: heapNow(),
        info: { width: info.width, height: info.height, blurSamples: info.blurSamples, shapeVersions: info.shapeVersions },
        song: engine.script ? { ...songFollow.clock.stats } : null
      });
      setHistory((samples) => [...samples, fps].slice(-HISTORY));
      windowStart = now;
      frames = 0;
      slowest = 0;
    });
    return () => {
      stop();
      engine.timer.enabled = false;
    };
  }, [engine]);

  if (!snapshot) return <div className="perf-panel" aria-label="Performance" />;
  const target = refreshRate(history);
  const status = frameStatus(snapshot.fps);
  const slowestPass = Math.max(0, ...snapshot.passes.map(([, ms]) => ms));
  return (
    <section className="perf-panel" aria-label="Performance">
      <header className="perf-header">
        <Gauge size={15} />
        <span>Performance</span>
        <span className={`perf-drawing ${snapshot.drawing ? "on" : ""}`} data-tip={snapshot.drawing ? "The app draws a new picture each frame" : "Paused with nothing changing: the app does not draw, and the GPU rests"}>
          {snapshot.drawing ? "Drawing" : "Resting"}
        </span>
      </header>

      <div className="perf-hero">
        <div className="perf-fps">
          <span className="perf-fps-value">{Math.round(snapshot.fps)}</span>
          <span className="perf-fps-unit">fps</span>
        </div>
        <span className={`perf-status ${status.tone}`}>{status.icon}{status.name}</span>
      </div>
      <div className="perf-sub">{snapshot.frameMs.toFixed(1)} ms per frame · slowest {snapshot.slowestMs.toFixed(1)} ms</div>
      <FpsChart samples={history} target={target} />

      <div className="perf-tiles">
        <Tile label="GPU memory" value={megabytes(snapshot.gpuBytes)} note="Textures, estimated" />
        <Tile
          label="JS memory"
          value={snapshot.heap ? megabytes(snapshot.heap.used) : "Not shown"}
          note={snapshot.heap ? `of ${megabytes(snapshot.heap.limit)}` : "Not in this browser"}
          meter={snapshot.heap ? snapshot.heap.used / snapshot.heap.limit : undefined}
        />
        <Tile label="CPU per frame" value={`${snapshot.cpuMs.toFixed(2)} ms`} />
        <Tile label="GPU per frame" value={snapshot.gpuMs === null ? "Not shown" : `${snapshot.gpuMs.toFixed(2)} ms`} note={snapshot.gpuMs === null ? "No GPU timer here" : undefined} />
      </div>

      {snapshot.passes.length > 0 && (
        <div className="perf-passes">
          <div className="perf-section-title">GPU time per step</div>
          {snapshot.passes.map(([label, ms]) => (
            <div key={label} className="perf-pass" data-tip={`${label}: ${ms.toFixed(2)} ms of GPU time per frame`}>
              <span className="perf-pass-label">{label}</span>
              <span className="perf-pass-track">
                <span className="perf-pass-bar" style={{ width: `${slowestPass > 0 ? Math.max(2, (ms / slowestPass) * 100) : 0}%` }} />
              </span>
              <span className="perf-pass-value">{ms.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <footer className="perf-details">
        {snapshot.info.width} × {snapshot.info.height} · blur {snapshot.info.blurSamples} samples · {snapshot.info.shapeVersions} shape {snapshot.info.shapeVersions === 1 ? "version" : "versions"} per pixel
        {snapshot.song && (
          <div data-tip="Song follow: the time from the music player to the speakers, the mean step of the player's clock that the song clock smooths away, and how many jumps (seeks) it made">
            Song clock: output {snapshot.song.latencyMs.toFixed(0)} ms · jitter {snapshot.song.jitterMs.toFixed(1)} ms · {snapshot.song.jumps} {snapshot.song.jumps === 1 ? "jump" : "jumps"}
          </div>
        )}
      </footer>
    </section>
  );
}

/** One stat: a label, its value, an optional note under it, and an optional meter (a share from 0 to 1). */
function Tile({ label, value, note, meter }: { label: string; value: string; note?: string; meter?: number }) {
  return (
    <div className="perf-tile">
      <span className="perf-tile-label">{label}</span>
      <span className="perf-tile-value">{value}</span>
      {meter !== undefined && (
        <span className={`perf-meter ${meter > 0.85 ? "critical" : meter > 0.6 ? "warning" : ""}`}>
          <span style={{ width: `${Math.min(100, meter * 100)}%` }} />
        </span>
      )}
      {note && <span className="perf-tile-note">{note}</span>}
    </div>
  );
}

const CHART_WIDTH = 276;
const CHART_HEIGHT = 56;

/**
 * The frame rate of the last 30 seconds (one point per update, newest at
 * the right), with a hairline at the screen's refresh rate. Hover shows
 * the value at that time.
 */
function FpsChart({ samples, target }: { samples: number[]; target: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const top = Math.max(target, ...samples) * 1.1;
  const x = (index: number) => CHART_WIDTH - (samples.length - 1 - index) * (CHART_WIDTH / (HISTORY - 1));
  const y = (fps: number) => CHART_HEIGHT - 2 - (fps / top) * (CHART_HEIGHT - 4);
  const line = samples.map((fps, index) => `${index === 0 ? "M" : "L"}${x(index).toFixed(1)},${y(fps).toFixed(1)}`).join("");
  const area = samples.length > 1 ? `${line}L${x(samples.length - 1).toFixed(1)},${CHART_HEIGHT}L${x(0).toFixed(1)},${CHART_HEIGHT}Z` : "";
  const onMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const box = svgRef.current!.getBoundingClientRect();
    const at = ((event.clientX - box.left) / box.width) * CHART_WIDTH;
    const index = Math.round(samples.length - 1 - (CHART_WIDTH - at) / (CHART_WIDTH / (HISTORY - 1)));
    setHover(index >= 0 && index < samples.length ? index : null);
  };
  const hovered = hover !== null ? samples[hover] : undefined;
  return (
    <div className="perf-chart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
        width="100%"
        height={CHART_HEIGHT}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Frame rate over the last 30 seconds; now ${Math.round(samples[samples.length - 1] ?? 0)} fps`}
        onPointerMove={onMove}
        onPointerLeave={() => setHover(null)}
      >
        <line className="perf-chart-target" x1={0} x2={CHART_WIDTH} y1={y(target)} y2={y(target)} />
        {area && <path className="perf-chart-area" d={area} />}
        {line && <path className="perf-chart-line" d={line} />}
        {hover !== null && hovered !== undefined && (
          <>
            <line className="perf-chart-cursor" x1={x(hover)} x2={x(hover)} y1={0} y2={CHART_HEIGHT} />
            <circle className="perf-chart-dot" cx={x(hover)} cy={y(hovered)} r={4} />
          </>
        )}
      </svg>
      <span className="perf-chart-target-label">{target} fps</span>
      {hover !== null && hovered !== undefined && (
        <span className="perf-chart-tip" style={{ left: `${(x(hover) / CHART_WIDTH) * 100}%` }}>
          {Math.round(hovered)} fps · {(((samples.length - 1 - hover) * UPDATE_MS) / 1000).toFixed(1)} s ago
        </span>
      )}
    </div>
  );
}
