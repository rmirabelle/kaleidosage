import type { Engine } from "../engine/engine";
import { streamCast } from "../lib/castStream";

/**
 * Dev only: starts and stops the network cast (src/lib/castStream.ts) until
 * the Cast menu can do it. Each save of this file switches the cast: off to
 * on, on to off. While it is on, the dev log gets one line each second with
 * the numbers of this side and of the receiver.
 */

/** The receiver PC's name or address. */
const TARGET = "StudioMini";
/** The cast stops by itself after this time; 0 keeps it on until the next save. */
const RUN_SECONDS = 0;
/** Moves the sound at the receiver: a positive number of ms makes it later, a negative one earlier. */
const SOUND_OFFSET_MS = -135;
/** How many blocks of music go in one message (see StreamCast.soundBlocks). */
const SOUND_BLOCKS = 4;
const RUN = 20;

async function toggle(log: (message: string) => void) {
  const engine = (window as unknown as { kaleidoEngine?: Engine }).kaleidoEngine;
  if (!engine) return log("no engine");
  if (streamCast.on) {
    await streamCast.stop();
    return log("stopped");
  }
  streamCast.soundOffsetMs = SOUND_OFFSET_MS;
  streamCast.soundBlocks = SOUND_BLOCKS;
  await streamCast.start(engine, TARGET);
  const status = streamCast.status;
  if (status.state !== "on") return log(`run ${RUN}: not started: ${status.state === "error" ? status.message : status.state}`);
  log(`run ${RUN}: on, to ${status.name} at ${status.width}x${status.height}, sound offset ${SOUND_OFFSET_MS} ms`);
  let seconds = 0;
  /* The receiver's report comes each second, also when this window is not on the screen (page timers are slow there). */
  const off = streamCast.subscribe(() => {
    const now = streamCast.status;
    if (now.state !== "on") {
      off();
      return log(now.state === "error" ? `ended: ${now.message}` : "ended");
    }
    const report = streamCast.report;
    if (!report) return;
    const sender = streamCast.takeStats();
    seconds++;
    log(`${sender.sent} sent, ${sender.skipped} skipped, to encoder ${sender.meanMs.toFixed(1)} ms (max ${sender.maxMs.toFixed(1)}), engine frame ${engine.stats.frameMs.toFixed(1)} ms, page ${document.visibilityState} | receiver: ${report.fps} shown, delay ${report.delay} ms, trip ${report.trip} ms (max ${report.tripMax}), dropped ${report.dropped}, lost ${report.lost}, ${report.mbit} Mbit/s, waiting ${report.waiting}, sound gap ${report.soundGapMs} ms, sound jumps ${report.soundJumps}, sound output: ${report.soundOutput}`);
    if (RUN_SECONDS && seconds >= RUN_SECONDS) {
      off();
      void streamCast.stop().then(() => log("run ends"));
    }
  });
}

if (import.meta.hot) {
  const hot = import.meta.hot;
  const log = (message: string) => hot.send("kaleidosage:log", { message: `cast probe: ${message}` });
  hot.accept();
  /**
   * The first load only arms the switch. A later save with a new RUN number
   * switches the cast; a save with the same RUN number only gives the cast
   * the sound settings above, so they can change while it plays.
   */
  if (hot.data.armed && hot.data.run !== undefined && hot.data.run !== RUN) {
    toggle(log).catch((error) => log(`failed: ${error instanceof Error ? error.message : String(error)}`));
  } else if (hot.data.armed) {
    streamCast.soundOffsetMs = SOUND_OFFSET_MS;
    streamCast.soundBlocks = SOUND_BLOCKS;
    log(`sound offset ${SOUND_OFFSET_MS} ms, ${SOUND_BLOCKS} blocks a message`);
  }
  hot.data.armed = true;
  hot.data.run = RUN;
}
