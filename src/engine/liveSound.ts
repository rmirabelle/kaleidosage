import { followPush, type AudioSignal } from "./audio";
import { BEAT_TRIP, PULSE_DEPTH, wavePosition, type Family } from "./songScript";

/**
 * The live sound's shapes for the settings whose audio switch is on, while
 * the app listens to a device (a microphone, a line-in or the PC's sound)
 * and no song plan leads (see songScript.ts). The same families move the
 * same way as with a song, from the live levels and beats: brightness and
 * size follow the level and pulse on each beat, detail follows the level
 * slowly, sparkle follows the high sounds, and every other setting moves
 * one step through its range on each beat. There is no future to plan
 * from, so there is no rise before a drop.
 */

/** How long the level and the high sounds take to fall back after a peak, and how slowly detail follows the level, in seconds. */
const LEVEL_RELEASE = 0.25;
const SLOW_SECONDS = 1;
/** A beat's pulse falls away in this time, in seconds; a beat's step glides in this time. */
const PULSE_RELEASE = 0.18;
const STEP_SECONDS = 0.12;

export class LiveSound {
  level = 0;
  slow = 0;
  highs = 0;
  pulse = 0;
  /** How far the beat-moved settings have gone, in trips (see wavePosition), and where the beats send them. */
  travel = 0;
  private target = 0;
  /** The analyzer's beat count at the last step, or -1 before the first. */
  private beats = -1;

  /** Moves the shapes on by "elapsed" real seconds, from the sound now; with no sound they fall back to rest. */
  step(signal: AudioSignal | null, elapsed: number) {
    const level = signal?.levels.level ?? 0;
    this.level = followPush(this.level, level, elapsed, LEVEL_RELEASE);
    this.highs = followPush(this.highs, signal?.levels.highs ?? 0, elapsed, LEVEL_RELEASE);
    this.slow += (level - this.slow) * (1 - Math.exp(-elapsed / SLOW_SECONDS));
    const beat = signal !== null && this.beats >= 0 && signal.beats !== this.beats;
    this.beats = signal?.beats ?? -1;
    this.pulse = beat ? 1 : this.pulse * Math.exp(-elapsed / PULSE_RELEASE);
    /* A soft beat takes a small step, a loud one a full step. */
    if (beat) this.target += (0.3 + 0.7 * this.level) / BEAT_TRIP;
    this.travel += (this.target - this.travel) * (1 - Math.exp(-elapsed / STEP_SECONDS));
  }

  /** Where a setting of "family" is, from 0 (its start handle) to 1 (its end handle). "offset" gives a beat-moved setting its own place in the wave. */
  position(family: Family, offset = 0) {
    switch (family) {
      case "glow":
      case "scale": return Math.min(1, (1 - PULSE_DEPTH[family]) * this.level + PULSE_DEPTH[family] * this.pulse * this.level);
      case "complexity": return this.slow;
      case "sparkle": return this.highs * (0.4 + 0.6 * this.level);
      case "beat": return wavePosition(this.travel + offset);
    }
  }
}
