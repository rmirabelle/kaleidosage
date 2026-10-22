import { describe, expect, it } from "vitest";
import { SongClock, type ClockReading } from "./songClock";

/** A clock on a fake audio element: "reading" is what currentTime gives, and "now" the real time. */
function setup(latency = 0) {
  const state = { now: 0, reading: { position: 0, playing: true, latency } as ClockReading };
  const clock = new SongClock(() => state.reading, () => state.now);
  return { state, clock };
}

describe("SongClock", () => {
  it("runs smoothly between the audio element's uneven steps", () => {
    const { state, clock } = setup();
    clock.time();
    const times: number[] = [];
    /* 60 frames a second; currentTime moves only every 50 ms. */
    for (let frame = 1; frame <= 120; frame++) {
      state.now = frame / 60;
      state.reading.position = Math.floor(state.now / 0.05) * 0.05;
      times.push(clock.time());
    }
    const steps = times.slice(60).map((time, i) => time - times[59 + i]);
    for (const step of steps) expect(step).toBeGreaterThan(0.01);
    expect(Math.abs(times[119] - 2)).toBeLessThan(0.05);
  });

  it("jumps at once to a seek", () => {
    const { state, clock } = setup();
    clock.time();
    state.now = 1 / 60;
    state.reading.position = 30;
    expect(clock.time()).toBeCloseTo(30.01);
    expect(clock.stats.jumps).toBe(1);
  });

  it("takes off the output latency and adds the lead", () => {
    const { state, clock } = setup(0.04);
    state.reading.position = 10;
    state.reading.playing = false;
    expect(clock.time()).toBeCloseTo(9.97);
  });
});
