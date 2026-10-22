/**
 * The song's time for the picture (see the song script, engine/songScript.ts):
 * the music's place, as the speakers play it now. The audio element's
 * currentTime moves in uneven steps, so the clock runs on real time between
 * readings and leans slowly toward each reading; a big difference (a seek,
 * a new track) moves it at once. It takes off the output latency, the
 * time sound takes from the audio element to the speakers, and adds a small
 * lead, so a picture never comes after its sound.
 */

export interface ClockReading {
  /** The audio element's currentTime, in seconds. */
  position: number;
  playing: boolean;
  /** Seconds from the audio element to the speakers. */
  latency: number;
}

/** A difference this large is a jump (a seek), not jitter: the clock moves to the reading at once. */
const JUMP_SECONDS = 0.1;
/** Each frame, the clock moves this part of the way to the reading. */
const LEAN = 0.1;
/** The picture comes this much before its sound (see ITU-R BT.1359: a picture that is late shows sooner than one that is early). */
const LEAD_SECONDS = 0.01;

export class SongClock {
  /** The clock's time and the real time it was taken at, in seconds. */
  private base = 0;
  private baseAt = 0;
  /**
   * For the measurement of phase 1: the output latency, the mean difference
   * between the clock and the readings (the jitter it smooths away), in
   * milliseconds, and how many jumps it made.
   */
  readonly stats = { latencyMs: 0, jitterMs: 0, jumps: 0 };

  constructor(private readonly read: () => ClockReading, private readonly now = () => performance.now() / 1000) {}

  /** The song's time to show now, in seconds. */
  time() {
    const { position, playing, latency } = this.read();
    const now = this.now();
    this.stats.latencyMs = latency * 1000;
    if (!playing) {
      this.base = position;
    } else {
      const expected = this.base + (now - this.baseAt);
      const difference = position - expected;
      if (Math.abs(difference) > JUMP_SECONDS) {
        this.base = position;
        this.stats.jumps++;
      } else {
        this.base = expected + difference * LEAN;
        this.stats.jitterMs += (Math.abs(difference) * 1000 - this.stats.jitterMs) * 0.05;
      }
    }
    this.baseAt = now;
    return Math.max(0, this.base - latency + LEAD_SECONDS);
  }
}
