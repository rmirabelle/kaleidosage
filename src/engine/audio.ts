/**
 * Sound analysis for settings that move with music (see docs/AUDIO.md,
 * part 2). Any source pushes mono samples in; the analyzer keeps four band
 * peaks (in dBFS) and levels from 0 to 1 above a threshold, and
 * counts beats. It works sample by sample, so a new sound shows within a
 * few milliseconds. It has no React and no Web Audio,
 * so tests can feed it made-up signals.
 */

import { PARAM_KEYS, SLIDER_STEPS, toSlider, type Param, type ParamKey, type Params } from "./params";

export type AudioBand = "level" | "bass" | "mids" | "highs";
export const AUDIO_BANDS: readonly AudioBand[] = ["level", "bass", "mids", "highs"];

/**
 * One step of a push (0 to 1) toward "target" over "elapsed" seconds: up
 * at once, so a hit shows at once, and down to about a third in "release"
 * seconds.
 */
export function followPush(value: number, target: number, elapsed: number, release: number): number {
  if (target >= value) return target;
  return target + (value - target) * Math.exp(-elapsed / Math.max(1e-3, release));
}

/** True when the setting can move with the sound: one that moves (it can have a range), but not the scene length, which times every range. */
export const audioLinkable = (key: ParamKey, param: Param) => Boolean(param.drift) && key !== "cycle";

/**
 * The settings whose audio switch is on (see PlayState.sound), in
 * PARAM_KEYS order: for scene files, the unsaved-changes check and Undo,
 * so the order in which they were switched on does not count.
 */
export const soundList = (sound: Partial<Record<ParamKey, true>>): ParamKey[] => PARAM_KEYS.filter((key) => sound[key]);

/**
 * The settings that move with the sound in a scene file: "sound", a list of
 * setting names. Older scene files had a link per setting instead
 * ("audioLinks": [setting, source, amount, ...] each); each linked setting
 * now has its switch on, and the link's other values are left out. Unknown
 * settings, and settings that cannot move, are skipped.
 */
export function readSound(sound: unknown, oldLinks: unknown, params: Params): Partial<Record<ParamKey, true>> {
  const names = Array.isArray(sound) ? sound
    : Array.isArray(oldLinks) ? oldLinks.map((entry) => (Array.isArray(entry) ? entry[0] : null))
    : [];
  const result: Partial<Record<ParamKey, true>> = {};
  for (const name of names) {
    if (typeof name !== "string" || !(PARAM_KEYS as readonly string[]).includes(name)) continue;
    if (audioLinkable(name as ParamKey, params[name as ParamKey])) result[name as ParamKey] = true;
  }
  return result;
}

/** What the engine reads from the sound: the band levels and loudnesses, the threshold, and the beat count (see AudioAnalyzer). */
export interface AudioSignal {
  readonly levels: Readonly<Record<AudioBand, number>>;
  readonly decibels: Readonly<Record<AudioBand, number>>;
  readonly thresholdDb: number;
  readonly beats: number;
}

/**
 * Where the sound pushes a linked setting (see docs/AUDIO.md, part 3).
 * With a range on, the range stops playing while the app listens: the
 * value rests at the start handle and the sound pushes it to the end
 * handle (the Reverse button sets the direction). With no range, the
 * slider's value is the home, and the sound pushes it toward the end of
 * the slider with more room, the maximum on a tie. (Pushing from the
 * playing range toward its end handle gave no motion when the range was
 * near that handle.)
 */
export function pushRange(param: Param): { rest: number; end: number } {
  if (param.on) return { rest: param.low ?? param.min, end: param.high ?? param.max };
  const home = toSlider(param, param.value);
  const up = toSlider(param, param.max) - home;
  const down = home - toSlider(param, param.min);
  return { rest: param.value, end: up >= down ? param.max : param.min };
}

/**
 * The value "push" (0 to 1) of the way from "base" to "end". It moves in
 * slider positions, so a log slider moves in equal ratios, and it is not
 * rounded to the slider's steps, so it moves smoothly.
 */
export function pushedValue(param: Param, base: number, end: number, push: number): number {
  if (!(push > 0)) return base;
  const from = toSlider(param, base);
  const at = from + (toSlider(param, end) - from) * Math.min(1, push);
  return param.scale === "log" ? param.min * (param.max / param.min) ** (at / SLIDER_STEPS) : at;
}

/** Each band's frequencies, in Hz. */
export const BAND_RANGES: Record<AudioBand, readonly [number, number]> = {
  level: [20, 16000],
  bass: [20, 150],
  mids: [150, 2000],
  highs: [2000, 12000]
};

/** One second-order filter: low pass or high pass, its corner (Hz), and its Q. */
type Filter = readonly ["low" | "high", number, number];

/**
 * An 8th-order Butterworth edge: four second-order filters with the Qs of
 * that order. The pass band stays flat (a tone in the band reads its true
 * loudness), and the edge falls 48 dB per octave, so a tone does not leak
 * into the next band. (Four filters of Q 0.707 were tried first: they lost
 * 1 dB of a 1 kHz tone in the mids.)
 */
const edge = (kind: "low" | "high", hz: number): Filter[] =>
  [0.5098, 0.6013, 0.9000, 2.5629].map((q): Filter => [kind, hz, q]);

/**
 * How the bands are split: chains of second-order filters (RBJ biquads)
 * that follow the sound sample by sample, so a new sound shows at once.
 * (A first version used a 2048-sample FFT: its window gave the newest
 * sound almost no weight, and the meters reacted 30 to 40 ms late.)
 */
const BAND_FILTERS: Record<AudioBand, readonly Filter[]> = {
  level: [["high", 20, Math.SQRT1_2]],
  bass: edge("low", 150),
  mids: [...edge("high", 150), ...edge("low", 2000)],
  highs: [...edge("high", 2000), ["low", 12000, Math.SQRT1_2]]
};
/**
 * The bass RMS for the beat check runs over about this time (a running
 * mean of the squared samples), so a jump shows within a few milliseconds.
 */
const RMS_SECONDS = 0.01;
/**
 * Each band's level is its peak, as on a DAW's peak meter and in a
 * compressor's peak mode, so 0 dB means the same here as there (decided
 * 2026-10-18; RMS came first, and sat 3 to 10 dB under the peaks, so a
 * threshold at 0 dB never moved anything). The peak rises with each
 * sample at once and falls to about a third in this time: long enough to
 * bridge a bass tone's cycles (60 Hz: 17 ms), short enough that the meters
 * show the sound as it is. How fast a setting falls back is the scene's
 * Release, times the link's factor (see followPush).
 */
const RELEASE_SECONDS = 0.05;
/** The loudness, the levels and the beat check update every this many samples (about 1.3 ms at 48 kHz). */
const TICK = 64;
/** The quietest loudness the analyzer reports, in dBFS: the bottom of the meters. */
export const FLOOR_DB = -60;
/** A band's level is 0 at the threshold and 1 at this peak (dBFS): full scale. */
export const TOP_DB = 0;
/** The beat check runs every this many ticks (about 5.3 ms at 48 kHz). */
const BEAT_TICKS = 4;
/** A beat's bass rise is measured over this many beat checks (about 10.7 ms). */
const RISE_CHECKS = 2;
/** No second beat comes within this time. */
const BEAT_GAP_SECONDS = 0.1;
/**
 * Automatic beats (changed 2026-10-18; a Beat sensitivity slider came
 * first, and the user saw no use for it): a beat is a bass jump of at
 * least BEAT_SHARE of the largest jump of the last few seconds, which
 * falls to about a third in BEAT_MEMORY_SECONDS. So in compressed music
 * (small jumps) and in music with more dynamics (large jumps) the clear
 * hits count, and the small ones between them do not.
 */
const BEAT_SHARE = 0.5;
const BEAT_MEMORY_SECONDS = 4;
/** A beat's jump is at least this much in any music, in dB: smaller jumps are noise. */
const BEAT_MIN_RISE_DB = 3;

/**
 * A threshold always has at least this much room above it, in dB: with a
 * threshold near 0 dBFS (the master and a link's offset together), the
 * level is full this far above it. (The master Threshold first stopped at
 * -12 dB, 6 dB under TOP_DB, so higher thresholds left no room.)
 */
const MIN_SPAN_DB = 6;

/** A level from 0 at "thresholdDb" to 1 at TOP_DB (or MIN_SPAN_DB above the threshold, when that is higher), for a loudness in dBFS: what a band link follows. */
export function levelAbove(decibels: number, thresholdDb: number) {
  const span = Math.max(MIN_SPAN_DB, TOP_DB - thresholdDb);
  return Math.min(1, Math.max(0, (decibels - thresholdDb) / span));
}

/** Amplitude to dBFS, never below FLOOR_DB. */
const decibels = (amplitude: number) => Math.max(FLOOR_DB, 20 * Math.log10(Math.max(amplitude, 1e-12)));

/** The coefficients of one second-order filter, divided by a0: b0, b1, b2, a1, a2. */
function biquad(kind: "low" | "high", hz: number, q: number, sampleRate: number): number[] {
  const w = (2 * Math.PI * Math.min(hz, sampleRate * 0.45)) / sampleRate;
  const alpha = Math.sin(w) / (2 * q);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const [b0, b1, b2] = kind === "low" ? [(1 - cos) / 2, 1 - cos, (1 - cos) / 2] : [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  return [b0 / a0, b1 / a0, b2 / a0, (-2 * cos) / a0, (1 - alpha) / a0];
}

/** A chain of second-order filters, run sample by sample (direct form II transposed). */
class FilterChain {
  private readonly coefficients: Float64Array;
  private readonly memory: Float64Array;

  constructor(filters: readonly Filter[], sampleRate: number) {
    this.coefficients = Float64Array.from(filters.flatMap(([kind, hz, q]) => biquad(kind, hz, q, sampleRate)));
    this.memory = new Float64Array(filters.length * 2);
  }

  run(sample: number): number {
    const c = this.coefficients;
    const z = this.memory;
    let x = sample;
    for (let stage = 0, at = 0; at < c.length; stage += 2, at += 5) {
      const y = c[at] * x + z[stage];
      z[stage] = c[at + 1] * x - c[at + 3] * y + z[stage + 1];
      z[stage + 1] = c[at + 2] * x - c[at + 4] * y;
      x = y;
    }
    return x;
  }
}

export class AudioAnalyzer implements AudioSignal {
  /** Each band's level now, from 0 at the threshold to 1 at TOP_DB (see decibels). It is up to date after each push. */
  readonly levels: Record<AudioBand, number> = { level: 0, bass: 0, mids: 0, highs: 0 };
  /** Each band's peak now, in dBFS after the gain, from FLOOR_DB up: for the meters and the thresholds. */
  readonly decibels: Record<AudioBand, number> = { level: FLOOR_DB, bass: FLOOR_DB, mids: FLOOR_DB, highs: FLOOR_DB };
  /** The beats so far; a change means a new beat. */
  beats = 0;
  /** Seconds of sound analyzed so far. */
  time = 0;
  /** Added to every band's loudness before the threshold, in dB (0 changes nothing). */
  gainDb = 0;
  /** The loudness (dBFS, after the gain) below which nothing moves: a level of 0, and no beats. */
  thresholdDb = -40;

  private readonly filters: FilterChain[];
  /** The bass band's running mean of the squared samples, for the beat check (see RMS_SECONDS). */
  private bassSquares = 0;
  /** Each band's peak as an amplitude: it rises with each sample at once and falls over RELEASE_SECONDS. */
  private readonly envelopes = new Float64Array(AUDIO_BANDS.length);
  private readonly mean: number;
  private readonly release: number;
  private samples = 0;
  private ticks = 0;
  /** The bass loudness (dB) at the last beat checks, for the rise. */
  private readonly bassChecks = new Float64Array(RISE_CHECKS + 1).fill(FLOOR_DB);
  private checks = 0;
  private lastBeat = -Infinity;
  /** The largest bass jump of the last few seconds, in dB (see BEAT_SHARE). */
  private largestRise = 0;
  private readonly riseMemory: number;

  constructor(readonly sampleRate: number) {
    this.filters = AUDIO_BANDS.map((band) => new FilterChain(BAND_FILTERS[band], sampleRate));
    this.mean = 1 - Math.exp(-1 / (RMS_SECONDS * sampleRate));
    this.release = 1 - Math.exp(-1 / (RELEASE_SECONDS * sampleRate));
    this.riseMemory = Math.exp(-(TICK * BEAT_TICKS) / (BEAT_MEMORY_SECONDS * sampleRate));
  }

  /** Adds mono samples (1 is full scale). Each sample goes through the band filters at once. */
  push(samples: Float32Array) {
    const { filters, envelopes, mean, release } = this;
    const bands = filters.length;
    for (let index = 0; index < samples.length; index++) {
      const sample = samples[index];
      for (let band = 0; band < bands; band++) {
        const filtered = filters[band].run(sample);
        const peak = Math.abs(filtered);
        const envelope = envelopes[band];
        envelopes[band] = peak > envelope ? peak : envelope + (peak - envelope) * release;
        if (band === 1) this.bassSquares += (filtered * filtered - this.bassSquares) * mean;
      }
      if (++this.samples % TICK === 0) this.tick();
    }
  }

  /** Every TICK samples: each band's loudness and level, then (every BEAT_TICKS) the beat check. */
  private tick() {
    this.time = this.samples / this.sampleRate;
    const { envelopes } = this;
    AUDIO_BANDS.forEach((band, index) => {
      const loudness = Math.max(FLOOR_DB, decibels(envelopes[index]) + this.gainDb);
      this.decibels[band] = loudness;
      this.levels[band] = levelAbove(loudness, this.thresholdDb);
    });
    /* The jump uses the plain RMS, with no slow fall: after a hard hit, the fall would hide a softer hit that follows. */
    if (++this.ticks % BEAT_TICKS === 0) this.detectBeat(Math.max(FLOOR_DB, decibels(Math.sqrt(this.bassSquares)) + this.gainDb));
  }

  /**
   * A beat: the bass peak is above the threshold, and the bass RMS got louder in the last
   * RISE_CHECKS checks by at least BEAT_SHARE of the largest such jump of
   * the last few seconds (and BEAT_MIN_RISE_DB), and no beat came in the
   * last BEAT_GAP_SECONDS.
   */
  private detectBeat(bass: number) {
    const checks = this.bassChecks;
    const before = checks[(this.checks + 1) % checks.length];
    checks[this.checks % checks.length] = bass;
    this.checks++;
    const rise = this.checks > RISE_CHECKS ? bass - before : 0;
    /* A jump out of silence (from below the threshold) is not a beat's size: as the start of a song, it would block the beats for seconds. The RMS sits under the peak, so this check is a little strict; it only keeps the memory clean. */
    const measured = before >= this.thresholdDb ? rise : 0;
    this.largestRise = Math.max(measured, this.largestRise * this.riseMemory);
    const needed = Math.max(BEAT_MIN_RISE_DB, this.largestRise * BEAT_SHARE);
    if (this.decibels.bass >= this.thresholdDb && rise >= needed && this.time - this.lastBeat >= BEAT_GAP_SECONDS) {
      this.beats++;
      this.lastBeat = this.time;
    }
  }
}
