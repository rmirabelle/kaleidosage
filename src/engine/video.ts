import { REFERENCE_CYCLE } from "./params";

/**
 * Experimental: a video as an image source. The video repeats a whole
 * number of times in each loop, so it stays in step with the scene, and
 * each repeat crossfades its end into its start, so it never jumps. The
 * crossfade needs two copies of the video: the one that shows, and the one
 * that fades in. They change roles at each repeat, so neither has to jump
 * while it shows.
 */

/** Seconds each repeat's end takes to fade into its start; a short video gets a shorter fade. */
const VIDEO_FADE = 1;
/** How far, in seconds, a playing video may be from its place before it jumps there. */
const MAX_DRIFT = 0.25;

export interface VideoPlan {
  /** The number of the repeat, counted on from time 0; the two copies change roles when it changes. */
  round: number;
  /** Where the copy that shows should be, in seconds of the video. */
  main: number;
  /** Where the copy that fades in should be, or null while no fade runs. */
  fadeIn: number | null;
  /** How much of the copy that fades in shows: 0 to 1. */
  mix: number;
}

const smoothstep = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t * t * (3 - 2 * t);
};

/**
 * Where the video copies are at animation time "time", for a loop of
 * "loopSeconds" real seconds and a video "duration" seconds long. A repeat
 * is the loop, or the loop split into equal parts that each fit in the
 * video with the fade. Each repeat shows the video from "fade" to
 * "fade + repeat"; over its last "fade" seconds the video's start, 0 to
 * "fade", fades in, and the next repeat goes on from there.
 */
export function videoLoopPlan(time: number, loopSeconds: number, duration: number): VideoPlan {
  const fade = Math.min(VIDEO_FADE, duration / 4);
  const parts = Math.max(1, Math.ceil(loopSeconds / (duration - fade) - 1e-9));
  const repeat = loopSeconds / parts;
  const cycle = Math.floor(time / REFERENCE_CYCLE);
  const inLoop = ((time - cycle * REFERENCE_CYCLE) / REFERENCE_CYCLE) * loopSeconds;
  const part = Math.min(parts - 1, Math.floor(inLoop / repeat));
  const at = inLoop - part * repeat;
  const round = cycle * parts + part;
  if (at < repeat - fade) return { round, main: fade + at, fadeIn: null, mix: 0 };
  const into = at - (repeat - fade);
  return { round, main: fade + at, fadeIn: into, mix: smoothstep(into / fade) };
}

/** Real seconds into the current loop at animation time "time", for a loop of "loopSeconds" real seconds. */
export function videoLoopTime(time: number, loopSeconds: number) {
  const cycle = Math.floor(time / REFERENCE_CYCLE);
  return ((time - cycle * REFERENCE_CYCLE) / REFERENCE_CYCLE) * loopSeconds;
}

/** Keeps a playing video near "target" seconds. A paused scene pauses the video. */
export function syncVideo(video: HTMLVideoElement, target: number, paused: boolean) {
  if (paused && !video.paused) video.pause();
  if (!video.seeking && Math.abs(video.currentTime - target) > MAX_DRIFT) video.currentTime = target;
  if (!paused && video.paused) void video.play().catch(() => { /* It tries again on the next frame. */ });
}

/** Makes a video wait, paused, at "target" seconds, so it is ready when its fade starts. */
export function cueVideo(video: HTMLVideoElement, target: number) {
  if (!video.paused) video.pause();
  if (!video.seeking && Math.abs(video.currentTime - target) > 0.02) video.currentTime = target;
}

/** Moves a video to exactly "target" seconds and waits until its frame is there (for video export). */
export function seekVideo(video: HTMLVideoElement, target: number) {
  video.pause();
  if (Math.abs(video.currentTime - target) < 1e-4) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => { window.clearTimeout(timeout); resolve(); };
    const timeout = window.setTimeout(done, 2000);
    video.addEventListener("seeked", done, { once: true });
    video.currentTime = target;
  });
}

/** A second, paused element that plays the same video file, ready to draw. */
export function copyVideo(video: HTMLVideoElement) {
  return new Promise<HTMLVideoElement>((resolve, reject) => {
    const copy = document.createElement("video");
    copy.crossOrigin = video.crossOrigin;
    copy.muted = true;
    copy.playsInline = true;
    copy.preload = "auto";
    copy.onloadeddata = () => resolve(copy);
    copy.onerror = () => reject(new Error("Could not read the source video again."));
    copy.src = video.currentSrc || video.src;
  });
}

/** Lets a video element made by copyVideo go, so its decoder is freed. */
export function releaseVideo(video: HTMLVideoElement) {
  video.pause();
  video.removeAttribute("src");
  video.load();
}
