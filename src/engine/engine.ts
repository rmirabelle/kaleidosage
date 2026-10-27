import { GROUP_PARAMS, NO_EFFECT, PARAM_KEYS, REFERENCE_CYCLE, createParams, createPlayState, defaultValue, hexToRgb, lensAngle, liveValue, rangeAt, rangeClock, startRangeAt, type GroupKey, type ParamKey } from "./params";
import { KaleidoRenderer, LASER_BEAMS, type FrameValues, type ImageSource } from "./renderer";
import type { TerrainData } from "./terrain";
import { MANDEL_CENTERS } from "./submodes";
import { audioLinkable, pushRange, pushedValue, type AudioSignal } from "./audio";
import { copyVideo, cueVideo, releaseVideo, seekVideo, syncVideo, videoLoopPlan, videoLoopTime } from "./video";
import { familyOf, intensityAt, positionAt, speedAt, travelAt, type Family, type SongScript } from "./songScript";
import { LiveSound } from "./liveSound";
import { isShown } from "./submodes";

/** While paused, how long the same frame values must last before the picture counts as still and frames stop (see needsDraw). */
const SETTLE_MS = 1000;
/** The same with a Time smear, whose oldest frames take longer to leave it. */
const SMEAR_SETTLE_MS = 6000;

const DEGREES = Math.PI / 180;

/**
 * How fast a single value glides to a new slider or knob value: the time
 * for about two thirds of the way. A slider moves in steps and a MIDI knob
 * has 128 places, so without the glide the picture jumps from step to step.
 */
const GLIDE_SECONDS = 0.03;

/**
 * How smoothly a value follows a MIDI control (see follow): about the time
 * the value takes to catch up with the control. A control has only 128
 * places and sends them at uneven times, so the value follows it like a
 * damped spring: it speeds up and slows down smoothly, as a playing range
 * does, and never jumps from step to step.
 */
const MIDI_SMOOTH_SECONDS = 0.1;

/** A value that follows a MIDI control: where it is and how fast it moves (per second). */
interface Follower {
  value: number;
  speed: number;
}

/**
 * One frame of a critically damped spring from "current" toward "target"
 * over "elapsed" seconds (the smooth damp of Game Programming Gems 4). It
 * changes "follower.speed" and returns the new value. It never overshoots
 * by much and always arrives with a smooth speed.
 */
function springStep(follower: Follower, current: number, target: number, elapsed: number) {
  const omega = 2 / MIDI_SMOOTH_SECONDS;
  const x = omega * elapsed;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const change = current - target;
  const push = (follower.speed + omega * change) * elapsed;
  follower.speed = (follower.speed - omega * push) * decay;
  return target + (change + push) * decay;
}

/** A held range plays on again over this time: the held value curves into the playing range (see planResume). */
const RESUME_SECONDS = 2;

/**
 * The way back into a playing range (see planResume): a curve from "from"
 * (at rest) to "to", where the range will be at the end, arriving with the
 * range's own speed there ("slope", per second), over "seconds" from
 * "start".
 */
interface Resume {
  from: number;
  to: number;
  slope: number;
  start: number;
  seconds: number;
}

/** The short way from one angle to another, in degrees from -180 to 180. */
const turnBetween = (from: number, to: number) => (((to - from) % 360) + 540) % 360 - 180;

/** A fully saturated color at "degrees" around the color wheel (0 red, 120 green, 240 blue), as red, green and blue from 0 to 1. */
function fullHue(degrees: number): [number, number, number] {
  const turn = (((degrees / 360) % 1) + 1) % 1;
  const channel = (offset: number) => Math.min(1, Math.max(0, Math.abs(((turn + offset) % 1) * 6 - 3) - 1));
  return [channel(0), channel(2 / 3), channel(1 / 3)];
}

/** Dev only: a running Engine keeps its old code after a hot update, so engine edits reload the window. */
if (import.meta.hot) import.meta.hot.accept(() => window.location.reload());

/** The real time of one step of a scrub (see Engine.seekTo), in seconds: as fine as a fast screen's frames. */
const SCRUB_STEP = 1 / 120;

/** Owns the parameters, the animation clock and the render loop. */
/**
 * The Julia point: the point at angle "shape" on the edge of the Mandelbrot
 * set's main body (e^it / 2 - e^2it / 4), moved out from the center by "edge".
 */
export function juliaPoint(shape: number, edge: number): [number, number] {
  return [edge * (Math.cos(shape) / 2 - Math.cos(2 * shape) / 4), edge * (Math.sin(shape) / 2 - Math.sin(2 * shape) / 4)];
}

/**
 * Images that repeat seamlessly (the repeating test patterns). With auto
 * tiling, a repeating first image is repeated past its edges, not mirrored.
 */
export const repeatingImages = new WeakSet<object>();

/**
 * Following a song (see Engine.songStep): the largest move of the song
 * between two frames that still counts as playing on. A move back of more
 * than SONG_BACK is a jump too; a smaller one is the song clock's
 * smoothing, and the picture waits for it.
 */
const SONG_JUMP = 0.5;
const SONG_BACK = 0.05;

/** What the picture follows (see Engine.script): the song's script, its clock, and whether it plays. */
export interface SongSource {
  script: SongScript;
  time: () => number;
  playing: () => boolean;
}

/** The effect group of each setting (see GROUP_PARAMS). */
const GROUP_OF = new Map((Object.entries(GROUP_PARAMS) as [GroupKey, ParamKey[]][]).flatMap(([group, keys]) => keys.map((key) => [key, group] as const)));

/** The Droste spiral's length of one copy in the shader's log space: log(1 / size). */
const drosteCopy = (size: number) => -Math.log(Math.min(0.95, Math.max(0.05, size)));

/**
 * The Droste spiral's travel for the shader. For the Droste spiral the
 * travel counts copies (see step), so a moving copy size only changes the
 * size of the frames and does not move them. Only the part of a copy goes
 * to the shader: the picture repeats at each copy, so this does not show,
 * and the shader's exp() of a large travel would be too small for 32-bit
 * floats (the whole picture would read one point and turn gray).
 */
function drosteTravel(copies: number, size: number) {
  return (copies - Math.floor(copies)) * drosteCopy(size);
}

export class Engine {
  readonly params = createParams();
  readonly state = createPlayState();
  /** Momentary comparison only: never serialized, saved, or added to Undo history. */
  readonly bypassedGroups = new Set<GroupKey>();
  /** Settings held at no effect while Ctrl + mouse is down on their name (see live). Momentary only, like bypassedGroups. */
  readonly bypassedParams = new Set<ParamKey>();
  /** Temporarily isolate one effect, without changing its saved enable state. */
  soloGroup: GroupKey | null = null;
  private readonly renderer: KaleidoRenderer;
  private readonly frameListeners = new Set<() => void>();
  private snapshotWaiters: ((blob: Blob | null) => void)[] = [];
  private frameId = 0;
  /** See needsDraw: a change that the frame's values do not show asks for a frame; and the paused picture's values and since when they are the same. */
  private awake = true;
  private stillKey: string | null = null;
  private stillSince = 0;
  private lastTime = 0;
  /** Smoothed time between frames and smoothed CPU time of one render call, in milliseconds. */
  /** For the performance panel: the smoothed time between frames and the CPU time of a frame, and whether the last frame drew (see needsDraw). */
  readonly stats = { frameMs: 0, cpuMs: 0, drawing: true };

  /** "size" fixes the picture size in pixels, for an engine that renders off the screen (see forExport). */
  constructor(readonly canvas: HTMLCanvasElement, size: [number, number] | null = null) {
    this.renderer = new KaleidoRenderer(canvas, size);
  }

  /**
   * A copy of this engine that renders off the screen at a fixed size, for
   * video export: the same settings and images, its own clock and trails.
   * A video gets its own copy, so the export can move it frame by frame
   * while the picture on the screen plays on. Dispose it when done.
   */
  async forExport(width: number, height: number) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const copy = new Engine(canvas, [width, height]);
    /* Effects that work in pixels use the screen's pixel size, so the video looks like the screen. */
    const screenHeight = this.renderer.canvasSize[1];
    if (screenHeight > 0) copy.renderer.texelScale = height / screenHeight;
    Object.assign(copy.params, structuredClone(this.params));
    Object.assign(copy.state, structuredClone(this.state));
    try {
      for (const slot of [0, 1] as const) {
        const source = this.sources[slot];
        if (!source) continue;
        if (source instanceof HTMLVideoElement) {
          const video = await copyVideo(source);
          copy.ownVideos.push(video);
          copy.setImage(video, slot);
          await copy.partnerReady[slot];
        } else {
          copy.setImage(source, slot);
        }
      }
      if (this.driverVideo) {
        const video = await copyVideo(this.driverVideo);
        copy.ownVideos.push(video);
        copy.setDriverVideo(video);
      }
      if (this.pictureSource instanceof HTMLVideoElement) {
        const video = await copyVideo(this.pictureSource);
        copy.ownVideos.push(video);
        copy.setPicture(video);
      } else if (this.pictureSource) {
        copy.setPicture(this.pictureSource);
      }
    } catch (error) {
      copy.dispose();
      throw error;
    }
    copy.hasSecondImage = this.hasSecondImage;
    return copy;
  }

  /**
   * A crossfade from one scene to the next (see fadeOut): the last frame of
   * the old scene, drawn over the new scene, which plays under it, until it
   * has faded away.
   */
  private fade: { texture: WebGLTexture; start: number; seconds: number } | null = null;
  /** Calls waiting for the frame that a crossfade starts from, and the fade time they asked for. */
  private fadeWaiters: { resolve: () => void; seconds: number }[] = [];
  /** Lasers' recent Sweep values (radians) on the play clock, oldest first, for Sweep delay (see laserSweeps). */
  private sweepHistory: { clock: number; value: number }[] = [];

  /**
   * Starts a crossfade: the next frame is kept as a still picture, and the
   * promise resolves right after it, so the caller can put the next scene
   * in the engine before the frame after. That still picture then fades out
   * over the new scene in "seconds" of real time. A crossfade during a
   * crossfade starts from the mixed picture, so nothing jumps. With the
   * render loop stopped, it resolves at once, with no crossfade.
   */
  fadeOut(seconds: number): Promise<void> {
    if (!this.frameId || seconds <= 0) return Promise.resolve();
    return new Promise((resolve) => this.fadeWaiters.push({ resolve, seconds }));
  }

  /** Draws the crossfade's still picture over the frame (see fadeOut), and keeps a new one when a crossfade waits for it. */
  private drawFade() {
    if (this.fade) {
      const t = (this.realTime - this.fade.start) / this.fade.seconds;
      if (t >= 1) {
        this.renderer.releaseFrame(this.fade.texture);
        this.fade = null;
      } else {
        this.renderer.drawFrameOver(this.fade.texture, 1 - t * t * (3 - 2 * t));
      }
    }
    if (!this.fadeWaiters.length) return;
    const waiters = this.fadeWaiters;
    this.fadeWaiters = [];
    if (this.fade) this.renderer.releaseFrame(this.fade.texture);
    this.fade = { texture: this.renderer.captureFrame(), start: this.realTime, seconds: waiters[waiters.length - 1].seconds };
    for (const { resolve } of waiters) resolve();
  }

  /** Videos this engine made itself (see forExport); dispose lets them go. */
  private readonly ownVideos: HTMLVideoElement[] = [];

  start() {
    if (this.frameId) return;
    this.lastTime = performance.now();
    this.frameId = requestAnimationFrame(this.frame);
  }

  stop() {
    cancelAnimationFrame(this.frameId);
    this.frameId = 0;
    /* No frame comes to start a crossfade from; the callers go on with no crossfade. */
    for (const { resolve } of this.fadeWaiters) resolve();
    this.fadeWaiters = [];
    for (const video of [...this.videos, ...this.partners]) video?.pause();
  }

  /** True when a second image is loaded; only then does the image blend have an effect. */
  hasSecondImage = false;

  /** The image in each slot, as set. */
  private readonly sources: [ImageSource | null, ImageSource | null] = [null, null];

  /** The video in each image slot, if the slot holds one (experimental). */
  private readonly videos: [HTMLVideoElement | null, HTMLVideoElement | null] = [null, null];
  /** A second copy of each slot's video, which fades in at the video's loop point (see video.ts). */
  private readonly partners: [HTMLVideoElement | null, HTMLVideoElement | null] = [null, null];
  /** Settles when the slot's partner is ready, or when making it failed (the video then loops with a jump). */
  private readonly partnerReady: [Promise<void>, Promise<void>] = [Promise.resolve(), Promise.resolve()];
  private disposed = false;

  /** True when an image slot holds a video. */
  get hasVideo() {
    return this.videos.some(Boolean);
  }

  /** Sets the first (slot 0) or the second (slot 1) image. A video plays in step with the loop. */
  /** The Driver effect's own video (driver 5), or null. Its owner (the scene) keeps it; the engine plays it while it is in use. */
  private driverVideo: HTMLVideoElement | null = null;

  setDriverVideo(video: HTMLVideoElement | null) {
    this.wake();
    if (this.driverVideo && this.driverVideo !== video) this.driverVideo.pause();
    this.driverVideo = video;
    this.renderer.setDriverVideo(video);
  }

  /**
   * Where the driver video should be: the driver's run time (seconds ×
   * Speed) around the video's length, so Speed sets its play rate and a
   * paused scene holds it. Null while the Driver effect does not use it.
   */
  private driverVideoTarget() {
    const video = this.driverVideo;
    if (!video || !(video.duration > 0) || !this.state.groups.driver || this.state.driverSource !== 5) return null;
    return this.state.driverTime % video.duration;
  }

  /** The Image or Video effect's image or video, or null. Its owner (the scene) keeps it; the engine plays a video while the effect is on. */
  private pictureSource: ImageSource | null = null;

  setPicture(source: ImageSource | null) {
    this.wake();
    if (this.pictureSource instanceof HTMLVideoElement && this.pictureSource !== source) this.pictureSource.pause();
    this.pictureSource = source;
    this.renderer.setPicture(source);
  }

  /**
   * Where the overlay's video should be: the scene's clock around the
   * video's length, so it plays at its own speed, loops, and holds while
   * the scene is paused or waits for the music. Null while the Image or Video
   * effect is off or holds no video.
   */
  private pictureVideoTarget() {
    const video = this.pictureSource;
    if (!(video instanceof HTMLVideoElement) || !(video.duration > 0) || !this.state.groups.picture || !this.state.fxOrder.includes("picture")) return null;
    return this.state.clock % video.duration;
  }

  /** Freeze background's three parts of the FX list (see FrameValues.freeze), or null. */
  private freezeParts(): FrameValues["freeze"] {
    const order = this.state.fxOrder;
    const at = order.indexOf("solid");
    if (!this.state.solidKeep || at < 0 || at === order.length - 1) return null;
    const rest = order.slice(at + 1);
    const picture = rest.indexOf("picture");
    const end = picture < 0 ? rest.length : picture;
    if (end === 0) return null;
    return { before: order.slice(0, at), object: rest.slice(0, end), after: rest.slice(end) };
  }

  /** The camera's real terrain (see docs/TERRAIN.md), or null. The scene owns it; the engine draws with it. */
  terrain: TerrainData | null = null;

  /** The drawn picture's shape (width over height): real terrain loads in this shape. */
  aspect() {
    return this.renderer.aspect();
  }

  setTerrain(terrain: TerrainData | null) {
    this.wake();
    this.terrain = terrain;
    this.renderer.setTerrain(terrain);
  }

  /** Keeps the overlay's video at its place, and stops it while it is not used. */
  private syncPictureVideo(paused: boolean) {
    const video = this.pictureSource;
    if (!(video instanceof HTMLVideoElement)) return;
    const target = this.pictureVideoTarget();
    if (target === null) {
      if (!video.paused) video.pause();
      return;
    }
    video.playbackRate = 1;
    syncVideo(video, target, paused || this.gated);
  }

  /** Keeps the driver video at its place: it plays at Speed, waits while paused or at Speed 0, and stops while it is not used. */
  private syncDriverVideo(paused: boolean) {
    const video = this.driverVideo;
    if (!video) return;
    const target = this.driverVideoTarget();
    if (target === null) {
      if (!video.paused) video.pause();
      return;
    }
    const speed = this.live("driverSpeed");
    if (speed < 0.0625) {
      cueVideo(video, target);
      return;
    }
    video.playbackRate = Math.min(16, speed);
    syncVideo(video, target, paused);
  }

  setImage(source: ImageSource, slot: 0 | 1 = 0) {
    this.wake();
    this.renderer.setImage(source, slot);
    this.sources[slot] = source;
    this.setVideo(slot, source instanceof HTMLVideoElement ? source : null);
    if (slot === 1) this.hasSecondImage = true;
  }

  /** Removes the second image; the picture shows only the first. */
  clearSecondImage() {
    this.wake();
    this.hasSecondImage = false;
    this.sources[1] = null;
    this.renderer.stopVideo(1);
    this.setVideo(1, null);
  }

  /** A video that leaves its slot pauses, unless it is still in the other slot (after a swap). */
  private setVideo(slot: 0 | 1, video: HTMLVideoElement | null) {
    const previous = this.videos[slot];
    this.videos[slot] = video;
    if (previous && previous !== video && !this.videos.includes(previous)) previous.pause();
    const partner = this.partners[slot];
    this.partners[slot] = null;
    if (partner) releaseVideo(partner);
    if (!video) return;
    this.partnerReady[slot] = copyVideo(video).then((copy) => {
      if (this.disposed || this.videos[slot] !== video) {
        releaseVideo(copy);
        return;
      }
      this.partners[slot] = copy;
      this.renderer.setVideoPartner(slot, copy);
    }).catch(() => { /* Without a partner, the video loops with a jump. */ });
  }

  /**
   * Places the slot's video copies for the current time: the copy that shows
   * and, near the video's loop point, the copy that fades in (see
   * videoLoopPlan). "place" moves one copy; it returns a promise when it waits.
   */
  private placeVideo(slot: 0 | 1, place: (video: HTMLVideoElement, target: number, waiting: boolean) => Promise<void> | void) {
    const video = this.videos[slot];
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return [];
    const partner = this.partners[slot];
    if (!this.state.videoCrossfade) {
      /* The old way: the video starts again at the start of each loop, and repeats inside a loop that is longer than it. */
      const waits = [place(video, videoLoopTime(this.state.time, this.params.cycle.value) % video.duration, false)];
      if (partner) waits.push(place(partner, 0, true));
      this.renderer.showVideo(slot, video, 0);
      return waits;
    }
    const plan = videoLoopPlan(this.state.time, this.params.cycle.value, video.duration);
    const copies = partner ? [video, partner] : [video];
    const main = copies[((plan.round % copies.length) + copies.length) % copies.length];
    const other = copies.find((copy) => copy !== main) ?? null;
    const waits = [place(main, plan.main, false)];
    if (other) waits.push(place(other, plan.fadeIn ?? 0, plan.fadeIn === null));
    this.renderer.showVideo(slot, main, plan.mix);
    return waits;
  }

  /** GPU pass times, render sizes and whether GPU timing is measured. */
  get timer() {
    return this.renderer.timer;
  }

  get renderInfo() {
    return this.renderer.info;
  }

  /** An estimate of the GPU memory the picture uses, in bytes (see trackTextureMemory). */
  get gpuBytes() {
    return this.renderer.memory.bytes();
  }

  /**
   * How fast animation time runs: the shared cycle sets it. A
   * REFERENCE_CYCLE-second cycle runs at 1×, and a shorter cycle runs
   * faster by the same ratio, the motion with no range included.
   */
  get speed() {
    return REFERENCE_CYCLE / Math.max(1e-3, this.params.cycle.value);
  }

  /**
   * The seamless spiral's copy count: the whole number nearest the middle
   * of the twist's range (or the twist itself, with no range). It stays the
   * same while the twist moves inside its range, so the spiral only
   * stretches and never jumps. A twist that comes within 0.5 of 0 gets 0:
   * the spiral then slants the image instead, which can pass through 0.
   */
  get spiralCopies() {
    const twist = this.params.mapArms;
    const [low, high] = twist.on ? [twist.low ?? twist.min, twist.high ?? twist.max] : [twist.value, twist.value];
    const nearest = Math.min(Math.abs(low), Math.abs(high));
    if (low * high <= 0 || nearest < 0.5) return 0;
    return Math.max(1, Math.round(Math.abs((low + high) / 2)));
  }

  /**
   * Extra warp flow, in warp time per second of animation time. A seamless
   * video export sets it, so the warp comes back to its start at the loop's end.
   */
  warpFlowOffset = 0;

  /** The glided value of each single value that moves (see GLIDE_SECONDS and glide). */
  private readonly glided = new Map<ParamKey, number>();

  /**
   * Ranges that a MIDI control holds (see holdRange): the shown value and
   * its speed, the control's value it follows, and, after a click on play,
   * the way back into the playing range.
   */
  private readonly holds = new Map<ParamKey, Follower & { target: number; resume?: Resume; original?: { low?: number; high?: number } }>();
  /** Single values that follow a MIDI control (see follow). */
  private readonly followers = new Map<ParamKey, Follower>();
  /** Real seconds of frames so far, for the holds. */
  private realTime = 0;

  /**
   * The sound that audio links follow (see docs/AUDIO.md), or null, when
   * links have no effect. The app sets it; a video export's copy has none,
   * so a video plays the ranges with no sound.
   */
  audio: AudioSignal | null = null;
  /**
   * The song script that the picture follows (see songScript.ts), the
   * song's clock, and whether the song plays; or null. The app sets it.
   * A setting with an audio link follows its link, not the script.
   */
  get script() {
    return this.following;
  }
  set script(next: SongSource | null) {
    /* Another song: the clocks follow it from its start (see songStep). */
    if (next?.script !== this.following?.script) this.followed = false;
    this.following = next;
  }
  private following: SongSource | null = null;
  /** The song's time in this frame (see frame): read once, so every value of a frame has the same time. */
  private songTime = 0;
  /**
   * The music gate (the app sets it): while it returns false, the scene's
   * clocks stand still though the scene is set to play, as when the
   * playlist leads and its music is stopped. Null: no gate.
   */
  musicGate: (() => boolean) | null = null;
  /** True while the music gate holds the scene still (see musicGate). */
  private get gated() {
    return this.musicGate !== null && !this.musicGate();
  }
  /** True while the picture stands still: the scene is paused, or the music gate holds it (a stopped playlist). */
  get still() {
    return this.state.paused || this.gated;
  }
  /** True once the clocks follow the song's time (see followTo); a new scene or script makes them follow again. */
  private followed = false;

  /**
   * Puts the picture at "time" in the song, at once: the clock is the song's
   * time, and animation time is how far the song's pace has run it by then
   * (see travelAt), so every range is where playing would have put it. The
   * flows that add up their own speeds (warp flow, tunnel travel, camera
   * flight, the driver) start again from 0, as after Stop; a flow has no
   * place to be in, so this does not show. The scene stays playing or
   * paused; the trails start again from the picture there.
   */
  private followTo(time: number) {
    const paused = this.state.paused;
    this.rewind();
    this.state.paused = paused;
    this.state.clock = time;
    this.state.time = this.speed * travelAt(this.script!.script, time);
    this.songTime = time;
    this.followed = true;
  }

  /** For a scene that comes in while the picture follows the song: its clocks catch up with the song in the next frame (see followTo), in place of a start from 0. */
  followAgain() {
    this.followed = false;
  }

  /** True when the setting shows in the scene: its effect is on, and its submode shows its slider. */
  isShown(key: ParamKey) {
    const group = GROUP_OF.get(key);
    return !(group && !this.state.groups[group]) && isShown(key, this.state);
  }

  /** For the Playlist card: the song's time in this frame, its intensity there (0 to 1), and the pace of animation time (see speedAt); null with no script. */
  get songNow() {
    if (!this.script) return null;
    const { script } = this.script;
    return { time: this.songTime, intensity: intensityAt(script, this.songTime), pace: this.script.playing() ? speedAt(script, this.songTime) : 0 };
  }

  /** The live sound's shapes for the switched-on settings (see liveSound.ts), moved on in each frame. */
  private readonly liveSound = new LiveSound();

  /** True when the setting's audio switch is on (see PlayState.sound). */
  soundOn(key: ParamKey) {
    return Boolean(this.state.sound[key]) && audioLinkable(key, this.params[key]);
  }

  /** The settings whose audio switch is on. */
  soundLinks() {
    return (Object.keys(this.state.sound) as ParamKey[]).filter((key) => this.soundOn(key));
  }

  /** Turns the setting's audio switch on or off. The row and the Audio panel hear of it through paramChanged. */
  setSound(key: ParamKey, on: boolean) {
    if (on && audioLinkable(key, this.params[key])) this.state.sound[key] = true;
    else delete this.state.sound[key];
    this.paramChanged(key);
  }

  /**
   * Enable All: the audio switch of every setting that has a range turns on
   * (a range says how far the setting may move). Disable All: every switch
   * turns off.
   */
  setSoundAll(on: boolean) {
    for (const key of PARAM_KEYS) {
      const param = this.params[key];
      const next = on ? Boolean(this.state.sound[key]) || Boolean(param.on && audioLinkable(key, param)) : false;
      if (next === Boolean(this.state.sound[key])) continue;
      this.setSound(key, next);
    }
  }

  /**
   * What moves a switched-on setting now: the song's plan while the
   * picture follows a song, else the live sound while the app listens, else
   * nothing (the setting plays as it would with its switch off). A MIDI
   * hold wins over both.
   */
  private soundSource(key: ParamKey): "song" | "live" | null {
    if (!this.soundOn(key) || this.isHeld(key)) return null;
    return this.script ? "song" : this.audio ? "live" : null;
  }

  /** The family by which the sound moves this setting now (see familyOf), or null when nothing moves it. */
  soundFamily(key: ParamKey): Family | null {
    return this.soundSource(key) ? familyOf(key) : null;
  }

  /** Each beat-moved setting's own place in the beat wave, from its seed, so they do not all move as one. */
  private beatOffset(key: ParamKey) {
    return (((this.params[key].seed ?? 0) * 0.618034) % 1) * 2;
  }

  /** How far the sound moves the setting now, from 0 (its start handle, or its slider value) to 1 (its end handle); 0 when nothing moves it. */
  audioPush(key: ParamKey) {
    const source = this.soundSource(key);
    if (!source) return 0;
    const family = familyOf(key);
    const offset = family === "beat" ? this.beatOffset(key) : 0;
    return source === "song" ? positionAt(this.script!.script, family, this.songTime, offset) : this.liveSound.position(family, offset);
  }

  /**
   * The value the sound gives the setting now, or null when nothing moves
   * it (see docs/AUDIO.md, part 3): between its range's handles, or with no
   * range, from its slider value toward the end of the slider with more
   * room (see pushRange).
   */
  private soundValue(key: ParamKey) {
    if (!this.soundSource(key)) return null;
    const param = this.params[key];
    const part = this.audioPush(key);
    return param.on ? rangeAt(param, part) : pushedValue(param, param.value, pushRange(param).end, part);
  }

  /**
   * A MIDI control moves a range's playhead: the value goes to "target" (a
   * value between the range's handles) and stays there. The range stops
   * playing for this value, but its handles stay, and its clock runs on
   * underneath. The first move starts from where the playhead is, at the
   * playhead's own speed, and slows smoothly to the control, so there is no
   * jump and no sudden stop. The value stays held until resumeRange (the
   * slider's play button). A move while it curves back holds it again from
   * where it is.
   */
  holdRange(key: ParamKey, target: number) {
    const hold = this.holds.get(key);
    const wasHeld = this.isHeld(key);
    if (hold) Object.assign(hold, { target, resume: undefined });
    else this.holds.set(key, { value: this.live(key), speed: this.rangeSpeed(key, 0), target });
    if (!wasHeld) this.paramChanged(key);
  }

  /** The value a MIDI control set for a held range, or undefined when nothing holds it. */
  heldValue(key: ParamKey) {
    return this.isHeld(key) ? this.holds.get(key)!.target : undefined;
  }

  /** The range's value "later" real seconds from now (nothing moves while paused). */
  private rangeAhead(key: ParamKey, later: number) {
    /* A range that follows the song is where the song will be then. */
    if (this.soundOn(key) && this.script) {
      const family = familyOf(key);
      const ahead = this.script.playing() ? later : 0;
      const offset = family === "beat" ? this.beatOffset(key) : 0;
      return rangeAt(this.params[key], positionAt(this.script.script, family, this.songTime + ahead, offset));
    }
    const moving = this.state.paused ? 0 : later;
    return liveValue(this.params[key], { ...this.state, time: this.state.time + moving * this.speed, clock: this.state.clock + moving });
  }

  /** How fast the range moves "later" real seconds from now, per second. */
  private rangeSpeed(key: ParamKey, later: number) {
    return this.distance(this.params[key], this.rangeAhead(key, later - 0.01), this.rangeAhead(key, later + 0.01)) / 0.02;
  }

  /** True while a MIDI control holds the range's value (see holdRange), and it is not on its way back. */
  isHeld(key: ParamKey) {
    const hold = this.holds.get(key);
    return Boolean(hold && !hold.resume);
  }

  /**
   * Ends every MIDI hold at once, with no curve: each range plays normally
   * again, and its row shows its MIDI icon. For a scene that opens or
   * starts, so an old hold never carries into it.
   */
  releaseHolds() {
    const keys = [...this.holds.keys()];
    this.holds.clear();
    this.followers.clear();
    for (const key of keys) this.paramChanged(key);
  }

  /**
   * Forgets the glided values, so each value shows its slider value at once.
   * For a scene that comes back from its tab: its values must not glide
   * from the values of the scene that was shown before it.
   */
  settle() {
    this.glided.clear();
    this.followers.clear();
  }

  /** True while a MIDI control holds any range (see isHeld). */
  get anyHeld() {
    return [...this.holds.keys()].some((key) => this.isHeld(key));
  }

  /** Plays every held range again, each on its own curve (see resumeRange). */
  resumeAll() {
    for (const key of [...this.holds.keys()]) this.resumeRange(key);
  }

  /** Plays a held range again: the value curves into the playing range (see planResume). */
  resumeRange(key: ParamKey) {
    const hold = this.holds.get(key);
    if (!hold || hold.resume) return;
    /* A range that Ctrl + MIDI stretched gets its handles back first, so it plays as the user set it. */
    if (hold.original) {
      Object.assign(this.params[key], hold.original);
      hold.original = undefined;
    }
    hold.resume = this.planResume(key, hold.value);
    this.paramChanged(key);
  }

  /**
   * Ctrl + MIDI moved a held range's handles (see pushPlayhead). The handles
   * from before the first move are kept, so play gives them back.
   */
  stretchRange(key: ParamKey, low: number, high: number) {
    const hold = this.holds.get(key);
    const param = this.params[key];
    if (!hold || !param.on) return;
    hold.original ??= { low: param.low, high: param.high };
    Object.assign(param, { low, high });
    this.paramChanged(key);
  }

  /**
   * The way back from a held value into the playing range. The range plays
   * on during the curve, so the curve does not aim at where the range is
   * now: it aims at where the range will be when the curve ends, and it
   * arrives there with the range's own speed. The value then leaves the
   * hold at rest and joins the range with no jump and no change of speed.
   */
  private planResume(key: ParamKey, from: number): Resume {
    const param = this.params[key];
    const seconds = RESUME_SECONDS;
    const to = from + this.distance(param, from, this.rangeAhead(key, seconds));
    return { from, to, slope: this.rangeSpeed(key, seconds), start: this.realTime, seconds };
  }

  /**
   * A MIDI control set the value: the shown value follows it like a damped
   * spring (see MIDI_SMOOTH_SECONDS), until it is there and at rest.
   */
  follow(key: ParamKey) {
    if (this.followers.has(key)) return;
    this.followers.set(key, { value: this.glided.get(key) ?? this.params[key].value, speed: 0 });
  }

  /**
   * The value a parameter has now. A range gives its moving value; a single
   * value that can have a range gives its glided value. A value that never
   * moves (a count such as Warp detail) does not glide.
   */
  live(key: ParamKey) {
    /* A bypassed setting has no effect: its value with no effect, or its start-up default. */
    if (this.bypassedParams.has(key)) return NO_EFFECT[key] ?? defaultValue(key);
    const param = this.params[key];
    /* A setting whose audio switch is on goes where the sound puts it (see soundValue); a range keeps that value, to glide on from it. */
    const sound = this.soundValue(key);
    if (sound !== null) {
      if (param.on) this.glided.set(key, sound);
      return sound;
    }
    const value = liveValue(param, this.state);
    if (!param.drift) return value;
    /* A range keeps its last value here, so a range turned off glides from where it was. */
    const shown = this.glided.get(key);
    if (param.on || shown === undefined) {
      const held = param.on ? this.holds.get(key)?.value ?? value : value;
      this.glided.set(key, held);
      return held;
    }
    return shown;
  }

  /** From one value to another; for an angle that turns all the way round, the short way round the circle. */
  private distance(param: { drift?: string; min: number; max: number }, from: number, to: number) {
    return param.drift === "spin" && param.min === 0 && param.max === 360 ? turnBetween(from, to) : to - from;
  }

  /**
   * Moves each glided value toward its slider value, by real time, so it
   * glides while paused too. An angle that turns all the way round glides
   * the short way round the circle.
   */
  private glide(elapsed: number) {
    this.realTime += elapsed;
    const part = 1 - Math.exp(-elapsed / GLIDE_SECONDS);
    for (const [key, current] of this.glided) {
      const param = this.params[key];
      if (param.on) continue;
      const circle = param.drift === "spin" && param.min === 0 && param.max === 360;
      const wrap = (value: number) => circle ? ((value % 360) + 360) % 360 : value;
      /* A value that follows a MIDI control moves like a spring, until it is there and at rest. */
      const follower = this.followers.get(key);
      if (follower) {
        const value = springStep(follower, current, current + this.distance(param, current, param.value), elapsed);
        const settled = Math.abs(this.distance(param, value, param.value)) < param.step * 1e-3 && Math.abs(follower.speed) < param.step * 1e-2;
        if (settled) this.followers.delete(key);
        this.glided.set(key, wrap(settled ? param.value : value));
        continue;
      }
      const distance = this.distance(param, current, param.value);
      const next = Math.abs(distance) < param.step * 1e-3 ? param.value : current + distance * part;
      this.glided.set(key, wrap(next));
    }
    /* Held ranges: the held value follows the control like a spring; after a click on play, it curves back into the playing range. */
    for (const [key, hold] of this.holds) {
      const param = this.params[key];
      /* The range was turned off: the hold ends, and the row shows its MIDI icon again. */
      if (!param.on) {
        this.holds.delete(key);
        this.paramChanged(key);
        continue;
      }
      if (!hold.resume) {
        hold.value = springStep(hold, hold.value, hold.value + this.distance(param, hold.value, hold.target), elapsed);
        continue;
      }
      const { from, to, slope, start, seconds } = hold.resume;
      const t = (this.realTime - start) / seconds;
      if (t >= 1) {
        this.holds.delete(key);
        continue;
      }
      /* A curve that leaves "from" at rest and reaches "to" with the range's speed (cubic Hermite). */
      const t2 = t * t;
      const t3 = t2 * t;
      const value = from + (to - from) * (3 * t2 - 2 * t3) + slope * seconds * (t3 - t2);
      /* Its speed is kept, so a MIDI move during the curve goes on from it with no sudden stop. */
      if (elapsed > 0) hold.speed = (value - hold.value) / elapsed;
      hold.value = value;
    }
  }

  /** Starts a range from its start handle now, for example the fade of a new second image. */
  startRangeNow(key: ParamKey) {
    const param = this.params[key];
    startRangeAt(param, rangeClock(param, this.state));
  }

  /**
   * Stop: pauses and goes back to time 0, where every drifting value is at
   * its start handle. A range that was started mid-animation (such as the
   * image blend of a new second image) or that has its own time has its
   * timing reset, so it is at its start too. The trails start again from the still picture.
   */
  rewind() {
    this.state.paused = true;
    this.state.time = 0;
    this.state.clock = 0;
    for (const key of PARAM_KEYS) if (this.params[key].drift) startRangeAt(this.params[key], 0);
    this.state.warpTime = 0;
    this.state.mandelFlowTime = 0;
    this.state.driverTime = 0;
    this.state.outlineTime = 0;
    this.state.outlineFlowTime = 0;
    this.state.solidSpinTurns = 0;
    this.state.solidTumbleTurns = 0;
    this.state.outlineSpinTurns = 0;
    this.state.outlineTumbleTurns = 0;
    this.state.mapTravel = 0;
    this.state.cameraX = 0;
    this.state.cameraY = 0;
    this.renderer.resetTrails();
    this.wake();
  }

  /**
   * Scrub: moves the scene to "clock" real seconds after its start, as if
   * it had played there. From the start (see rewind) it steps forward in
   * steps of SCRUB_STEP without drawing, so the values that add up over
   * time (warp flow, driver time, tunnel travel, camera flight) are where
   * playing would have put them; the ranges follow the time. The trails
   * start again from the picture there. It stays playing or paused as it
   * was.
   */
  seekTo(clock: number) {
    const paused = this.state.paused;
    /* A scrub moves the scene even while the music gate holds it still (see musicGate). */
    const gate = this.musicGate;
    this.musicGate = null;
    this.rewind();
    this.state.paused = false;
    for (let left = Math.max(0, clock); left > 1e-9; left -= SCRUB_STEP) this.step(Math.min(SCRUB_STEP, left));
    this.state.paused = paused;
    this.musicGate = gate;
    this.wake();
  }

  /** Starts the trails again from the still picture, for example after a new scene. */
  resetTrails() {
    this.renderer.resetTrails();
    this.wake();
  }

  /**
   * Draws the next frame even when the paused picture has not changed (see
   * needsDraw): for a change that the frame's values do not show, such as a
   * new image.
   */
  wake() {
    this.awake = true;
  }

  /**
   * While paused, a frame that would draw the same picture as the last one
   * is not drawn, and the GPU rests; the canvas keeps showing the last
   * picture. The picture is the same when the frame's values (less the
   * frame time) and the canvas size have not changed for SETTLE_MS: in that
   * time the picture settles (a value that glides to rest, a video frame
   * that arrives after a seek). A Time smear settles for SMEAR_SETTLE_MS,
   * as its old frames leave it. Trails always draw, as they fade on while
   * paused. A crossfade, a snapshot or wake() draws at once.
   */
  private needsDraw(values: FrameValues, now: number) {
    const trails = values.fxOrder.includes("trails") && values.trailMode !== 0;
    const forced = this.awake || Boolean(this.fade) || this.fadeWaiters.length > 0 || this.snapshotWaiters.length > 0;
    this.awake = false;
    if ((!this.state.paused && !this.gated) || trails || forced) {
      this.stillKey = null;
      return true;
    }
    const key = `${this.canvas.clientWidth}x${this.canvas.clientHeight}@${window.devicePixelRatio} ${JSON.stringify({ ...values, fadeScale: 0 })}`;
    if (key !== this.stillKey) {
      this.stillKey = key;
      this.stillSince = now;
      return true;
    }
    const settle = values.fxOrder.includes("smear") && values.smear > 0 ? SMEAR_SETTLE_MS : SETTLE_MS;
    return now - this.stillSince < settle;
  }

  /** Stops the render loop and frees the GPU context. The engine cannot be used after this. */
  dispose() {
    this.stop();
    if (this.fade) this.renderer.releaseFrame(this.fade.texture);
    this.fade = null;
    this.renderer.dispose();
    this.disposed = true;
    for (const video of [...this.ownVideos, ...this.partners]) if (video) releaseVideo(video);
  }

  /** Video export: GPU steps on the picture after draw (see KaleidoRenderer). */
  captureFrame() { return this.renderer.captureFrame(); }
  releaseFrame(texture: WebGLTexture) { this.renderer.releaseFrame(texture); }
  setOverlay(source: HTMLCanvasElement | null) { this.renderer.setOverlay(source); }
  drawFrameOver(texture: WebGLTexture, alpha: number) { this.renderer.drawFrameOver(texture, alpha); }
  drawOverlay(alpha: number) { this.renderer.drawOverlay(alpha); }
  startRead() { return this.renderer.startRead(); }

  /** Calls the listener after each frame. Returns a function that removes it. */
  onFrame(listener: () => void) {
    this.frameListeners.add(listener);
    return () => { this.frameListeners.delete(listener); };
  }

  private readonly paramListeners = new Set<(key: ParamKey) => void>();

  /**
   * Calls the listener when something outside the sliders (a MIDI knob)
   * changes a parameter, so its row can show the new value. Returns a
   * function that removes it.
   */
  onParamChange(listener: (key: ParamKey) => void) {
    this.paramListeners.add(listener);
    return () => { this.paramListeners.delete(listener); };
  }

  /** Tells the rows that "key" changed (see onParamChange). */
  paramChanged(key: ParamKey) {
    for (const listener of this.paramListeners) listener(key);
  }

  /** A PNG of the next frame. It is read right after drawing, while the canvas still holds it. */
  snapshot(): Promise<Blob | null> {
    return new Promise((resolve) => this.snapshotWaiters.push(resolve));
  }

  /**
   * Moves the clocks on by "elapsed" real seconds (nothing moves while
   * paused). Returns the animation time that passed.
   */
  step(elapsed: number) {
    this.easeCameraFloor(elapsed);
    const still = this.state.paused || this.gated;
    if (!still) this.state.clock += elapsed;
    /* With a song script, "elapsed" is song time (see frame), and animation time runs at the music's speed. */
    const pace = this.script ? speedAt(this.script.script, this.songTime) : 1;
    const music = Number.isFinite(pace) ? pace : 1;
    const animated = still ? 0 : elapsed * this.speed * music;
    this.state.time += animated;
    /** Flow is a speed, so its live value is added up over time; a drifting flow speeds up and slows down smoothly. */
    this.state.warpTime += animated * (this.live("warpFlow") + this.warpFlowOffset);
    this.state.mandelFlowTime += animated * this.live("mandelFlow");
    this.state.driverTime += animated * this.live("driverSpeed");
    /* Light shapes: one draw cycle takes Draw time seconds; the colors flow by Color flow turns a second. */
    this.state.outlineTime = (this.state.outlineTime + animated / Math.max(0.05, this.live("outlineDrawTime"))) % 1;
    this.state.outlineFlowTime = (this.state.outlineFlowTime + animated * this.live("outlineFlow") + 1) % 1;
    /* The 3D Object's spin and tumble are speeds in turns per minute, added up the same way. */
    this.state.solidSpinTurns = (this.state.solidSpinTurns + animated * this.live("solidSpin") / 60) % 1;
    this.state.solidTumbleTurns = (this.state.solidTumbleTurns + animated * this.live("solidTumble") / 60) % 1;
    this.state.outlineSpinTurns = (this.state.outlineSpinTurns + animated * this.live("outlineSpin") / 60) % 1;
    this.state.outlineTumbleTurns = (this.state.outlineTumbleTurns + animated * this.live("outlineTumble") / 60) % 1;
    /* Tunnel speed is a speed too, so the distance flown is added up the same way. */
    const mapSpeed = this.live("mapSpeed");
    if (this.state.mapMode === 9) {
      /**
       * The Mandelbrot dive keeps its progress, 0 to 1 from Start depth to
       * End depth, so a change to either depth only stretches the dive (a
       * distance flown divided by the dive's length would jump).
       */
      const dive = this.live("mandelEnd") - this.live("mandelDepth");
      const progress = this.state.mapTravel + animated * this.live("mandelSpeed") / Math.max(0.1, dive);
      this.state.mapTravel = progress - Math.floor(progress);
    } else {
      this.state.mapTravel += animated * (this.state.mapMode === 8 ? mapSpeed / drosteCopy(this.live("drosteSize")) : mapSpeed);
    }
    /* The camera's Dolly (forward, the way it pans) and Truck (to its right) are speeds too: its place on the land moves by them. */
    const heading = this.live("cameraPan") * DEGREES;
    const dolly = animated * this.live("cameraDolly");
    const truck = animated * this.live("cameraTruck");
    this.state.cameraX += Math.cos(heading) * dolly + Math.sin(heading) * truck;
    this.state.cameraY += Math.sin(heading) * dolly - Math.cos(heading) * truck;
    return animated;
  }

  /**
   * With a song script, the clocks move by the song's time, not the
   * frame's: a paused song holds the picture, and a jump in the song (a
   * seek, a new track, a new scene) puts the picture at the new place (see
   * followTo). A paused scene holds the picture too. Returns the song time
   * to move the clocks by now.
   */
  private songStep() {
    /* A paused scene holds its whole picture while the music plays on; on Play it catches up with the song (see followTo). */
    if (this.state.paused) {
      this.followed = false;
      return 0;
    }
    const time = this.script!.time();
    const step = time - this.songTime;
    if (!this.followed || step > SONG_JUMP || step < -SONG_BACK) {
      this.followTo(time);
      return 0;
    }
    this.songTime = Math.max(this.songTime, time);
    return Math.max(0, step);
  }

  /** For video export: moves each video copy to its exact place, waits for it, and uploads its frame. */
  async seekVideos() {
    for (const slot of [0, 1] as const) await Promise.all(this.placeVideo(slot, (video, target) => seekVideo(video, target)));
    const driverTarget = this.driverVideoTarget();
    if (this.driverVideo && driverTarget !== null) await seekVideo(this.driverVideo, driverTarget);
    const pictureTarget = this.pictureVideoTarget();
    if (this.pictureSource instanceof HTMLVideoElement && pictureTarget !== null) await seekVideo(this.pictureSource, pictureTarget);
    this.renderer.updateVideos(true);
  }

  private readonly frame = (now: number) => {
    const interval = now - this.lastTime;
    if (interval > 0) this.stats.frameMs += (Math.min(interval, 1000) - this.stats.frameMs) * 0.1;
    const elapsed = Math.min(interval / 1000, 0.1);
    this.lastTime = now;
    const animated = this.step(this.script ? this.songStep() : elapsed);
    this.glide(elapsed);
    this.liveSound.step(this.audio, elapsed);

    const paused = this.state.paused;
    for (const slot of [0, 1] as const) {
      this.placeVideo(slot, (video, target, waiting) => waiting ? cueVideo(video, target) : syncVideo(video, target, paused));
    }
    this.syncDriverVideo(paused);
    this.syncPictureVideo(paused);
    if (this.renderer.updateVideos()) this.wake();

    const renderStart = performance.now();
    const values = this.frameValues(animated, elapsed);
    this.stats.drawing = this.needsDraw(values, now);
    if (this.stats.drawing) {
      this.renderer.render(values);
      this.drawFade();
    }
    this.stats.cpuMs += (performance.now() - renderStart - this.stats.cpuMs) * 0.1;

    if (this.snapshotWaiters.length) {
      const waiters = this.snapshotWaiters;
      this.snapshotWaiters = [];
      this.canvas.toBlob((blob) => waiters.forEach((resolve) => resolve(blob)), "image/png");
    }
    for (const listener of this.frameListeners) listener();
    this.frameId = requestAnimationFrame(this.frame);
  };

  /** Draws the picture for the current time. "animated" and "elapsed" are the times since the last frame (see step). */
  draw(animated: number, elapsed: number) {
    this.renderer.render(this.frameValues(animated, elapsed));
  }

  /** The camera's floor, eased over time (NaN until the renderer has read one back). */
  private cameraFloor = NaN;

  /**
   * Eases the camera's floor toward the land's floor under it, read back
   * from the renderer (see cameraFloorSample): up in about 0.25 seconds, so
   * the camera clears a rise in time, and down in about 0.8 seconds, so it
   * glides over a dip. A jump of more than half a screen height (a new
   * scene, a new place) is taken at once.
   */
  private easeCameraFloor(elapsed: number) {
    const sample = this.renderer.cameraFloorSample;
    if (sample === null) return;
    if (!Number.isFinite(this.cameraFloor) || Math.abs(sample - this.cameraFloor) > 0.5) {
      this.cameraFloor = sample;
      return;
    }
    const seconds = sample > this.cameraFloor ? 0.25 : 0.8;
    this.cameraFloor += (sample - this.cameraFloor) * (1 - Math.exp(-Math.max(0, elapsed) / seconds));
    if (Math.abs(sample - this.cameraFloor) > 1e-4) this.wake();
  }

  /**
   * Each laser beam's Sweep, as its sine (see LASER_SHADER). The first beam
   * has the Sweep of now; each next beam has the Sweep from Sweep delay
   * seconds before the one before it. The Sweep of now goes into the
   * history first, so the beams follow any motion: a range, MIDI or sound.
   * A jump back on the play clock (a new start) or a gap of more than a
   * second starts the history again; a time older than the history has its
   * oldest value.
   */
  private laserSweeps(): Float32Array {
    const now = this.live("laserSweep") * DEGREES;
    const delay = Math.max(0, this.live("laserSweepDelay"));
    const clock = this.state.clock;
    const history = this.sweepHistory;
    const newest = history.at(-1);
    if (newest && (clock < newest.clock || clock - newest.clock > 1)) history.length = 0;
    if (history.length > 0 && history.at(-1)!.clock === clock) history.at(-1)!.value = now;
    else history.push({ clock, value: now });
    const keep = delay * (LASER_BEAMS - 1) + 0.1;
    let old = 0;
    while (old < history.length - 2 && history[old + 1].clock < clock - keep) old++;
    if (old > 0) history.splice(0, old);
    const sweepAt = (time: number) => {
      if (time <= history[0].clock) return history[0].value;
      for (let index = history.length - 1; index > 0; index--) {
        const before = history[index - 1];
        if (before.clock > time) continue;
        const after = history[index];
        const span = after.clock - before.clock;
        return before.value + (after.value - before.value) * (span > 0 ? (time - before.clock) / span : 1);
      }
      return history[0].value;
    };
    return Float32Array.from({ length: LASER_BEAMS }, (_, beam) => Math.sin(sweepAt(clock - delay * beam)));
  }

  /** Everything the renderer needs for one frame (see draw). */
  private frameValues(animated: number, elapsed: number): FrameValues {
    /** A group that is off gets neutral values, so it has no effect. */
    const on = { ...this.state.groups };
    for (const group of this.bypassedGroups) on[group] = false;
    if (this.soloGroup) {
      for (const group of Object.keys(on) as GroupKey[]) {
        if (group !== this.soloGroup) on[group] = false;
      }
    }
    const kaleidoscope = (key: ParamKey, neutral: number) => on.kaleidoscope ? this.live(key) : neutral;
    /* The Möbius point lies on the X axis: its direction would only turn the picture, as Rotation does. */
    const mapPoint = this.state.mapMode === 2 ? [this.live("mobiusPoint"), 0]
      : this.state.mapMode === 9 ? MANDEL_CENTERS[this.state.mandelPlace]
      : juliaPoint(this.live("juliaShape") * DEGREES, this.live("juliaEdge"));
    /**
     * The Mandelbrot dive: Speed is in powers of ten per second, and the
     * dive's progress (mapTravel, see step) takes the view from Start depth
     * to End depth, then it starts again. At Speed 0 the view stays at Start
     * depth. Over the last part (Crossfade, a share of the dive) the start
     * fades in, already diving: it is as far before Start depth as the view
     * is before the end, so it reaches Start depth just as the dive starts
     * again, and nothing jumps. A negative Speed runs it backward.
     */
    const diveLength = Math.max(0.1, this.live("mandelEnd") - this.live("mandelDepth"));
    const divePart = this.state.mapMode === 9 && this.live("mandelSpeed") !== 0 ? this.state.mapTravel % 1 : 0;
    const diveFade = Math.min(0.99, Math.max(0.01, this.live("mandelFade")));
    const fadeIn = Math.min(1, Math.max(0, (divePart - (1 - diveFade)) / diveFade));
    return {
      fxOrder: this.state.fxOrder,
      freeze: this.freezeParts(),
      shapeActive: { warp: on.warp, map: on.map, kaleidoscope: on.kaleidoscope },
      /* A group that is off does nothing, so full opacity in normal mode costs no extra picture. */
      shapeOpacity: {
        warp: on.warp ? this.live("warpOpacity") : 1,
        map: on.map ? this.live("mapOpacity") : 1,
        kaleidoscope: on.kaleidoscope ? this.live("foldOpacity") : 1
      },
      layerBlend: {
        warp: on.warp ? this.state.layerBlend.warp : 0,
        map: on.map ? this.state.layerBlend.map : 0,
        kaleidoscope: on.kaleidoscope ? this.state.layerBlend.kaleidoscope : 0
      },
      /* Where the warp acts is set by the shape order; here it is only on or off. */
      warpMode: on.warp ? 1 : 0,
      warpAmount: this.live("warpAmount"),
      warpScale: this.live("warpScale"),
      warpCellSize: this.live("warpCellSize"),
      warpCellAngle: this.live("warpCellAngle") * DEGREES,
      warpCellSides: this.live("warpCellSides"),
      warpCellRandom: this.live("warpCellRandom"),
      warpMarble: this.live("warpMarble"),
      warpDetail: this.params.warpDetail.value,
      warpTime: this.state.warpTime,
      mandelFlow: this.state.mandelFlowTime,
      warpType: this.state.warpType,
      warpCenterX: this.live("warpCenterX"),
      warpCenterY: this.live("warpCenterY"),
      warpAngle: this.live("warpAngle") * DEGREES,
      mapMode: on.map ? this.state.mapMode : 0,
      mapMix: this.live("mapMix"),
      mandelDepth: this.live("mandelDepth") + divePart * diveLength,
      mandelFade: fadeIn * fadeIn * (3 - 2 * fadeIn),
      mandelFadeDepth: this.live("mandelDepth") + (divePart - 1) * diveLength,
      mandelNextDepth: this.state.mapMode === 9 && this.live("mandelSpeed") !== 0 ? this.live("mandelDepth") - diveFade * diveLength : NaN,
      mandelBands: this.live("mandelBands"),
      mandelSpread: this.live("mandelSpread"),
      mandelInvert: this.live("mandelInvert"),
      mandelEdge: this.live("mandelEdge"),
      mandelEdgeWidth: this.live("mandelEdgeWidth"),
      mandelTerraces: this.live("mandelTerraces"),
      mandelSoftness: this.live("mandelSoftness"),
      mandelLight: this.live("mandelLight"),
      mandelLightAngle: this.live("mandelLightAngle") * DEGREES,
      /* Möbius and Julia have their own zoom settings, which take the place of the map zoom. */
      /* Möbius has its own zoom; the Droste spiral has none. */
      mapScale: this.state.mapMode === 2 || this.state.mapMode === 8 || this.state.mapMode === 9 ? 1 : this.state.mapMode === 3 ? this.live("juliaZoom") : this.live("mapScale"),
      mapPower: this.live("mapPower"),
      mapPointX: mapPoint[0],
      mapPointY: mapPoint[1],
      mapSteps: this.params.mapSteps.value,
      mapArms: this.live("mapArms"),
      spiralCopies: this.spiralCopies,
      drosteSize: this.live("drosteSize"),
      drosteSpirals: this.live("drosteSpirals"),
      drosteSoftness: this.live("drosteSoftness"),
      drosteRound: this.live("drosteRound"),
      drosteRotation: this.live("drosteRotation") * DEGREES,
      drostePictureTurn: this.live("drostePictureTurn") * DEGREES,
      mapTwist: this.live("mapTwist") * DEGREES,
      mapAngle: this.live("mapAngle") * DEGREES,
      /* Möbius has its own pan, roll and twist. */
      mapPanX: this.state.mapMode === 2 ? 0 : this.live("mapPanX"),
      mapPanY: this.state.mapMode === 2 ? 0 : this.live("mapPanY"),
      mapRoll: this.live("mapRoll") * DEGREES,
      mapCurl: this.live("mapCurl"),
      mapTravel: this.state.mapMode === 8 ? drosteTravel(this.state.mapTravel, this.live("drosteSize")) : this.state.mapTravel,
      tunnelTwist: this.live("tunnelTwist") * DEGREES,
      /* Möbius and Julia have their own depth fade settings; the Droste spiral has none, so its center never darkens. */
      mapFog: this.state.mapMode === 8 || this.state.mapMode === 9 ? 0 : this.live(this.state.mapMode === 2 ? "mobiusFog" : this.state.mapMode === 3 ? "juliaFog" : "mapFog"),
      mapFogSoftness: this.live(this.state.mapMode === 2 ? "mobiusFogSoftness" : this.state.mapMode === 3 ? "juliaFogSoftness" : "mapFogSoftness"),
      mobiusTurn: this.live("mobiusTurn") * DEGREES,
      mobiusRotation: this.live("mobiusRotation") * DEGREES,
      mobiusTwist: this.live("mobiusTwist"),
      mobiusZoom: this.live("mobiusZoom"),
      mobiusPanX: this.live("mobiusPanX"),
      mobiusPanY: this.live("mobiusPanY"),
      segments: on.kaleidoscope ? this.live("segments") : 0,
      foldMode: on.kaleidoscope ? this.state.foldMode : 0,
      tileSize: this.live("tileSize"),
      centerX: kaleidoscope("centerX", 0),
      centerY: kaleidoscope("centerY", 0),
      rotation: kaleidoscope("rotation", 0) * DEGREES,
      zoom: kaleidoscope("zoom", 1),
      twirl: kaleidoscope("twirl", 0),
      panX: kaleidoscope("panX", 0),
      panY: kaleidoscope("panY", 0),
      blur: on.blur ? this.live("blurAmount") / 1080 : 0,
      blurMask: this.state.blurMask,
      blurMaskSize: this.live("blurMaskSize"),
      blurMaskSoft: this.live("blurMaskSoft"),
      blurMaskX: this.live("blurMaskX"),
      blurMaskY: this.live("blurMaskY"),
      blurMaskAngle: this.live("blurMaskAngle") * DEGREES,
      blurMaskLevel: this.live("blurMaskLevel"),
      trailMode: on.trails ? this.state.trailMode : 0,
      trailAmount: this.live("trailAmount"),
      trailZoom: this.live("trailZoom"),
      trailTurn: this.live("trailTurn") * DEGREES,
      trailHue: this.live("trailHue") * DEGREES,
      trailFlow: this.live("trailFlow"),
      trailSwirl: this.live("trailSwirl"),
      trailTint: this.live("trailTint"),
      trailColor: hexToRgb(this.state.trailColor),
      frameScale: animated * 60,
      fadeScale: (animated > 0 ? animated : elapsed) * 60,
      sharpen: on.sharpen ? this.live("sharpen") : 0,
      sharpenRadius: this.live("sharpenRadius"),
      exposure: on.levels ? this.live("exposure") : 0,
      blackLevel: on.levels ? this.live("blackLevel") : 0,
      overlayColor: hexToRgb(this.state.overlayColor),
      colorBlend: this.state.colorBlend,
      overlayOpacity: on.color ? this.live("overlayOpacity") : 0,
      driver: on.driver ? this.live("driverAmount") : 0,
      driverSource: this.state.driverSource,
      driverMode: this.state.driverMode,
      driverStrength: this.live("driverStrength"),
      driverScale: this.live("driverScale"),
      driverContrast: this.live("driverContrast"),
      driverTime: this.state.driverTime,
      relief: on.relief ? this.live("reliefAmount") : 0,
      reliefDepth: this.live("reliefDepth"),
      reliefSize: this.live("reliefSize"),
      lightAngle: this.live("lightAngle") * DEGREES,
      shine: this.live("shine"),
      terrainOn: on.terrain,
      terrain: this.live("cameraAmount"),
      terrainBlend: this.state.cameraBlend,
      view: on.camera ? this.live("viewAmount") : 0,
      viewBlend: this.state.viewBlend,
      cameraRepeat: this.state.cameraRepeat,
      cameraHeightSource: this.state.cameraHeightSource,
      cameraTerrainScale: this.live("cameraTerrainScale"),
      cameraRoughness: this.live("cameraRoughness"),
      cameraRidges: this.live("cameraRidges"),
      cameraSeed: this.live("cameraSeed"),
      cameraDetail: this.live("cameraDetail"),
      cameraDetailSize: this.live("cameraDetailSize"),
      cameraColors: this.state.cameraColors,
      cameraStopAt: new Float32Array(this.state.cameraStops.map((stop) => stop.at)),
      cameraStopColor: new Float32Array(this.state.cameraStops.flatMap((stop) => hexToRgb(stop.color))),
      cameraHeight: this.live("cameraHeight"),
      cameraTilt: this.live("cameraTilt") * DEGREES,
      cameraPan: this.live("cameraPan") * DEGREES,
      cameraX: this.state.cameraX,
      cameraY: this.state.cameraY,
      cameraPedestal: this.live("cameraPedestal"),
      cameraFloor: this.cameraFloor,
      cameraLens: lensAngle(this.live("cameraLens")),
      cameraLightTurn: this.live("cameraLightTurn") * DEGREES,
      cameraLightHeight: this.live("cameraLightHeight") * DEGREES,
      cameraShadow: this.live("cameraShadow"),
      cameraFog: this.live("cameraFog"),
      cameraSky: this.live("cameraSky"),
      skyColor: hexToRgb(this.state.skyColor),
      cameraShine: this.live("cameraShine"),
      cameraSmooth: this.live("cameraSmooth"),
      solid: on.solid ? this.live("solidAmount") : 0,
      solidShape: this.state.solidShape,
      solidMap: this.state.solidMap,
      solidBlend: this.state.solidBlend,
      solidBackground: this.live("solidBackground"),
      solidSize: this.live("solidSize"),
      solidRound: this.live("solidRound"),
      solidMorph: this.live("solidMorph"),
      solidBlobs: this.live("solidBlobs"),
      solidBumps: this.live("solidBumps"),
      solidWaves: this.live("solidWaves"),
      solidSpikes: this.live("solidSpikes"),
      solidSpikeTip: this.live("solidSpikeTip"),
      solidSpikeCount: this.live("solidSpikeCount"),
      solidLevels: this.live("solidLevels"),
      solidTime: this.state.time,
      solidSpin: this.state.solidSpinTurns * Math.PI * 2,
      solidTumble: this.state.solidTumbleTurns * Math.PI * 2,
      solidTilt: this.live("solidTilt") * DEGREES,
      solidBend: this.live("solidBend"),
      solidTiles: this.live("solidTiles"),
      solidLight: this.live("solidLight") * DEGREES,
      solidShading: this.live("solidShading"),
      solidShine: this.live("solidShine"),
      solidShadow: this.live("solidShadow"),
      solidX: this.live("solidX"),
      solidY: this.live("solidY"),
      sort: on.sort ? this.live("sortAmount") : 0,
      sortOrder: this.state.sortOrder,
      sortLow: this.live("sortLow"),
      sortHigh: this.live("sortHigh"),
      sortAngle: this.live("sortAngle") * DEGREES,
      sortLength: this.live("sortLength"),
      sortThickness: this.live("sortThickness"),
      particles: on.particles ? this.live("particleAmount") : 0,
      particleBlend: this.state.particleBlend,
      particleShape: this.state.particleShape,
      particleRingRadius: this.live("particleRingRadius"),
      particleBackground: this.live("particleBackground"),
      particleCount: this.live("particleCount"),
      particleLevel: this.live("particleLevel"),
      particleSize: this.live("particleSize"),
      particleLife: this.live("particleLife"),
      particleSpeed: this.live("particleSpeed"),
      particleGravity: this.live("particleGravity"),
      particleAngle: this.live("particleAngle") * DEGREES,
      particleTurbulence: this.live("particleTurbulence"),
      particleDrag: this.live("particleDrag"),
      particleFollow: this.live("particleFollow"),
      particleCling: this.live("particleCling"),
      particleGradient: this.live("particleGradient"),
      particleBoost: this.live("particleBoost"),
      particleStopAt: new Float32Array(this.state.particleStops.map((stop) => stop.at)),
      particleStopColor: new Float32Array(this.state.particleStops.flatMap((stop) => hexToRgb(stop.color))),
      particleSeconds: animated,
      particleTime: this.state.time,
      cycles: on.cycles ? this.live("cyclesAmount") : 0,
      cyclesMove: this.state.cyclesMove,
      cyclesBlend: this.state.cyclesBlend,
      cyclesBackground: this.live("cyclesBackground"),
      cyclesCount: this.live("cyclesCount"),
      cyclesSpeed: this.live("cyclesSpeed"),
      cyclesWidth: this.live("cyclesWidth"),
      /* At the top of its slider, a line stays until its cycle crashes. */
      cyclesLength: this.live("cyclesLength") >= this.params.cyclesLength.max ? Infinity : this.live("cyclesLength"),
      cyclesTurns: this.live("cyclesTurns"),
      cyclesFollow: this.live("cyclesFollow"),
      cyclesDodge: this.live("cyclesDodge"),
      cyclesGrid: this.live("cyclesGrid"),
      cyclesHead: this.live("cyclesHead"),
      cyclesSeconds: animated,
      cyclesPaint: this.state.cyclesPaint,
      cyclesGradient: this.live("cyclesGradient"),
      cyclesShift: this.live("cyclesShift"),
      cyclesRepeat: this.live("cyclesRepeat"),
      cyclesAngle: this.live("cyclesAngle") * DEGREES,
      cyclesCenterX: this.live("cyclesCenterX"),
      cyclesCenterY: this.live("cyclesCenterY"),
      cyclesStopAt: new Float32Array(this.state.cyclesStops.map((stop) => stop.at)),
      cyclesStopColor: new Float32Array(this.state.cyclesStops.flatMap((stop) => hexToRgb(stop.color))),
      rays: on.rays ? this.live("raysAmount") : 0,
      raysThreshold: this.live("raysThreshold"),
      raysLength: this.live("raysLength"),
      raysFade: this.live("raysFade"),
      raysX: this.live("raysX"),
      raysY: this.live("raysY"),
      lasers: on.lasers ? this.live("laserAmount") : 0,
      laserCount: this.live("laserCount"),
      laserSpread: this.live("laserSpread") * DEGREES,
      laserSweeps: this.laserSweeps(),
      laserBase: this.live("laserBase"),
      laserBaseAngle: this.live("laserBaseAngle") * DEGREES,
      laserWidth: this.live("laserWidth"),
      laserGlow: this.live("laserGlow"),
      laserGlowSize: this.live("laserGlowSize"),
      laserEmitter: this.live("laserEmitter"),
      laserFade: this.live("laserFade"),
      laserHue: this.live("laserHue") / 360,
      laserRainbow: this.live("laserRainbow"),
      laserX: this.live("laserX"),
      laserY: this.live("laserY"),
      outlines: on.outlines ? this.live("outlineAmount") : 0,
      outlineShape: this.state.outlineShape,
      outlineDraw: this.state.outlineDraw,
      outlineCount: this.live("outlineCount"),
      outlineRadius: this.live("outlineRadius"),
      outlineSpacing: this.live("outlineSpacing"),
      outlineDelay: this.live("outlineDelay"),
      outlinePhase: this.state.outlineTime,
      outlineLength: this.live("outlineLength"),
      outlinePoints: this.live("outlinePoints"),
      outlineWidth: this.live("outlineWidth"),
      outlineGlow: this.live("outlineGlow"),
      outlineGlowSize: this.live("outlineGlowSize"),
      outlineFlow: this.state.outlineFlowTime,
      outlineTurn: this.live("outlineTurn") * DEGREES,
      /* Each copy is Delay draws later than the one before, so it turns that much time later (radians per copy). */
      outlineSpin: this.state.outlineSpinTurns * Math.PI * 2,
      outlineTumble: this.state.outlineTumbleTurns * Math.PI * 2,
      outlineSpinLag: (this.live("outlineSpin") / 60) * this.live("outlineDelay") * this.live("outlineDrawTime") * Math.PI * 2,
      outlineTumbleLag: (this.live("outlineTumble") / 60) * this.live("outlineDelay") * this.live("outlineDrawTime") * Math.PI * 2,
      outlineX: this.live("outlineX"),
      outlineY: this.live("outlineY"),
      outlineStopAt: new Float32Array(this.state.outlineStops.map((stop) => stop.at)),
      outlineStopColor: new Float32Array(this.state.outlineStops.flatMap((stop) => hexToRgb(stop.color))),
      picture: on.picture ? this.live("pictureAmount") : 0,
      pictureBlend: this.state.pictureBlend,
      pictureSize: this.live("pictureSize"),
      pictureX: this.live("pictureX"),
      pictureY: this.live("pictureY"),
      pictureTurn: this.live("pictureTurn") * DEGREES,
      pictureKey: this.live("pictureKey"),
      bloom: on.bloom ? this.live("bloomAmount") : 0,
      bloomThreshold: this.live("bloomThreshold"),
      bloomSoftness: this.live("bloomSoftness"),
      bloomSize: this.live("bloomSize"),
      smear: on.smear ? this.live("smearAmount") : 0,
      smearDelay: this.live("smearDelay"),
      smearShape: this.state.smearShape,
      smearAngle: this.live("smearAngle") * DEGREES,
      smearBands: this.live("smearBands"),
      smearRestart: this.params.smearRestart.value,
      smearFade: this.params.smearFade.value,
      playSeconds: animated / this.speed,
      playClock: this.state.clock,
      contours: on.contours ? this.live("contourOpacity") : 0,
      contourLines: this.live("contourLines"),
      contourWidth: this.live("contourWidth"),
      /* Resolution is the blur turned around: the most resolution is no blur. */
      contourSmooth: this.params.contourResolution.max - this.live("contourResolution"),
      contourSteady: this.live("contourSteady"),
      contourColor: this.state.contourTone === "black" ? [0, 0, 0] : this.state.contourTone === "white" ? [1, 1, 1] : fullHue(this.live("contourHue")),
      contourBlend: this.state.contourBlend,
      imageBlend: this.hasSecondImage ? this.live("imageBlend") : 0,
      blendMode: this.state.blendMode,
      tileRepeat: this.state.tiling === 2 || (this.state.tiling === 0 && !!this.sources[0] && repeatingImages.has(this.sources[0]))
    };
  }
}
