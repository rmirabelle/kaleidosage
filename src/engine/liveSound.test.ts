import { describe, expect, it } from "vitest";
import type { AudioSignal } from "./audio";
import { LiveSound } from "./liveSound";
import { BEAT_TRIP } from "./songScript";

/** A sound with this level in every band, and this many beats so far. */
const sound = (level: number, beats: number): AudioSignal => ({
  levels: { level, bass: level, mids: level, highs: level },
  decibels: { level: 0, bass: 0, mids: 0, highs: 0 },
  thresholdDb: -40,
  beats
});

describe("live sound", () => {
  it("follows the level at once and falls back slowly", () => {
    const live = new LiveSound();
    live.step(sound(0.8, 0), 1 / 60);
    expect(live.position("scale")).toBeCloseTo(0.85 * 0.8, 2);
    for (let i = 0; i < 6; i++) live.step(sound(0, 0), 1 / 60);
    expect(live.position("scale")).toBeGreaterThan(0.4);
    for (let i = 0; i < 120; i++) live.step(sound(0, 0), 1 / 60);
    expect(live.position("scale")).toBeLessThan(0.01);
  });

  it("pulses brightness on a beat, more when it is loud", () => {
    const live = new LiveSound();
    live.step(sound(1, 0), 1 / 60);
    const before = live.position("glow");
    live.step(sound(1, 1), 1 / 60);
    expect(live.position("glow") - before).toBeGreaterThan(0.3);
  });

  it("steps a beat-moved setting on each beat, a smaller step when it is soft", () => {
    const loud = new LiveSound();
    const soft = new LiveSound();
    loud.step(sound(1, 0), 1 / 60);
    soft.step(sound(0, 0), 1 / 60);
    for (let i = 0; i < 60; i++) {
      loud.step(sound(1, 1), 1 / 60);
      soft.step(sound(0, 1), 1 / 60);
    }
    expect(loud.travel).toBeCloseTo(1 / BEAT_TRIP, 3);
    expect(soft.travel).toBeCloseTo(0.3 / BEAT_TRIP, 3);
    expect(loud.position("beat")).toBeGreaterThan(0);
  });

  it("rests with no sound", () => {
    const live = new LiveSound();
    live.step(null, 1 / 60);
    for (const family of ["glow", "scale", "complexity", "sparkle", "beat"] as const) expect(live.position(family)).toBe(0);
  });
});
