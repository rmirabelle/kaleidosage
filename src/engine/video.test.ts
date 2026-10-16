import { describe, expect, it } from "vitest";
import { REFERENCE_CYCLE } from "./params";
import { videoLoopPlan } from "./video";

/** Animation time for "seconds" real seconds into a loop of "loop" seconds. */
const timeAt = (seconds: number, loop: number) => (seconds / loop) * REFERENCE_CYCLE;

describe("videoLoopPlan", () => {
  it("hands over at each repeat with no jump", () => {
    for (const [loop, duration] of [[20, 30], [20, 7], [10, 3.2], [8, 8]]) {
      const step = 1 / 60;
      let previous = videoLoopPlan(timeAt(0, loop), loop, duration);
      for (let seconds = step; seconds < loop * 2; seconds += step) {
        const plan = videoLoopPlan(timeAt(seconds, loop), loop, duration);
        expect(plan.main).toBeLessThanOrEqual(duration + 1e-6);
        if (plan.round !== previous.round) {
          /* The copy that faded in becomes the one that shows, at the place it had reached, fully shown. */
          expect(previous.fadeIn).not.toBeNull();
          expect(previous.mix).toBeGreaterThan(0.95);
          expect(plan.main - previous.fadeIn!).toBeCloseTo(step, 3);
          expect(plan.round).toBe(previous.round + 1);
        } else {
          expect(plan.main - previous.main).toBeCloseTo(step, 3);
        }
        previous = plan;
      }
    }
  });

  it("repeats a whole number of times in each loop", () => {
    const loop = 20;
    for (const seconds of [0.5, 6.1, 13.7]) {
      const plan = videoLoopPlan(timeAt(seconds, loop), loop, 7);
      const later = videoLoopPlan(timeAt(seconds + loop, loop), loop, 7);
      expect(later.main).toBeCloseTo(plan.main);
      expect(later.mix).toBeCloseTo(plan.mix);
    }
  });

  it("works before time 0, as the video export's unseen lead does", () => {
    const plan = videoLoopPlan(timeAt(-0.25, 20), 20, 30);
    expect(plan.fadeIn).toBeCloseTo(0.75);
    expect(plan.round).toBe(-1);
  });
});
