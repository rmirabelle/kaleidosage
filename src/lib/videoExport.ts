import { ArrayBufferTarget, Muxer } from "mp4-muxer";
import type { ExportFile } from "./exports";
import type { Engine, SceneSource } from "../engine/engine";
import { baseLoopSeconds, fittedCustomSeconds, needsSeamFade, trailSettleTime, warpFlowCorrection } from "../engine/loop";
import { PARAM_KEYS, startRangeAt, type ParamKey } from "../engine/params";
import { getAppVersion } from "./updater";

/**
 * Video export, after Image Sage's slideshow video: frames are rendered off
 * the screen faster than real time. In the app, FFmpeg encodes them (see
 * export_stream.rs). In a plain browser, the web view's own video encoder
 * (WebCodecs) does, and `mp4-muxer` (MIT) writes the MP4.
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
 * - 360: the picture is drawn square, as tall as the video, and wrapped
 *   around the viewer (see SPHERE_SHADER); the file is marked as a 360
 *   video (see export_stream.rs), so a headset player shows it all around.
 */

export type VideoStyle = "title" | "loop";
/** Standard keeps the file small; High and Best keep a fixed picture quality, so the file grows with the detail. */
export type VideoQuality = "standard" | "high" | "best";
export type VideoFps = 30 | 60;
/** The scene on the screen, one file for each open scene, or one video of all open scenes. */
export type VideoScenes = "current" | "separate" | "stitched";
/** The detail of a video: 4K has twice the width and height of 1080p. A 360 video has its own size. */
export type VideoResolution = "1080p" | "4k";
/** "screen" keeps the picture's shape on the screen; the others are fixed sizes for video sites. */
export type VideoSizeId = "screen" | "landscape" | "vertical" | "square" | "portrait" | "sphere";

/** The fixed video sizes, in pixels, with the sites that use them. */
export const VIDEO_SIZES: { id: Exclude<VideoSizeId, "screen">; ratio: string; sites: string; width: number; height: number }[] = [
  { id: "landscape", ratio: "16:9", sites: "YouTube", width: 1920, height: 1080 },
  { id: "vertical", ratio: "9:16", sites: "TikTok, Reels, Shorts", width: 1080, height: 1920 },
  { id: "square", ratio: "1:1", sites: "Instagram square", width: 1080, height: 1080 },
  { id: "portrait", ratio: "4:5", sites: "Instagram feed", width: 1080, height: 1350 },
  { id: "sphere", ratio: "360°", sites: "Quest, VR headsets", width: 4096, height: 2048 }
];

export interface VideoOptions {
  scenes: VideoScenes;
  size: VideoSizeId;
  resolution: VideoResolution;
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

/** Seconds of the crossfade between two scenes in a stitched video. */
export const STITCH_FADE = 2;
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
/** Level 5.2 allows frames larger than 1080p, such as the 360 video's 4096 by 2048, at 60 frames a second. */
const LEVEL_52 = ["avc1.640034", "avc1.4D4034", "avc1.42E034"];

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

/** A size choice at a resolution. */
export function atResolution(id: VideoSizeId, size: { width: number; height: number }, resolution: VideoResolution) {
  const scale = resolution === "4k" && id !== "sphere" ? 2 : 1;
  return { width: size.width * scale, height: size.height * scale };
}

/** The pixel size of a size choice; "screen" is the screen's shape (see videoSize). */
export function videoDimensions(id: VideoSizeId, screenAspect: number, resolution: VideoResolution) {
  return atResolution(id, VIDEO_SIZES.find((choice) => choice.id === id) ?? videoSize(screenAspect), resolution);
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
 * Smaller 360 sizes, tried in turn when the encoder cannot make the one
 * asked for: many GPUs encode H.264 only up to 3840 pixels wide, some only
 * at 30 frames a second.
 */
const SPHERE_FALLBACKS = [{ width: 3840, height: 1920 }, { width: 2880, height: 1440 }];

/**
 * The encoder setup for the quality: a fixed quality (quantizer) when the
 * encoder supports it, else a fixed bit rate. The GPU's encoder is tried
 * first, because it is faster and leaves the processor free. A 360 video
 * ("sphere") that the encoder cannot make at its size and frame rate tries
 * 30 frames a second, then the smaller SPHERE_FALLBACKS sizes.
 */
async function pickEncoder(size: { width: number; height: number }, fps: VideoFps, quality: VideoQuality, sphere: boolean) {
  if (typeof VideoEncoder === "undefined") throw new Error("This version of the app's web view cannot encode video.");
  const { quantizer, bitsPerPixel } = QUALITIES[quality];
  const sizes = sphere ? [size, ...SPHERE_FALLBACKS.filter((fallback) => fallback.width < size.width)] : [size];
  const rates: VideoFps[] = sphere && fps !== 30 ? [fps, 30] : [fps];
  const accelerations: HardwareAcceleration[] = ["prefer-hardware", "no-preference"];
  for (const { width, height } of sizes) {
    const codecs = width * height > MAX_WIDTH * MAX_HEIGHT ? LEVEL_52 : QUALITIES[quality].codecs;
    for (const framerate of rates) {
      const bitrate = Math.round(width * height * framerate * bitsPerPixel);
      const attempts: { config: VideoEncoderConfig; quantizer: number | null }[] = [];
      for (const hardwareAcceleration of accelerations) {
        for (const codec of codecs) {
          if (quantizer !== null) attempts.push({ config: { codec, width, height, framerate, hardwareAcceleration, bitrateMode: "quantizer" }, quantizer });
        }
      }
      for (const hardwareAcceleration of accelerations) {
        for (const codec of codecs) attempts.push({ config: { codec, width, height, framerate, hardwareAcceleration, bitrate }, quantizer: null });
      }
      for (const attempt of attempts) {
        const support = await VideoEncoder.isConfigSupported(attempt.config).catch(() => ({ supported: false }));
        if (support.supported) return { ...attempt, width, height, fps: framerate };
      }
    }
  }
  throw new Error(sphere
    ? "The video encoder on this PC cannot make a 360 video, even at 2880 × 1440 and 30 frames a second."
    : "No H.264 video encoder is available on this PC.");
}

/** Where the frames go. "finish" gives the video when it is in memory, or null when it went to a file. */
interface FrameSink {
  add(pixels: Uint8Array, shown: number): Promise<void>;
  finish(): Promise<Blob | null>;
  close(): void;
}

/** In the app: each frame goes to FFmpeg, and waits until FFmpeg takes it. */
const ffmpegSink = (file: ExportFile): FrameSink => ({
  add: (pixels) => file.writeFrame(pixels),
  finish: () => Promise.resolve(null),
  close: () => {}
});

/** In a plain browser: the web view's encoder, with the MP4 made in memory, its index first. */
function webCodecsSink({ config, quantizer, width, height, fps }: Awaited<ReturnType<typeof pickEncoder>>): FrameSink {
  const muxer = new Muxer({ target: new ArrayBufferTarget(), video: { codec: "avc", width, height, frameRate: fps }, fastStart: "in-memory" });
  let failure: Error | null = null;
  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (error) => { failure = error instanceof Error ? error : new Error(String(error)); }
  });
  encoder.configure(config);
  const microseconds = 1_000_000 / fps;
  const keyFrameEvery = fps * KEY_FRAME_SECONDS;
  /** Waits until the encoder has room; it says so each time it takes a frame from its queue. */
  const encoderRoom = () => new Promise<void>((resolve) => {
    if (encoder.encodeQueueSize <= ENCODER_QUEUE || encoder.state !== "configured") resolve();
    else encoder.addEventListener("dequeue", () => resolve(), { once: true });
  });
  return {
    async add(pixels, shown) {
      if (failure) throw failure;
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
    },
    async finish() {
      await encoder.flush();
      if (failure) throw failure;
      muxer.finalize();
      return new Blob([muxer.target.buffer], { type: "video/mp4" });
    },
    close() {
      if (encoder.state !== "closed") encoder.close();
    }
  };
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
  image.src = "/kaleido-sage-logo.png";
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
 * the video height, times "scale".
 */
async function titleOverlay(width: number, height: number, title: string, scale = 1) {
  const card = document.createElement("canvas");
  card.width = width;
  card.height = height;
  const context = card.getContext("2d")!;
  const unit = (Math.min(height, width * 0.75) / 100) * scale;
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
  const titleLines = title.trim() ? wrapLines(context, title.trim(), Math.max(width * 0.7 * scale, creditWidth)) : [];
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

/**
 * How a stitched video joins its scenes: the crossfade of each join, in
 * frames, and the video's whole length. A crossfade takes at most half of
 * each scene it joins, so a short scene can fade in and out. With "wrap", a
 * last join crossfades the last scene into the first, so the video repeats.
 */
export function stitchPlan(frames: number[], fps: number, wrap: boolean) {
  const count = frames.length;
  const joins = count < 2 ? 0 : wrap ? count : count - 1;
  const fades = Array.from({ length: joins }, (_, index) =>
    Math.min(Math.round(STITCH_FADE * fps), Math.floor(Math.min(frames[index], frames[(index + 1) % count]) / 2)));
  const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
  return { fades, total: sum(frames) - sum(fades) };
}

/** Mixes "other" into "into" (RGBA pixels of the same size): 0 keeps "into", 1 gives "other". */
export function mixFrames(into: Uint8Array, other: Uint8Array, amount: number) {
  const first = new Uint32Array(into.buffer, into.byteOffset, into.length >> 2);
  const second = new Uint32Array(other.buffer, other.byteOffset, other.length >> 2);
  const weight = Math.round(amount * 256);
  const keep = 256 - weight;
  /* Each pixel is worked on as two pairs of channels at once: this runs on every pixel of a 4K frame. */
  for (let index = 0; index < first.length; index++) {
    const a = first[index];
    const b = second[index];
    const redBlue = (((a & 0xff00ff) * keep + (b & 0xff00ff) * weight) >>> 8) & 0xff00ff;
    const greenAlpha = ((((a >>> 8) & 0xff00ff) * keep + ((b >>> 8) & 0xff00ff) * weight) & 0xff00ff00);
    first[index] = redBlue | greenAlpha;
  }
}

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * The export works in slices of about this many milliseconds, then lets
 * the window draw a frame. The window also runs while the export waits for
 * the GPU and FFmpeg, so the app stays usable with a long slice.
 */
const SLICE_MS = 100;

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

/** The size of the frames, and of the picture that a 360 video wraps around the viewer. */
interface ExportShape {
  frameWidth: number;
  width: number;
  height: number;
  fps: VideoFps;
  sphere: boolean;
}

/** One scene's frames, in order, from its own off-screen engine. */
type Clip = Awaited<ReturnType<typeof openClip>>;

/**
 * Opens a scene for export. It starts where Stop puts the scene. "skip"
 * frames at its start are played but not shown. "seamless" makes the scene
 * repeat by itself.
 */
async function openClip(source: Engine, scene: SceneSource, shape: ExportShape, options: VideoOptions, seamless: boolean, skip: number, overlay: HTMLCanvasElement | null) {
  const { frameWidth, width, height, fps, sphere } = shape;
  const engine = await source.forExport(frameWidth, height, scene);
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
  const screenMs = source.exportFrameMs;
  const substeps = screenMs > 0 ? Math.min(MAX_SUBSTEPS, Math.max(1, Math.round(1000 / fps / screenMs))) : 1;
  /** The real time of one step; the whole video is exactly "seconds" long, so it repeats exactly. */
  const realStep = seconds / (frames * substeps);
  const animatedStep = realStep * engine.speed;

  /* The scene starts where Stop puts it, but playing. */
  state.paused = false;
  for (const key of PARAM_KEYS) if (params[key].drift) startRangeAt(params[key], 0);
  state.time = 0;
  state.clock = 0;
  state.warpTime = 0;
  state.driverTime = 0;
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
  if (overlay) engine.setOverlay(overlay);

  const hasVideo = engine.hasVideo;
  const tail: WebGLTexture[] = [];
  let index = 0;
  /** Draws the next frame, and gives its place in the video (below 0: before the first frame). */
  const step = async () => {
    for (let count = 0; count < substeps; count++) {
      const animated = engine.step(realStep);
      if (hasVideo && count === substeps - 1) await engine.seekVideos();
      engine.draw(animated, realStep);
    }
    return index++ - lead;
  };
  return {
    /** Frames still to show. */
    get left() { return lead + frames - index; },
    /** Frames that "warm" plays unseen. */
    unseen: lead + skip,
    /** Plays the unseen frames; "tick" runs after each one. */
    async warm(tick: () => Promise<void>) {
      while (index < lead + skip) {
        const place = index;
        await step();
        /* The last unseen frames are kept for the seam crossfade. */
        if (place < lead && place >= lead - fadeFrames) tail.push(engine.captureFrame());
        await tick();
      }
    },
    /** Draws the next frame and starts reading it. The WebGL canvas holds the frame only until the next task, so the read starts at once. */
    async next(titleShows: number) {
      const shown = await step();
      const into = fadeFrames ? shown - (frames - fadeFrames) : -1;
      if (into >= 0) engine.drawFrameOver(tail[into], smoothstep(into / (fadeFrames - 1)));
      if (titleShows > 0) engine.drawOverlay(titleShows);
      return sphere ? engine.startSphereRead(width, height) : engine.startRead();
    },
    dispose() {
      for (const texture of tail) engine.releaseFrame(texture);
      engine.dispose();
    }
  };
}

/**
 * Renders and encodes a video of "scenes": one scene, or several joined by
 * crossfades (see stitchPlan). "onProgress" gets 0 to 1; an aborted "signal"
 * stops it with an AbortError. With "file" (in the app) FFmpeg makes the
 * video, and the result is null; with none (a plain browser) the result is
 * the video.
 */
export async function encodeVideo(
  source: Engine,
  scenes: SceneSource[],
  size: { width: number; height: number },
  options: VideoOptions,
  onProgress: (fraction: number) => void,
  signal: AbortSignal,
  file: ExportFile | null = null
): Promise<Blob | null> {
  /* A 360 video draws a square picture as tall as the video, then wraps it around the viewer. */
  const sphere = options.size === "sphere";
  /* The web view's encoder is picked first: a 360 video may get a smaller size or frame rate than asked for. */
  const picked = file ? null : await pickEncoder(size, options.fps, options.quality, sphere);
  const { width, height, fps } = picked ?? { ...size, fps: options.fps };
  const shape: ExportShape = { frameWidth: sphere ? height : width, width, height, fps, sphere };
  const wrap = options.style === "loop";
  const sceneFrames = scenes.map((scene) => Math.max(1, Math.round(baseLoopSeconds(scene.params, scene.state) * Math.max(1, Math.round(options.loops)) * fps)));
  const { fades, total } = stitchPlan(sceneFrames, fps, wrap);
  const seconds = total / fps;
  const seamless = wrap && scenes.length === 1;
  /* In a 360 video the title box is half the size, so it sits in front of the viewer and does not wrap far around. */
  const overlay = options.style === "title" ? await titleOverlay(shape.frameWidth, height, options.title, sphere ? 0.5 : 1) : null;
  const sink = file ? ffmpegSink(file) : webCodecsSink(picked!);

  const open = new Set<Clip>();
  let done = 0;
  let expected = total;
  let shownProgress = 0;
  let sliceStart = performance.now();
  /** Ends the slice when its time is up: reports the progress and lets the window draw. */
  const pause = async () => {
    if (performance.now() - sliceStart < SLICE_MS) return;
    shownProgress = Math.max(shownProgress, Math.min(1, done / expected));
    onProgress(shownProgress);
    await afterNextFrame();
    sliceStart = performance.now();
  };
  const stopIfAsked = () => {
    if (signal.aborted) throw new DOMException("The video export was stopped.", "AbortError");
  };
  const tick = async () => {
    stopIfAsked();
    done++;
    await pause();
  };
  const openScene = async (index: number, skip: number) => {
    const clip = await openClip(source, scenes[index], shape, options, seamless, skip, overlay);
    open.add(clip);
    expected += clip.unseen;
    await clip.warm(tick);
    return clip;
  };

  /**
   * Frames go from the GPU to the encoder as plain pixels: reading them
   * back is much faster than handing the encoder the canvas. A few reads
   * run at once, so the export does not wait for the GPU.
   */
  type Read = (into: Uint8Array) => Promise<void>;
  const pixels = new Uint8Array(width * height * 4);
  let otherPixels: Uint8Array | null = null;
  let readMs = 0;
  let sendMs = 0;
  const reads: { read: Read; other: Read | null; blend: number; shown: number }[] = [];
  const encodeOldest = async () => {
    const { read, other, blend, shown } = reads.shift()!;
    const readStart = performance.now();
    await read(pixels);
    if (other) {
      otherPixels ??= new Uint8Array(pixels.length);
      await other(otherPixels);
      mixFrames(pixels, otherPixels, blend);
    }
    const sendStart = performance.now();
    readMs += sendStart - readStart;
    await sink.add(pixels, shown);
    sendMs += performance.now() - sendStart;
  };
  let out = 0;
  /** Milliseconds spent drawing frames, for the line in the log at the end. */
  let drawMs = 0;
  const startedAt = performance.now();
  /** Adds the next frame of the video: from "clip", mixed with "over" when a crossfade runs. */
  const addFrame = async (clip: Clip, over: Clip | null, blend: number) => {
    stopIfAsked();
    const titleShows = overlay ? titleAlpha(out / fps, seconds, options.fadeOutMs) : 0;
    const drawStart = performance.now();
    const read = await clip.next(titleShows);
    const other = over ? await over.next(titleShows) : null;
    drawMs += performance.now() - drawStart;
    reads.push({ read, other, blend, shown: out });
    out++;
    done++;
    if (reads.length >= READS_AHEAD) await encodeOldest();
    await pause();
  };
  try {
    /* With a last crossfade back into the first scene, the video starts just after the frames that crossfade shows. */
    let clip = await openScene(0, wrap ? fades[scenes.length - 1] ?? 0 : 0);
    for (let index = 0; index < scenes.length; index++) {
      const fade = fades[index] ?? 0;
      while (clip.left > fade) await addFrame(clip, null, 0);
      if (!fade) continue;
      const next = await openScene((index + 1) % scenes.length, 0);
      for (let frame = 0; frame < fade; frame++) await addFrame(clip, next, smoothstep((frame + 1) / (fade + 1)));
      /* A read still running needs its engine. */
      while (reads.length) await encodeOldest();
      clip.dispose();
      open.delete(clip);
      clip = next;
    }
    while (reads.length) await encodeOldest();
    const video = await sink.finish();
    const elapsed = (performance.now() - startedAt) / 1000;
    console.warn(`video export: ${out} frames in ${elapsed.toFixed(1)} s (${(out / elapsed).toFixed(1)} a second); draw ${(drawMs / 1000).toFixed(1)} s, read ${(readMs / 1000).toFixed(1)} s, send ${(sendMs / 1000).toFixed(1)} s`);
    onProgress(1);
    return video;
  } finally {
    sink.close();
    for (const clip of open) clip.dispose();
  }
}
