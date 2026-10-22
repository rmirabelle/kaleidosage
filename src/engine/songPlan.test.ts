import { describe, expect, it } from "vitest";
import { planSong } from "./songPlan";
import { compileScript, positionAt, speedAt, type SongAnalysis } from "./songScript";

const RATE = 100;

/**
 * A 40-second song at 120 BPM (a bar is 2 seconds): a quiet intro (0–8 s),
 * a verse (8–16 s) that builds, one quiet beat (15.5–16 s), then a loud
 * chorus with heavy bass (16–32 s) and a soft outro (32–40 s).
 */
function song(): SongAnalysis {
  const frames = 40 * RATE;
  const at = (i: number) => i / RATE;
  const intensity = Array.from({ length: frames }, (_, i) => {
    const t = at(i);
    return t < 8 ? 0.1 : t < 16 ? 0.3 + 0.3 * (t - 8) / 8 : t < 32 ? 1 : 0.2;
  });
  const bass = Array.from({ length: frames }, (_, i) => (at(i) >= 16 && at(i) < 32 ? 0.9 : 0.2));
  const loudness = Array.from({ length: frames }, (_, i) => (at(i) >= 15.5 && at(i) < 16 ? -45 : -20));
  const beats = Array.from({ length: 80 }, (_, i) => i * 0.5);
  const zeros = new Array<number>(frames).fill(0);
  return {
    version: 2,
    duration: 40,
    tempo: 120,
    beats,
    downbeats: beats.filter((_, i) => i % 4 === 0),
    curveRate: RATE,
    curves: {
      loudness, loudnessShort: loudness, intensity, intensityLocal: intensity,
      bass, mids: zeros, highs: zeros, brightness: zeros, onsets: zeros
    },
    hits: { kick: [], snare: [], hats: [] },
    /* LinkSeg's boundaries are between beats, so they are a little off the bar starts. */
    sections: [
      { start: 0, end: 8.2, label: "intro" },
      { start: 8.2, end: 15.8, label: "verse" },
      { start: 15.8, end: 32.1, label: "chorus" },
      { start: 32.1, end: 40, label: "outro" }
    ]
  };
}

describe("song plan", () => {
  const plan = planSong(song());

  it("puts each part on a bar start and gives it a level", () => {
    expect(plan.parts.map((part) => [part.start, part.label, part.tier])).toEqual([
      [0, "intro", 0], [8, "verse", 1], [16, "chorus", 3], [32, "outro", 0]
    ]);
  });

  it("finds the drop, the build before it, and the quiet beat", () => {
    expect(plan.drops).toEqual([{ time: 16, strength: 1, buildStart: 8, pauseStart: 15.5 }]);
  });

  it("changes the look at the drop and at each change of level", () => {
    expect(plan.cues).toEqual([{ time: 8, drop: false }, { time: 16, drop: true }, { time: 32, drop: false }]);
  });

  it("keeps the scene at a part with the same level as the part before it", () => {
    const analysis = song();
    analysis.sections.splice(2, 1, { start: 15.8, end: 24.1, label: "chorus" }, { start: 24.1, end: 32.1, label: "chorus" });
    const split = planSong(analysis);
    expect(split.parts.map((part) => [part.start, part.tier, Boolean(part.keepScene)])).toEqual([[0, 0, false], [8, 1, false], [16, 3, false], [24, 3, true], [32, 0, false]]);
    expect(split.cues).toEqual([{ time: 8, drop: false }, { time: 16, drop: true }, { time: 32, drop: false }]);
  });

  it("joins a part that is too short to the part before it", () => {
    const analysis = song();
    analysis.sections.splice(2, 0, { start: 15.8, end: 16.9, label: "bridge" });
    analysis.sections[3].start = 16.9;
    expect(planSong(analysis).parts.map((part) => part.label)).toEqual(["intro", "verse", "bridge", "outro"]);
  });
});

describe("song shape", () => {
  const script = compileScript(song());

  it("rises toward the drop, goes dark in the quiet beat, and hits on the drop", () => {
    expect(positionAt(script, "scale", 15) - positionAt(script, "scale", 9)).toBeGreaterThan(0.2);
    expect(positionAt(script, "glow", 15.75)).toBe(0);
    expect(speedAt(script, 15.75)).toBe(0);
    expect(positionAt(script, "glow", 16.05)).toBeGreaterThan(0.95);
    expect(speedAt(script, 16.05)).toBeGreaterThan(2.5);
  });

  it("lets the hit fade over about a bar", () => {
    expect(positionAt(script, "glow", 18)).toBeLessThan(positionAt(script, "glow", 16.05) - 0.2);
  });

  it("keeps a calm part small and slow", () => {
    expect(positionAt(script, "scale", 4)).toBeLessThan(0.05);
    expect(speedAt(script, 36)).toBeLessThan(0.5);
  });
});
