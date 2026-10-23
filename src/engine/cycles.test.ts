import { describe, expect, it } from "vitest";
import { BOUNDS, CycleSim, INSTANCE_FLOATS, type CycleSettings } from "./cycles";

/** The same random numbers on every run (mulberry32). */
function seeded(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ASPECT = 16 / 9;
const settings = (changes: Partial<CycleSettings> = {}): CycleSettings => ({
  move: 0, count: 1, speed: 0.5, width: 0.002, length: Infinity, turns: 0, follow: 0, dodge: 0, grid: 0.02, paint: 0, repeat: 1, ...changes
});

/** A simulation with the given cycles only (place and angle), ready to step. */
function withCycles(s: CycleSettings, starts: [number, number, number][]) {
  const sim = new CycleSim(seeded(7));
  sim.step(0, s, ASPECT, null);
  const cycles = starts.map(([x, y, angle]) => sim.start(x, y, angle, s)!);
  sim.cycles.push(...cycles);
  return { sim, cycles };
}

const run = (sim: CycleSim, s: CycleSettings, seconds: number) => {
  for (let t = 0; t < seconds; t += 1 / 60) sim.step(1 / 60, s, ASPECT, null);
};

describe("light cycles", () => {
  it("crash into another cycle's line, and the crashed line frees its place", () => {
    const s = settings({ count: 2 });
    const { sim, cycles: [east, north] } = withCycles(s, [[0.5, 0.5, 0], [0.6, 0.3, Math.PI / 2]]);
    run(sim, s, 0.15);
    const northLine = sim.lineAt(0.6, 0.35);
    expect(northLine).not.toBe(0);
    run(sim, s, 0.35);
    expect(sim.cycles).toContain(east);
    expect(sim.cycles).not.toContain(north);
    expect(sim.lineAt(0.6, 0.35)).not.toBe(northLine);
    expect(sim.lineAt(0.7, 0.5)).toBe(sim.lineAt(0.55, 0.5));
  });

  it("crash into their own line", () => {
    const s = settings({ move: 1, speed: 0.3 });
    const { sim, cycles: [cycle] } = withCycles(s, [[0.8, 0.5, 0]]);
    cycle.spin = 10;
    run(sim, s, 1);
    expect(sim.cycles).not.toContain(cycle);
  });

  it("drive past the screen, and die at the edge of the space past it", () => {
    const s = settings({ speed: 1 });
    const { sim, cycles: [cycle] } = withCycles(s, [[ASPECT - 0.05, 0.5, 0]]);
    run(sim, s, 0.2);
    expect(sim.cycles).toContain(cycle);
    expect(cycle.x).toBeGreaterThan(ASPECT);
    run(sim, s, ASPECT * BOUNDS);
    expect(sim.cycles).not.toContain(cycle);
  });

  it("free the cells of a line that has faded", () => {
    const s = settings({ length: 0.2 });
    const { sim, cycles: [cycle] } = withCycles(s, [[0.2, 0.5, 0]]);
    run(sim, s, 1);
    expect(sim.lineAt(0.2, 0.5)).toBe(0);
    expect(sim.lineAt(cycle.x - 0.01, 0.5)).not.toBe(0);
  });

  it("keep grid lines straight, with right-angle turns on the lanes", () => {
    const s = settings({ count: 20, turns: 4, dodge: 1 });
    const sim = new CycleSim(seeded(3));
    for (let frame = 0; frame < 120; frame++) sim.step(1 / 60, s, ASPECT, null);
    let corners = 0;
    for (const { line } of sim.cycles) {
      const p = line.points;
      for (let i = line.first; i + 6 < p.length; i += 6) {
        expect(Math.min(Math.abs(p[i + 6] - p[i]), Math.abs(p[i + 7] - p[i + 1]))).toBeLessThan(1e-9);
      }
      corners += p.length / 6;
    }
    expect(corners).toBeGreaterThan(20);
  });

  it("give a trail's points places on the gradient by age, and one place per cycle", () => {
    const along = settings({ paint: 1, repeat: 2, length: 4 });
    const { sim } = withCycles(along, [[0.2, 0.5, 0]]);
    run(sim, along, 1);
    const out = new Float32Array(100 * INSTANCE_FLOATS);
    const count = sim.writeInstances(out, 100, along, 0);
    /* The newest end is at the head (age 0); the oldest point is about 1 second old: 2 trips per 4 seconds. */
    expect(out[(count - 1) * INSTANCE_FLOATS + 15]).toBeCloseTo(0, 5);
    expect(out[14]).toBeGreaterThan(0.4);
    expect(out[14]).toBeLessThan(0.55);
    const perCycle = settings({ paint: 0 });
    sim.writeInstances(out, 100, perCycle, 0);
    expect(out[14]).toBe(out[(count - 1) * INSTANCE_FLOATS + 15]);
  });

  it("write one instance per line segment, and one per head", () => {
    const s = settings({ count: 3 });
    const sim = new CycleSim(seeded(5));
    for (let frame = 0; frame < 30; frame++) sim.step(1 / 60, s, ASPECT, null);
    const out = new Float32Array(1000 * INSTANCE_FLOATS);
    const lines = sim.writeInstances(out, 1000, s, 0);
    const segments = sim.cycles.reduce((sum, { line }) => sum + (line.points.length - line.first) / 6, 0);
    expect(lines).toBe(segments);
    expect(sim.writeInstances(out, 1000, s, 0.5)).toBe(segments + sim.cycles.length);
    expect(sim.writeInstances(out, 2, s, 0.5)).toBe(2);
  });
});
