import type { Engine } from "../engine/engine";
import { streamCast } from "../lib/castStream";
import { tracks } from "../lib/tracks";
import { audioOutput } from "../lib/audioOutput";

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
const SOUND_OFFSET_MS = 0;
/** How many blocks of music go in one message (see StreamCast.soundBlocks). */
const SOUND_BLOCKS = 4;
/** Sends a white flash and a beep at the same moment each second, in place of the scene and the music (see StreamCast.testPattern). */
const TEST_PATTERN = false;
const RUN = 24;
/** A new number here runs the measurement of the player's clock (see measure). */
const MEASURE = 4;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Measures how far the player's reported song time (the audio element's
 * currentTime) is ahead of the sound that leaves the player at that moment.
 * It decodes the playing file a second time, takes the newest samples from
 * the player's graph, and finds their place in the decoded file. With no
 * song playing, it plays the current one for the time of the measurement.
 */
async function measure(log: (message: string) => void) {
  const player = tracks as unknown as { audio: HTMLAudioElement | null; source: MediaElementAudioSourceNode | null; context: AudioContext | null };
  let started = false;
  if (!tracks.playing) {
    await tracks.play();
    started = true;
    await wait(2500);
  }
  const { audio, source, context } = player;
  if (!audio || !source || !context || !tracks.playing) return log("measure: no song plays");
  const rate = context.sampleRate;
  /* The app gives a file in parts; the parts are read one after the other. */
  const parts: Uint8Array[] = [];
  let have = 0;
  let total = Infinity;
  while (have < total) {
    const response = await fetch(audio.src, { headers: { Range: `bytes=${have}-` } });
    const part = new Uint8Array(await response.arrayBuffer());
    if (part.length === 0) break;
    parts.push(part);
    have += part.length;
    total = Number(response.headers.get("content-range")?.split("/")[1] ?? have);
  }
  const whole = new Uint8Array(have);
  let at = 0;
  for (const part of parts) {
    whole.set(part, at);
    at += part.length;
  }
  const file = whole.buffer;
  log(`measure: file ${tracks.current?.name}, ${have} bytes in ${parts.length} parts`);
  let decoded: AudioBuffer;
  try {
    decoded = await new OfflineAudioContext(1, 1, rate).decodeAudioData(file);
  } catch (error) {
    if (started) tracks.pause();
    throw error;
  }
  const reference = new Float32Array(decoded.length);
  for (let channel = 0; channel < decoded.numberOfChannels; channel++) {
    const samples = decoded.getChannelData(channel);
    for (let index = 0; index < samples.length; index++) reference[index] += samples[index] / decoded.numberOfChannels;
  }
  const analyser = context.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  await wait(400);
  const SIZE = 1024;
  const leads: number[] = [];
  const scores: number[] = [];
  const newest = new Float32Array(analyser.fftSize);
  for (let round = 0; round < 12; round++) {
    const position = audio.currentTime;
    analyser.getFloatTimeDomainData(newest);
    const part = newest.subarray(newest.length - SIZE);
    let partEnergy = 0;
    for (let index = 0; index < SIZE; index++) partEnergy += part[index] * part[index];
    const center = Math.round(position * rate);
    let best = 0;
    let bestScore = -Infinity;
    for (let end = Math.max(SIZE, center - Math.round(rate * 0.7)); end <= Math.min(reference.length, center + Math.round(rate * 0.7)); end++) {
      let dot = 0;
      let energy = 0;
      const start = end - SIZE;
      for (let index = 0; index < SIZE; index += 2) {
        const value = reference[start + index];
        dot += value * part[index];
        energy += value * value;
      }
      const score = dot / Math.sqrt(energy * partEnergy / 2 + 1e-12);
      if (score > bestScore) {
        bestScore = score;
        best = end;
      }
    }
    leads.push((position - best / rate) * 1000);
    scores.push(bestScore);
    await wait(300);
  }
  source.disconnect(analyser);
  if (started) tracks.pause();
  const output = context.getOutputTimestamp();
  const ahead = output.performanceTime ? (context.currentTime - (output.contextTime ?? 0)) * 1000 - (performance.now() - output.performanceTime) : NaN;
  const sorted = [...leads].sort((a, b) => a - b);
  log(`measure: the element's time is ahead of the sound in the graph by ${sorted[Math.floor(sorted.length / 2)].toFixed(0)} ms (all: ${leads.map((lead) => lead.toFixed(0)).join(" ")}; match ${scores.map((score) => score.toFixed(2)).join(" ")}); speaker delay ${(tracks.latency * 1000).toFixed(0)} ms (base ${(context.baseLatency * 1000).toFixed(0)}, output ${((context.outputLatency || 0) * 1000).toFixed(0)}), context ahead of the heard sound ${ahead.toFixed(0)} ms; file ${decodeURIComponent(audio.src).split(/[\\/.]/).pop()}, ${rate} Hz`);
}

async function toggle(log: (message: string) => void) {
  const engine = (window as unknown as { kaleidoEngine?: Engine }).kaleidoEngine;
  if (!engine) return log("no engine");
  if (streamCast.on) {
    await streamCast.stop();
    return log("stopped");
  }
  streamCast.soundOffsetMs = SOUND_OFFSET_MS;
  streamCast.soundBlocks = SOUND_BLOCKS;
  streamCast.testPattern = TEST_PATTERN;
  await streamCast.start(engine, TARGET);
  /* Dev: the music starts with the cast, so the sound numbers come with no click in the app. */
  if (!TEST_PATTERN && !tracks.playing) await tracks.play();
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
    log(`${sender.sent} sent, ${sender.skipped} skipped, to encoder ${sender.meanMs.toFixed(1)} ms (max ${sender.maxMs.toFixed(1)}), engine frame ${engine.stats.frameMs.toFixed(1)} ms, page ${document.visibilityState} | receiver: ${report.fps} shown, delay ${report.delay} ms, trip ${report.trip} ms (max ${report.tripMax}), dropped ${report.dropped}, lost ${report.lost}, ${report.mbit} Mbit/s, waiting ${report.waiting}, sound gap ${report.soundGapMs} ms, sound jumps ${report.soundJumps}, sound output: ${report.soundOutput}, old stamp minus new ${streamCast.soundStampDifference.toFixed(0)} ms`);
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
  if (hot.data.armed && hot.data.measure !== undefined && hot.data.measure !== MEASURE) {
    measure(log).catch((error) => log(`measure failed: ${error instanceof Error ? error.message : String(error)}`));
  } else if (hot.data.armed && hot.data.run !== undefined && hot.data.run !== RUN) {
    toggle(log).catch((error) => log(`failed: ${error instanceof Error ? error.message : String(error)}`));
  } else if (hot.data.armed) {
    streamCast.soundOffsetMs = SOUND_OFFSET_MS;
    streamCast.soundBlocks = SOUND_BLOCKS;
    log(`sound offset ${SOUND_OFFSET_MS} ms, ${SOUND_BLOCKS} blocks a message; this PC's speaker delay ${(tracks.latency * 1000).toFixed(0)} ms, output device ${audioOutput.device ?? "Windows default"}`);
  }
  hot.data.armed = true;
  hot.data.run = RUN;
  hot.data.measure = MEASURE;
}
