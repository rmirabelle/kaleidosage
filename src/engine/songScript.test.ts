import { describe, expect, it } from "vitest";
import { compileScript, positionAt, pulseAt, speedAt, travelAt, type SongAnalysis } from "./songScript";

const RATE = 100;

/**
 * A 20-second song at 120 BPM: silent for 4 seconds, then a crescendo to
 * full intensity at 16 seconds. A kick lands 5 ms after each beat from 4 s.
 * The whole song is one part, at the "rising" level: settings move 85% of
 * the way, beats pulse at 80%, and the pace is as the intensity gives it.
 */
function song(): SongAnalysis {
  const frames = 20 * RATE;
  const intensity = Array.from({ length: frames }, (_, i) => Math.min(1, Math.max(0, (i / RATE - 4) / 12)));
  const beats = Array.from({ length: 40 }, (_, i) => i * 0.5);
  const zeros = new Array<number>(frames).fill(0);
  return {
    version: 1,
    duration: 20,
    tempo: 120,
    beats,
    downbeats: beats.filter((_, i) => i % 4 === 0),
    curveRate: RATE,
    curves: {
      loudness: zeros, loudnessShort: zeros, intensity, intensityLocal: intensity,
      bass: zeros, mids: zeros, highs: zeros, brightness: zeros, onsets: zeros
    },
    hits: { kick: beats.filter((beat) => beat >= 4).map((beat) => ({ time: beat + 0.005, strength: 0.8 })), snare: [], hats: [] },
    /* One chorus: one part at the "rising" level (see songPlan.ts), with no drop. */
    sections: [{ start: 0, end: 20, label: "chorus" }]
  };
}

describe("song script", () => {
  const script = compileScript(song());

  it("moves glow and scale with the crescendo", () => {
    for (const family of ["glow", "scale", "complexity"] as const) {
      expect(positionAt(script, family, 2)).toBe(0);
      expect(positionAt(script, family, 10)).toBeGreaterThan(0.25);
      expect(positionAt(script, family, 18)).toBeGreaterThan(0.5);
    }
  });

  it("times each pulse by its kick, and gives beats with no kick a weak pulse", () => {
    expect(script.pulses[8]).toEqual({ time: 4.005, strength: 1 });
    expect(script.pulses[9]).toEqual({ time: 4.505, strength: 0.8 });
    expect(script.pulses[1]).toEqual({ time: 0.5, strength: 0.4 });
  });

  it("pulses on the kick and falls away before the next beat", () => {
    expect(pulseAt(script, 18.5)).toBeLessThan(0.1);
    expect(pulseAt(script, 18.515)).toBeGreaterThan(0.75);
    expect(pulseAt(script, 18.95)).toBeLessThan(0.1);
  });

  it("has no pulses in soft parts", () => {
    expect(positionAt(script, "glow", 2.005)).toBe(0);
    expect(positionAt(script, "glow", 18.515) - positionAt(script, "glow", 18.95)).toBeGreaterThan(0.15);
  });

  it("knows how far animation time has run at any time, for a jump in the song", () => {
    /* A fine sum of the pace, 1 ms at a time, to 12 seconds. */
    let sum = 0;
    for (let t = 0; t < 12; t += 0.001) sum += speedAt(script, t + 0.0005) * 0.001;
    expect(travelAt(script, 12)).toBeCloseTo(sum, 1);
    expect(travelAt(script, 0)).toBe(0);
    expect(travelAt(script, 19) - travelAt(script, 18)).toBeCloseTo(1.7, 1);
  });

  it("runs animation time slowly in soft parts and fast in loud parts", () => {
    expect(speedAt(script, 2)).toBeCloseTo(0.3);
    expect(speedAt(script, 19)).toBeCloseTo(1.7);
  });
});
