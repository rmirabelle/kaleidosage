import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { Engine } from "../engine/engine";
import { baseLoopSeconds, fittedCustomSeconds, needsSeamFade, trailSettleTime, warpFlowCorrection } from "../engine/loop";
import { PARAM_KEYS, startRangeAt, type ParamKey } from "../engine/params";
import { getAppVersion } from "./updater";

/**
 * Video export, after Image Sage's slideshow video: frames are rendered off
 * the screen faster than real time, encoded as H.264 with the web view's own
 * video encoder (WebCodecs) and written as MP4 with `mp4-muxer` (MIT).
 *
 * The video starts where Stop puts the scene (every range at its start
 * handle) and runs a whole number of loops. Before the first frame, the
 * scene plays unseen until the trails are full (at most one loop), so the
 * first frame already has them.
 * - Title: a title box with the "made with" credit shows at the start and
 *   can fade out.
 * - Seamless loop: the last frame leads into the first. Custom range times
 *   and the warp flow change a little so they repeat in the video; a noise
 *   or cell warp that flows, a tunnel that flies, or a camera that flies, never repeats, so the
 *   last moment of the video crossfades into the moment before the first frame.
 */

export type VideoStyle = "title" | "loop";
/** Standard keeps the file small; High and Best keep a fixed picture quality, so the file grows with the detail. */
export type VideoQuality = "standard" | "high" | "best";
export type VideoFps = 30 | 60;

export interface VideoOptions {
  style: VideoStyle;
  /** The title in the title box; empty shows only the credit. */
  title: string;
  /** Milliseconds the title box takes to fade out after TITLE_HOLD; null keeps it for the whole video. */
  fadeOutMs: number | null;
  /** How many loops the video runs. */
  loops: number;
  quality: VideoQuality;
  fps: VideoFps;
}

/** Seconds the title box shows fully before it fades out. */
export const TITLE_HOLD = 4;
/** The longest seam crossfade, in seconds; a short video gets a shorter one. */
const SEAM_FADE = 1;
const MAX_WIDTH = 1920;
const MAX_HEIGHT = 1080;
/** Seconds between key frames, so players can seek. */
const KEY_FRAME_SECONDS = 2;
/** H.264 profiles to try, best first: High, then Main, then Baseline. Level 4.2 is enough for 1080p60 at a normal bit rate. */
const LEVEL_42 = ["avc1.64002A", "avc1.4D402A", "avc1.42E02A"];
/** Level 5.1 allows the high bit rates of High and Best. */
const LEVEL_51 = ["avc1.640033", "avc1.4D4033", "avc1.42E033"];

/**
 * Each quality: the H.264 quantizer for a fixed picture quality (lower is
 * better; 0 to 51), or null for a fixed bit rate, and the bit rate per
 * pixel and frame when the encoder cannot keep a fixed quality. Standard is
 * about 20 Mbit/s for 1080p60.
 */
const QUALITIES: Record<VideoQuality, { quantizer: number | null; bitsPerPixel: number; codecs: string[] }> = {
  standard: { quantizer: null, bitsPerPixel: 0.16, codecs: LEVEL_42 },
  high: { quantizer: 11, bitsPerPixel: 0.4, codecs: LEVEL_51 },
  best: { quantizer: 6, bitsPerPixel: 0.8, codecs: LEVEL_51 }
};

/** The video size: the picture's shape, inside 1920 by 1080, in even pixels (H.264 needs them). */
export function videoSize(aspect: number) {
  const safe = Number.isFinite(aspect) && aspect > 0 ? aspect : 16 / 9;
  let height = MAX_HEIGHT;
  let width = height * safe;
  if (width > MAX_WIDTH) {
    width = MAX_WIDTH;
    height = width / safe;
  }
  const even = (value: number) => Math.max(2, Math.round(value / 2) * 2);
  return { width: even(width), height: even(height) };
}

/** One loop of the scene, in seconds: the shortest time after which it repeats. */
export const loopSeconds = (engine: Engine) => baseLoopSeconds(engine.params, engine.state);

/** What a seamless video changes to make the scene repeat. */
export function seamlessChanges(engine: Engine, loops: number) {
  const seconds = loopSeconds(engine) * loops;
  return {
    customRanges: Object.keys(fittedCustomSeconds(engine.params, seconds)).length,
    crossfade: needsSeamFade(engine.params, engine.state)
  };
}

/** Seconds as minutes and seconds, such as "1:28". */
export const formatLength = (seconds: number) => {
  const whole = Math.round(seconds);
  return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
};

/**
 * The encoder setup for the quality: a fixed quality (quantizer) when the
 * encoder supports it, else a fixed bit rate. The GPU's encoder is tried
 * first, because it is faster and leaves the processor free.
 */
async function pickEncoder(width: number, height: number, fps: VideoFps, quality: VideoQuality) {
  if (typeof VideoEncoder === "undefined") throw new Error("This version of the app's web view cannot encode video.");
  const { quantizer, bitsPerPixel, codecs } = QUALITIES[quality];
  const bitrate = Math.round(width * height * fps * bitsPerPixel);
  const accelerations: HardwareAcceleration[] = ["prefer-hardware", "no-preference"];
  const attempts: { config: VideoEncoderConfig; quantizer: number | null }[] = [];
  for (const hardwareAcceleration of accelerations) {
    for (const codec of codecs) {
      if (quantizer !== null) attempts.push({ config: { codec, width, height, framerate: fps, hardwareAcceleration, bitrateMode: "quantizer" }, quantizer });
    }
  }
  for (const hardwareAcceleration of accelerations) {
    for (const codec of codecs) attempts.push({ config: { codec, width, height, framerate: fps, hardwareAcceleration, bitrate }, quantizer: null });
  }
  for (const attempt of attempts) {
    const support = await VideoEncoder.isConfigSupported(attempt.config).catch(() => ({ supported: false }));
    if (support.supported) return attempt;
  }
  throw new Error("No H.264 video encoder is available on this PC.");
}

/** The app icon, cut at its right at the last visible pixel, so the space after it is only the column gap. */
const loadIcon = () => new Promise<HTMLCanvasElement | null>((resolve) => {
  const image = new Image();
  image.onload = () => {
    const full = document.createElement("canvas");
    full.width = image.naturalWidth;
    full.height = image.naturalHeight;
    const fullContext = full.getContext("2d", { willReadFrequently: true })!;
    fullContext.drawImage(image, 0, 0);
    const pixels = fullContext.getImageData(0, 0, full.width, full.height).data;
    let right = 0;
    for (let index = 3; index < pixels.length; index += 4) {
      if (pixels[index] > 16) right = Math.max(right, ((index - 3) / 4) % full.width);
    }
    const cut = document.createElement("canvas");
    cut.width = right + 1;
    cut.height = full.height;
    cut.getContext("2d")!.drawImage(full, 0, 0);
    resolve(cut);
  };
  image.onerror = () => resolve(null);
  image.src = "/app-icon.png";
});

/** Splits "text" into lines no wider than "maxWidth" in the context's current font, breaking between words. */
function wrapLines(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (line && context.measureText(next).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * The title box, as in Image Sage: a dark rounded box in the middle with the
 * title in bold white (it wraps onto more lines when it is long), and under
 * it a bordered credit box. The credit box has the app icon in a left column
 * and two lines in a right column: "made with Kaleido Sage™" (the name in
 * light blue, the ™ small) and a small "Kaleido Sage v0.3 - Robert
 * Mirabelle". The rest of the canvas stays clear. Sizes are in hundredths of
 * the video height.
 */
async function titleOverlay(width: number, height: number, title: string) {
  const card = document.createElement("canvas");
  card.width = width;
  card.height = height;
  const context = card.getContext("2d")!;
  const unit = Math.min(height, width * 0.75) / 100;
  const font = (size: number, weight: number) => `${weight} ${Math.round(size * unit)}px "Segoe UI", system-ui, sans-serif`;
  /** The version as major.minor ("0.3"), or nothing when the app cannot tell. */
  const version = await getAppVersion().then((full) => full.split(".").slice(0, 2).join(".")).catch(() => "");
  const icon = await loadIcon();
  const credit = `Kaleido Sage${version ? ` v${version}` : ""} - Robert Mirabelle`;
  const TITLE = 6, MADE = 2.2, CREDIT = 1.25, ICON = 5.6, LINE = 1.3;
  /** The trademark sign is this much smaller than its line, and raised. */
  const TM_SCALE = 0.5;
  const measure = (text: string, size: number, weight: number) => {
    context.font = font(size, weight);
    return context.measureText(text).width;
  };
  /** "made with Kaleido Sage™" in three runs: plain, the name in light blue, and a small raised ™. */
  const madeRuns = [
    { text: "made with ", size: MADE, color: "#c3d0fc", raise: 0 },
    { text: "Kaleido Sage", size: MADE, color: "#a9ddf8", raise: 0 },
    { text: "™", size: MADE * TM_SCALE, color: "#a9ddf8", raise: MADE * 0.32 }
  ];
  const madeWidth = madeRuns.reduce((sum, run) => sum + measure(run.text, run.size, 600), 0);

  /** Tighter at the left, top and bottom, around the icon; the right keeps room after the text. */
  const creditPadLeft = (icon ? 1.1 : 2) * unit;
  const creditPadRight = 2 * unit;
  const creditPadY = 1.1 * unit;
  const iconSize = icon ? ICON * unit : 0;
  /** The cut icon keeps its height, so it is narrower than it is tall. */
  const iconWidth = icon ? iconSize * (icon.width / icon.height) : 0;
  const columnGap = icon ? 1 * unit : 0;
  const linesGap = 0.5 * unit;
  const linesHeight = MADE * LINE * unit + linesGap + CREDIT * LINE * unit;
  const linesWidth = Math.max(madeWidth, measure(credit, CREDIT, 500));
  const creditWidth = creditPadLeft + iconWidth + columnGap + linesWidth + creditPadRight;
  const creditHeight = Math.max(iconSize, linesHeight) + creditPadY * 2;

  /** The title wraps to stay within most of the video width; it is never narrower than the credit box needs. */
  context.font = font(TITLE, 750);
  const titleLines = title.trim() ? wrapLines(context, title.trim(), Math.max(width * 0.7, creditWidth)) : [];
  const titleLineHeight = TITLE * LINE * unit;
  const titleHeight = titleLines.length * titleLineHeight;
  const titleWidth = Math.max(0, ...titleLines.map((line) => context.measureText(line).width));
  const titleGap = titleLines.length ? 3.5 * unit : 0;
  const padX = 5 * unit;
  const padY = 4 * unit;
  const boxWidth = Math.max(titleWidth, creditWidth) + padX * 2;
  const boxHeight = titleHeight + titleGap + creditHeight + padY * 2;
  const top = (height - boxHeight) / 2;
  const center = width / 2;
  context.fillStyle = "rgba(10, 12, 18, 0.74)";
  context.beginPath();
  context.roundRect(center - boxWidth / 2, top, boxWidth, boxHeight, 2 * unit);
  context.fill();

  context.textBaseline = "middle";
  let y = top + padY;
  context.textAlign = "center";
  context.font = font(TITLE, 750);
  context.fillStyle = "#ffffff";
  for (const line of titleLines) {
    context.fillText(line, center, y + titleLineHeight / 2);
    y += titleLineHeight;
  }
  y += titleGap;

  const creditLeft = center - creditWidth / 2;
  context.strokeStyle = "rgba(195, 208, 252, 0.45)";
  /** A one-pixel line on the half pixel covers exactly one pixel row, so it stays sharp. */
  context.lineWidth = 1;
  context.beginPath();
  context.roundRect(Math.round(creditLeft) + 0.5, Math.round(y) + 0.5, Math.round(creditWidth), Math.round(creditHeight), 1.2 * unit);
  context.stroke();
  const middle = y + creditHeight / 2;
  if (icon) context.drawImage(icon, creditLeft + creditPadLeft, middle - iconSize / 2, iconWidth, iconSize);
  const textLeft = creditLeft + creditPadLeft + iconWidth + columnGap;
  let lineTop = middle - linesHeight / 2;
  context.textAlign = "left";
  let x = textLeft;
  for (const run of madeRuns) {
    context.font = font(run.size, 600);
    context.fillStyle = run.color;
    context.fillText(run.text, x, lineTop + (MADE * LINE * unit) / 2 - run.raise * unit);
    x += context.measureText(run.text).width;
  }
  lineTop += MADE * LINE * unit + linesGap;
  context.font = font(CREDIT, 500);
  context.fillStyle = "#8a91a3";
  context.fillText(credit, textLeft, lineTop + (CREDIT * LINE * unit) / 2);
  return card;
}

/** How much of the title box shows at "seconds" into a video "length" seconds long: fully, then a fade out that ends before the video does. */
export function titleAlpha(seconds: number, length: number, fadeOutMs: number | null) {
  if (fadeOutMs === null) return 1;
  const fade = Math.max(0, fadeOutMs / 1000);
  const start = Math.min(TITLE_HOLD, Math.max(0, length - fade));
  if (seconds < start) return 1;
  if (fade === 0) return 0;
  return Math.max(0, 1 - (seconds - start) / fade);
}

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * The export works in slices of about this many milliseconds, then lets
 * the window draw a frame, so the app stays usable while the video is made.
 */
const SLICE_MS = 12;

/** A message is faster than a 0 ms timer, which the browser slows down. */
const nextTask = () => new Promise<void>((resolve) => {
  const channel = new MessageChannel();
  channel.port1.onmessage = () => resolve();
  channel.port2.postMessage(null);
});

/**
 * Waits until the window has drawn its next frame. A hidden or covered
 * window may draw no frames, so it waits at most FRAME_WAIT_MS.
 */
const FRAME_WAIT_MS = 20;
const afterNextFrame = () => document.hidden
  ? nextTask()
  : new Promise<void>((resolve) => {
    const timeout = window.setTimeout(resolve, FRAME_WAIT_MS);
    requestAnimationFrame(() => void nextTask().then(() => {
      window.clearTimeout(timeout);
      resolve();
    }));
  });

/** Frames the encoder may hold before the export waits for it, so frames do not pile up in memory. */
const ENCODER_QUEUE = 12;
/** The most steps per video frame (see encodeVideo's "substeps"). */
const MAX_SUBSTEPS = 4;
/** Frames being read back from the GPU at once; the oldest is usually done by the time it is needed. */
const READS_AHEAD = 3;

/** Renders and encodes the video. "onProgress" gets 0 to 1; an aborted "signal" stops it with an AbortError. */
export async function encodeVideo(
  source: Engine,
  size: { width: number; height: number },
  options: VideoOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal
): Promise<Blob> {
  const { width, height } = size;
  const fps = options.fps;
  const engine = await source.forExport(width, height);
  const tail: WebGLTexture[] = [];
  try {
    const { params, state } = engine;
    const loop = baseLoopSeconds(params, state);
    const seconds = loop * Math.max(1, Math.round(options.loops));
    const frames = Math.max(1, Math.round(seconds * fps));
    /**
     * Steps per video frame: as many as the screen draws in that time.
     * Trails change a little each step (trail flow most of all, which can
     * break into stripes with large steps), so the video moves in the same
     * steps as the screen and looks the same.
     */
    const screenMs = source.stats.frameMs;
    const substeps = screenMs > 0 ? Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(1000 / fps / screenMs))) : 1;
    /** The real time of one step; the whole video is exactly "seconds" long, so it repeats exactly. */
    const realStep = seconds / (frames * substeps);
    const animatedStep = realStep * engine.speed;
    const seamless = options.style === "loop";

    /* The scene starts where Stop puts it, but playing. */
    state.paused = false;
    for (const key of PARAM_KEYS) if (params[key].drift) startRangeAt(params[key], 0);
    state.time = 0;
    state.clock = 0;
    state.warpTime = 0;
    state.mapTravel = 0;
    state.cameraX = 0;
    state.cameraY = 0;
    if (seamless) {
      /* A source video crossfades its end into its start, so it never jumps. */
      state.videoCrossfade = true;
      for (const [key, fitted] of Object.entries(fittedCustomSeconds(params, seconds))) params[key as ParamKey].seconds = fitted;
      /* Time smear restarts follow the play clock; they get the nearest time that repeats a whole number of times in the video. */
      const restart = params.smearRestart;
      if (restart.value > 0) restart.value = seconds / Math.max(1, Math.round(seconds / restart.value));
      engine.warpFlowOffset = warpFlowCorrection(params, state, frames * substeps, animatedStep, realStep);
    }
    const fadeFrames = seamless && needsSeamFade(params, state) ? Math.max(2, Math.min(Math.round(SEAM_FADE * fps), Math.floor(frames / 4))) : 0;
    /**
     * The scene plays unseen first, until the trails no longer hold the
     * still picture they started from (at most one loop), and long enough
     * to keep the frames the seam crossfades to.
     */
    const trails = state.groups.trails && state.trailMode !== 0;
    const trailFrames = trails ? Math.min(Math.round(loop * fps), Math.ceil(trailSettleTime(params) / (animatedStep * substeps))) : 0;
    /* The time smear shows up to its longest delay ago, so the scene plays at least that long unseen. */
    const smearDelay = params.smearDelay;
    const smearSeconds = state.groups.smear ? (smearDelay.on ? Math.max(smearDelay.low ?? 0, smearDelay.high ?? 0) : smearDelay.value) : 0;
    const smearFrames = Math.ceil(smearSeconds * fps);
    const lead = Math.max(trailFrames, fadeFrames, smearFrames);
    /* Each frame steps the clocks and draws, "substeps" times; after "lead" + 1 frames the time is 0 for the first video frame. */
    state.time = -(lead + 1) * substeps * animatedStep;
    state.clock = -(lead + 1) * substeps * realStep;

    const overlay = options.style === "title" ? await titleOverlay(width, height, options.title) : null;
    const { config, quantizer } = await pickEncoder(width, height, fps, options.quality);
    const muxer = new Muxer({
      target: new ArrayBufferTarget(),
      video: { codec: "avc", width, height, frameRate: fps },
      fastStart: "in-memory"
    });
    let failure: Error | null = null;
    const encoder = new VideoEncoder({
      output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
      error: (error) => { failure = error instanceof Error ? error : new Error(String(error)); }
    });
    encoder.configure(config);

    if (overlay) engine.setOverlay(overlay);
    const hasVideo = engine.hasVideo;
    const total = lead + frames;
    const microseconds = 1_000_000 / fps;
    const keyFrameEvery = fps * KEY_FRAME_SECONDS;
    let sliceStart = performance.now();
    /** Ends the slice when its time is up: reports the progress and lets the window draw. */
    const pause = async (index: number) => {
      if (performance.now() - sliceStart < SLICE_MS) return;
      onProgress(index / total);
      await afterNextFrame();
      sliceStart = performance.now();
    };
    /** Waits until the encoder has room; it says so each time it takes a frame from its queue. */
    const encoderRoom = () => new Promise<void>((resolve) => {
      if (encoder.encodeQueueSize <= ENCODER_QUEUE || encoder.state !== "configured") resolve();
      else encoder.addEventListener("dequeue", () => resolve(), { once: true });
    });
    /**
     * Frames go from the GPU to the encoder as plain pixels: reading them
     * back is much faster than handing the encoder the canvas. A few reads
     * run at once, so the export does not wait for the GPU.
     */
    const pixels = new Uint8Array(width * height * 4);
    const reads: { finish: (into: Uint8Array) => Promise<void>; shown: number }[] = [];
    const encodeOldest = async () => {
      const { finish, shown } = reads.shift()!;
      await finish(pixels);
      const videoFrame = new VideoFrame(pixels, {
        format: "RGBX",
        codedWidth: width,
        codedHeight: height,
        timestamp: Math.round(shown * microseconds),
        duration: Math.round(microseconds)
      });
      const keyFrame = shown % keyFrameEvery === 0;
      encoder.encode(videoFrame, quantizer === null ? { keyFrame } : { keyFrame, avc: { quantizer } });
      videoFrame.close();
      await encoderRoom();
    };
    try {
      for (let index = 0; index < total; index++) {
        if (signal.aborted) throw new DOMException("The video export was stopped.", "AbortError");
        if (failure) throw failure;
        for (let step = 0; step < substeps; step++) {
          const animated = engine.step(realStep);
          if (hasVideo && step === substeps - 1) await engine.seekVideos();
          engine.draw(animated, realStep);
        }
        /* The WebGL canvas holds the frame only until the next task, so everything below uses it at once. */
        const shown = index - lead;
        if (shown < 0) {
          /* The last unseen frames are kept for the seam crossfade. */
          if (index >= lead - fadeFrames) tail.push(engine.captureFrame());
          await pause(index);
          continue;
        }
        const into = fadeFrames ? shown - (frames - fadeFrames) : -1;
        if (into >= 0) engine.drawFrameOver(tail[into], smoothstep(into / (fadeFrames - 1)));
        const titleShows = overlay ? titleAlpha(shown / fps, seconds, options.fadeOutMs) : 0;
        if (titleShows > 0) engine.drawOverlay(titleShows);
        reads.push({ finish: engine.startRead(), shown });
        if (reads.length >= READS_AHEAD) await encodeOldest();
        await pause(index);
      }
      while (reads.length) await encodeOldest();
      await encoder.flush();
    } finally {
      if (encoder.state !== "closed") encoder.close();
    }
    if (failure) throw failure;
    muxer.finalize();
    onProgress(1);
    return new Blob([muxer.target.buffer], { type: "video/mp4" });
  } finally {
    for (const texture of tail) engine.releaseFrame(texture);
    engine.dispose();
  }
}
