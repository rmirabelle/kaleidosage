import { describe, expect, it } from "vitest";
import { AudioAnalyzer, FLOOR_DB, TOP_DB, followPush, levelAbove, pushRange, pushedValue, readSound, soundList } from "./audio";
import { createParams } from "./params";

const RATE = 48000;

/** "seconds" of samples from "wave", a function of time in seconds. */
function signal(seconds: number, wave: (time: number) => number, start = 0) {
  const samples = new Float32Array(Math.round(seconds * RATE));
  for (let index = 0; index < samples.length; index++) samples[index] = wave(start + index / RATE);
  return samples;
}

const sine = (hz: number, amplitude = 0.5) => (time: number) => amplitude * Math.sin(2 * Math.PI * hz * time);

/** The amplitude of a sine wave whose peak is "decibels" dBFS. */
const amplitudeAt = (decibels: number) => 10 ** (decibels / 20);

describe("AudioAnalyzer", () => {
  it("gives the floor, zero levels and no beats for silence", () => {
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.push(signal(2, () => 0));
    expect(analyzer.levels).toEqual({ level: 0, bass: 0, mids: 0, highs: 0 });
    expect(analyzer.decibels.level).toBe(FLOOR_DB);
    expect(analyzer.beats).toBe(0);
  });

  it("measures each band's peak in dBFS", () => {
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.push(signal(1, sine(1000, amplitudeAt(-26))));
    expect(analyzer.decibels.level).toBeCloseTo(-26, 0);
    expect(analyzer.decibels.mids).toBeCloseTo(-26, 0);
  });

  it("puts a bass tone in the bass band, far above the others", () => {
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.push(signal(2, sine(60)));
    expect(analyzer.decibels.bass).toBeGreaterThan(-12);
    expect(analyzer.decibels.mids).toBeLessThan(analyzer.decibels.bass - 40);
    expect(analyzer.decibels.highs).toBe(FLOOR_DB);
  });

  it("puts a high tone in the highs band, far above the others", () => {
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.push(signal(1, sine(5000)));
    expect(analyzer.decibels.highs).toBeGreaterThan(-12);
    expect(analyzer.decibels.mids).toBeLessThan(analyzer.decibels.highs - 40);
    expect(analyzer.decibels.bass).toBe(FLOOR_DB);
  });

  it("moves nothing below the threshold, and moves in proportion above it", () => {
    /* A whisper at -26 dB: at a -20 dB threshold nothing moves; at -40 dB it moves a little over half way to TOP_DB. */
    const whisper = (thresholdDb: number) => {
      const analyzer = new AudioAnalyzer(RATE);
      analyzer.thresholdDb = thresholdDb;
      analyzer.push(signal(1, sine(1000, amplitudeAt(-26))));
      return analyzer.levels.mids;
    };
    expect(whisper(-20)).toBe(0);
    expect(whisper(-40)).toBeCloseTo((-26 + 40) / (TOP_DB + 40), 1);
  });

  it("adds the gain to the loudness", () => {
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.gainDb = 10;
    analyzer.push(signal(1, sine(1000, amplitudeAt(-30))));
    expect(analyzer.decibels.mids).toBeCloseTo(-20, 0);
  });

  it("lets the loudness fall after the sound stops", () => {
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.push(signal(1, sine(60)));
    analyzer.push(signal(0.6, () => 0));
    expect(analyzer.levels.bass).toBe(0);
  });

  it("shows a new sound within a few milliseconds", () => {
    /** The milliseconds until "band" is half way from the threshold to the top, after a loud second and half a second of silence. */
    const reaction = (band: "mids" | "bass", hz: number) => {
      const analyzer = new AudioAnalyzer(RATE);
      analyzer.push(signal(1, sine(hz)));
      analyzer.push(signal(0.5, () => 0));
      for (let ms = 0; ms < 100; ms++) {
        analyzer.push(signal(0.001, sine(hz), ms / 1000));
        if (analyzer.levels[band] > 0.5) return ms + 1;
      }
      return Infinity;
    };
    expect(reaction("mids", 1000)).toBeLessThanOrEqual(5);
    /* A bass tone needs part of its own cycle (17 ms at 60 Hz) and the steep filter's delay. */
    expect(reaction("bass", 60)).toBeLessThanOrEqual(12);
  });

  it("counts a beat for each kick drum hit, and none for a steady tone", () => {
    /* A kick every half second (120 BPM): 60 Hz for 60 ms, over a quiet bass line at 80 Hz. */
    const kick = (time: number) => (time % 0.5 < 0.06 ? sine(60, 0.8)(time) : 0) + sine(80, 0.05)(time);
    const kicks = new AudioAnalyzer(RATE);
    kicks.push(signal(4, kick));
    expect(kicks.beats).toBeGreaterThanOrEqual(7);
    expect(kicks.beats).toBeLessThanOrEqual(8);

    const steady = new AudioAnalyzer(RATE);
    steady.push(signal(4, sine(60)));
    /* Only the start of the tone counts. */
    expect(steady.beats).toBeLessThanOrEqual(1);
  });

  it("counts no beats below the threshold", () => {
    const kick = (time: number) => (time % 0.5 < 0.06 ? sine(60, amplitudeAt(-50))(time) : 0);
    const analyzer = new AudioAnalyzer(RATE);
    analyzer.thresholdDb = -40;
    analyzer.push(signal(4, kick));
    expect(analyzer.beats).toBe(0);
  });

  it("finds the clear hits by itself: soft kicks count alone, but not between hard kicks", () => {
    /** Kicks every quarter second over a bass line, each "over" dB above it in turn. */
    const beats = (pattern: number[]) => {
      const line = 0.05;
      const kick = (time: number) => {
        const over = pattern[Math.floor(time / 0.25) % pattern.length];
        return time % 0.25 < 0.05 ? sine(60, line * 10 ** (over / 20))(time) : sine(60, line)(time);
      };
      const analyzer = new AudioAnalyzer(RATE);
      analyzer.push(signal(6, kick));
      return analyzer.beats;
    };
    /* 24 kicks in 6 seconds. */
    expect(beats([6])).toBeGreaterThanOrEqual(22);
    /* Hard kicks (24 dB) and soft ones (6 dB) in turn: only the 12 hard ones count. */
    expect(beats([24, 6])).toBeGreaterThanOrEqual(11);
    expect(beats([24, 6])).toBeLessThanOrEqual(13);
  });

  it("gives the same result for any block size", () => {
    const samples = signal(1, (time) => sine(60)(time) + sine(3000, 0.2)(time));
    const whole = new AudioAnalyzer(RATE);
    whole.push(samples);
    const pieces = new AudioAnalyzer(RATE);
    for (let start = 0; start < samples.length; start += 777) pieces.push(samples.subarray(start, start + 777));
    expect(pieces.levels).toEqual(whole.levels);
    expect(pieces.decibels).toEqual(whole.decibels);
    expect(pieces.beats).toBe(whole.beats);
  });
});

describe("audio links", () => {
  it("follow a band above their own threshold", () => {
    expect(levelAbove(-30, -40)).toBeCloseTo(10 / (TOP_DB + 40));
    /* A link 12 dB above the -40 dB Threshold: -30 dB moves nothing. */
    expect(levelAbove(-30, -28)).toBe(0);
    expect(levelAbove(0, -40)).toBe(1);
    /* A threshold above TOP_DB still has room: half way at 3 dB above it. */
    expect(levelAbove(-3, -6)).toBeCloseTo(0.5);
    expect(levelAbove(3, 0)).toBeCloseTo(0.5);
  });

  it("rise at once and fall back over the release", () => {
    expect(followPush(0.2, 0.9, 0.01, 0.25)).toBe(0.9);
    /* After one release time, about a third of the way is left. */
    expect(followPush(1, 0, 0.25, 0.25)).toBeCloseTo(Math.exp(-1));
    /* A longer release falls slower over the same time. */
    expect(followPush(1, 0, 0.1, 1)).toBeGreaterThan(followPush(1, 0, 0.1, 0.25));
  });

  it("push a value part of the way to its end, in slider positions", () => {
    const params = createParams();
    expect(pushedValue(params.zoom, 1, 3, 0)).toBe(1);
    expect(pushedValue(params.zoom, 1, 3, 0.5)).toBeCloseTo(2);
    expect(pushedValue(params.zoom, 1, 3, 2)).toBeCloseTo(3);
    /* A log slider moves in equal ratios: half way from 1 to 16 is 4. */
    expect(pushedValue(params.sortThickness, 1, 16, 0.5)).toBeCloseTo(4);
  });

  it("push a range from its start handle to its end handle, and a single value to the side with more room", () => {
    const params = createParams();
    Object.assign(params.zoom, { on: true, low: 2, high: 1 });
    expect(pushRange(params.zoom)).toEqual({ rest: 2, end: 1 });
    const { min, max } = params.panX;
    Object.assign(params.panX, { on: false, value: min + (max - min) * 0.8 });
    expect(pushRange(params.panX)).toEqual({ rest: params.panX.value, end: min });
    params.panX.value = min + (max - min) * 0.2;
    expect(pushRange(params.panX).end).toBe(max);
    /* A tie goes to the maximum. */
    params.panX.value = (min + max) / 2;
    expect(pushRange(params.panX).end).toBe(max);
  });

  it("list the switched-on settings in setting order, whatever order they were switched on in", () => {
    expect(soundList({ zoom: true, panX: true })).toEqual(soundList({ panX: true, zoom: true }));
    expect(soundList({ panX: true, zoom: true })).toEqual(["zoom", "panX"]);
  });

  it("read the switched-on settings from a scene file, and an older file's links as switches", () => {
    const params = createParams();
    expect(readSound(["zoom", "panX", "cycle", "noSuchSetting", 7], undefined, params)).toEqual({ zoom: true, panX: true });
    /* An older scene's links: every linked setting that can move has its switch on; the link's source and range are left out. */
    expect(readSound(undefined, [["zoom", "bass", 0.4], ["panX", "kick", 1, 2, -6], ["cycle", "bass", 0.5], "broken"], params)).toEqual({ zoom: true, panX: true });
    /* "sound" wins over old links, and nothing gives none. */
    expect(readSound(["twirl"], [["zoom", "bass", 0.4]], params)).toEqual({ twirl: true });
    expect(readSound(undefined, undefined, params)).toEqual({});
  });
});
