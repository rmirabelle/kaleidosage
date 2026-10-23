import type { ParamKey } from "./params";
import { planSong, type MapSlice, type SongPlan, type Tier } from "./songPlan";

/**
 * The song script (see reports/Intelligent music driven animation.md,
 * phase 1): it turns the offline analysis of a track
 * (src-tauri/src/song_analysis.rs) into values that the engine reads at
 * the song's time, so the picture follows the music and does not loop.
 * The scene's ranges keep their meaning: their handles say how far each
 * setting may move, and the music says where it is between them.
 *
 * The settings whose audio switch is on follow the music by family (see
 * FAMILIES and familyOf): glow and scale follow the intensity and pulse on
 * the beats, complexity follows the intensity slowly, sparkle follows the
 * high sounds, and every other setting (beat) moves one step through its
 * range on each beat. The other ranges play as before, but their animation
 * time runs at the music's speed (see speedAt): fast in loud parts, slow in
 * soft parts.
 *
 * The song plan (songPlan.ts) adds the song's shape: each part's level
 * sets how far the settings may move and how hard the beats pulse; before
 * a drop the picture rises (it grows, gains detail and speeds up), goes
 * dark and still for the quiet beat just before it, and on the drop gets
 * a hit (a flash, a punch of size and speed) that fades over a bar.
 */

export interface Hit {
  time: number;
  strength: number;
}

/** The analysis of a track, as song_analysis.rs returns it. All times are in song seconds. */
export interface SongAnalysis {
  version: number;
  duration: number;
  tempo: number;
  beats: number[];
  downbeats: number[];
  /** Curve values per second; value i is at time i / curveRate. */
  curveRate: number;
  curves: {
    /** Momentary loudness, LUFS. */
    loudness: number[];
    /** Short-term loudness, LUFS. */
    loudnessShort: number[];
    /** 0–1 over the whole song: a crescendo rises here. */
    intensity: number[];
    /** 0–1 over the 16 seconds around each point. */
    intensityLocal: number[];
    bass: number[];
    mids: number[];
    highs: number[];
    brightness: number[];
    onsets: number[];
  };
  hits: { kick: Hit[]; snare: Hit[]; hats: Hit[] };
  /** The song's parts, in time order (see song_sections.rs). */
  sections: { start: number; end: number; label: string }[];
  /** The song map as the user edited it (see songMapEdits.ts), or missing for the automatic map. Not from the analyzer: the app adds it. */
  mapEdits?: MapSlice[];
}

export type Family = "glow" | "scale" | "complexity" | "sparkle" | "beat";

/** What each family follows, for the user. */
export const FAMILY_NAMES: Record<Family, string> = {
  glow: "brightness: the music's intensity, with a pulse on each beat",
  scale: "size: the music's intensity, with a pulse on each beat",
  complexity: "detail: the music's intensity, slowly",
  sparkle: "sparkle: the music's high sounds",
  beat: "the beats: one step through its range on each beat"
};

/** Each family in a word, for the Audio panel's list. */
export const FAMILY_LABELS: Record<Family, string> = { glow: "Brightness", scale: "Size", complexity: "Detail", sparkle: "Sparkle", beat: "Beats" };

/** The settings that have a match in the sound; every other setting moves on the beats (see familyOf). */
export const FAMILIES: Partial<Record<ParamKey, Exclude<Family, "beat">>> = {
  exposure: "glow", bloomAmount: "glow", bloomSize: "glow", overlayOpacity: "glow", contourOpacity: "glow", shine: "glow",
  zoom: "scale", mapScale: "scale", juliaZoom: "scale", mobiusZoom: "scale", trailZoom: "scale", particleSize: "scale", cyclesWidth: "scale",
  segments: "complexity", drosteSpirals: "complexity", mapArms: "complexity", twirl: "complexity", warpAmount: "complexity",
  warpMarble: "complexity", blurAmount: "complexity", contourLines: "complexity", mapTwist: "complexity", tunnelTwist: "complexity",
  mapCurl: "complexity", mapPower: "complexity", smearAmount: "complexity",
  particleBoost: "sparkle", particleSpeed: "sparkle", particleTurbulence: "sparkle", cyclesSpeed: "sparkle", raysAmount: "sparkle", raysLength: "sparkle", sharpen: "sparkle"
};

/** The family that moves a setting with the sound: its own (see FAMILIES), or "beat" for one with no match in the sound. */
export const familyOf = (key: ParamKey): Family => FAMILIES[key] ?? "beat";

/** A beat-moved setting goes from one handle to the other in this many beats at the peak level; softer parts take smaller steps. */
export const BEAT_TRIP = 16;

/**
 * A beat-moved setting's place between its handles, from 0 to 1, at
 * "travel" trips: a smooth wave that goes from the start handle (0 trips)
 * to the end handle (1) and back (2).
 */
export const wavePosition = (travel: number) => 0.5 - 0.5 * Math.cos(Math.PI * travel);

/** How far a beat pulse moves a setting, as a part of its range, at full intensity. */
export const PULSE_DEPTH: Record<Family, number> = { glow: 0.35, scale: 0.15, complexity: 0, sparkle: 0, beat: 0 };
/** A pulse rises over this time, then falls away exponentially. */
const PULSE_ATTACK = 0.01;
const PULSE_RELEASE = 0.18;
/** A kick this close to a beat sets that beat's pulse: its time and its strength. */
const KICK_WINDOW = 0.04;
/** A beat with no kick near it still pulses, a little. */
const BEAT_STRENGTH = 0.4;
/** Bar starts pulse this much stronger. */
const DOWNBEAT_BOOST = 1.25;
/** The high sounds' curve follows rises in this time and falls in this time (see envelope). */
const HIGHS_ATTACK = 0.02;
const HIGHS_RELEASE = 0.25;
/** The music's speed: at intensity 0 and at intensity 1. Near 1 on average, so a scene's Length keeps about its pace. */
const SPEED_SOFT = 0.3;
const SPEED_LOUD = 1.7;

/** By a part's level (see Tier): how far the settings may move, how hard the beats pulse, and the pace. */
const TIER_DEPTH: Record<Tier, number> = { 0: 0.4, 1: 0.65, 2: 0.85, 3: 1 };
const TIER_PULSE: Record<Tier, number> = { 0: 0, 1: 0.5, 2: 0.8, 3: 1 };
const TIER_PACE: Record<Tier, number> = { 0: 0.6, 1: 0.85, 2: 1, 3: 1.15 };
/** By a part's level: the part of a full step (1 / BEAT_TRIP) that a beat-moved setting takes on each beat. A drop's beat takes two. */
const TIER_STEP: Record<Tier, number> = { 0: 0.3, 1: 0.6, 2: 0.85, 3: 1 };
/** A change of level that is not a drop moves over this many beats. */
const LEVEL_BEATS = 2;
/** A drop's hit fades over about this many bars. */
const HIT_BARS = 1;

/**
 * What the rise before a drop (riser), the quiet pause (pause) and the hit
 * on it (hit) add to each family's place in its range, at full strength.
 */
const SHAPE: Record<Family, { riser: number; pause: number; hit: number }> = {
  glow: { riser: -0.15, pause: -0.6, hit: 0.5 },
  scale: { riser: 0.3, pause: -0.2, hit: 0.3 },
  complexity: { riser: 0.35, pause: 0, hit: 0.2 },
  sparkle: { riser: 0.4, pause: -0.3, hit: 0.3 },
  beat: { riser: 0, pause: 0, hit: 0 }
};

export interface SongScript {
  duration: number;
  tempo: number;
  rate: number;
  intensity: Float32Array;
  intensityLocal: Float32Array;
  highs: Float32Array;
  /** Beat pulses: time and strength (0 to 1), in time order. */
  pulses: Hit[];
  release: number;
  plan: SongPlan;
  /** Curves at "rate", from the plan: how far the settings may move, the pulse strength and the pace (by level), and the riser, pause and hit (0 to 1). */
  depth: Float32Array;
  pulseScale: Float32Array;
  pace: Float32Array;
  riser: Float32Array;
  pause: Float32Array;
  hit: Float32Array;
  /** At "rate": the song's pace (see speedAt) added up from the start, so a jump to any time knows how far animation time has run (see travelAt). */
  travel: Float32Array;
  /** For the beat-moved settings, at each beat (the pulses' times): the trips made before it, and its own step (see beatTravelAt). */
  beatTravel: Float32Array;
  beatStep: Float32Array;
}

/**
 * The plan's curves: each part's level values, which glide over LEVEL_BEATS
 * into the next part (a drop cuts at once); the riser, which grows faster
 * and faster from the build's start to the drop; the pause, which is 1
 * while the music is quiet just before a drop; and the hit, which jumps to
 * the drop's strength on it and fades over about HIT_BARS bars.
 */
function planCurves(plan: SongPlan, length: number, rate: number, tempo: number) {
  const curves = {
    depth: new Float32Array(length), pulseScale: new Float32Array(length), pace: new Float32Array(length),
    riser: new Float32Array(length), pause: new Float32Array(length), hit: new Float32Array(length)
  };
  const beat = tempo > 0 ? 60 / tempo : 0.5;
  const drops = new Set(plan.drops.map((drop) => drop.time));
  let part = 0;
  for (let i = 0; i < length; i++) {
    const time = i / rate;
    while (part + 1 < plan.parts.length && plan.parts[part + 1].start <= time) part++;
    const tier = plan.parts[part]?.tier ?? 1;
    let depth = TIER_DEPTH[tier];
    let pulse = TIER_PULSE[tier];
    let pace = TIER_PACE[tier];
    /* In the last LEVEL_BEATS beats of a part, the values glide to the next part's, unless a drop comes. */
    const next = plan.parts[part + 1];
    if (next && next.start - time < LEVEL_BEATS * beat && !drops.has(next.start)) {
      const t = 1 - (next.start - time) / (LEVEL_BEATS * beat);
      const smooth = t * t * (3 - 2 * t);
      depth += (TIER_DEPTH[next.tier] - depth) * smooth;
      pulse += (TIER_PULSE[next.tier] - pulse) * smooth;
      pace += (TIER_PACE[next.tier] - pace) * smooth;
    }
    curves.depth[i] = depth;
    curves.pulseScale[i] = pulse;
    curves.pace[i] = pace;
    for (const drop of plan.drops) {
      if (time >= drop.buildStart && time < drop.time) {
        const t = (time - drop.buildStart) / Math.max(1e-3, drop.time - drop.buildStart);
        curves.riser[i] = Math.max(curves.riser[i], drop.strength * t ** 2.5);
      }
      if (drop.pauseStart !== null && time >= drop.pauseStart && time < drop.time) curves.pause[i] = 1;
      if (time >= drop.time) {
        curves.hit[i] = Math.max(curves.hit[i], drop.strength * Math.exp(-(time - drop.time) / (HIT_BARS * 4 * beat / 3)));
      }
    }
  }
  return curves;
}

/**
 * A curve that follows rises in "attack" seconds and falls in "release"
 * seconds, like a level meter. The song is known in full, so it needs no
 * live state.
 */
function envelope(values: readonly number[], rate: number, attack: number, release: number) {
  const up = 1 - Math.exp(-1 / (rate * attack));
  const down = 1 - Math.exp(-1 / (rate * release));
  const out = new Float32Array(values.length);
  let level = 0;
  values.forEach((value, i) => {
    level += (value - level) * (value > level ? up : down);
    out[i] = level;
  });
  return out;
}

/** Turns an analysis into a script. */
export function compileScript(analysis: SongAnalysis): SongScript {
  const { beats, downbeats, hits, curveRate: rate, curves } = analysis;
  const bar = new Set(downbeats);
  let next = 0;
  const pulses = beats.map((beat) => {
    /* The kicks are in time order, so the search goes on from the last beat's place. */
    while (next < hits.kick.length && hits.kick[next].time < beat - KICK_WINDOW) next++;
    let kick: Hit | null = null;
    for (let i = next; i < hits.kick.length && hits.kick[i].time <= beat + KICK_WINDOW; i++) {
      if (!kick || hits.kick[i].strength > kick.strength) kick = hits.kick[i];
    }
    const strength = (kick?.strength ?? BEAT_STRENGTH) * (bar.has(beat) ? DOWNBEAT_BOOST : 1);
    return { time: kick?.time ?? beat, strength: Math.min(1, strength) };
  });
  /* A fast song gets shorter pulses, so one pulse has ended before the next beat. */
  const spacing = analysis.tempo > 0 ? 60 / analysis.tempo : 0.5;
  const plan = planSong(analysis);
  const script: SongScript = {
    plan,
    ...planCurves(plan, curves.intensity.length, rate, analysis.tempo),
    travel: new Float32Array(0),
    ...beatSteps(plan, pulses),
    duration: analysis.duration,
    tempo: analysis.tempo,
    rate,
    intensity: Float32Array.from(curves.intensity),
    intensityLocal: Float32Array.from(curves.intensityLocal),
    highs: envelope(curves.highs, rate, HIGHS_ATTACK, HIGHS_RELEASE),
    pulses,
    release: Math.min(PULSE_RELEASE, 0.4 * spacing)
  };
  /* The pace added up point by point (the trapezoid rule), at the curve rate. */
  const travel = new Float32Array(curves.intensity.length);
  for (let i = 1; i < travel.length; i++) {
    travel[i] = travel[i - 1] + (speedAt(script, (i - 1) / rate) + speedAt(script, i / rate)) / (2 * rate);
  }
  script.travel = travel;
  return script;
}

/** Each beat's step for the beat-moved settings (see TIER_STEP), and the trips made before it. */
function beatSteps(plan: SongPlan, pulses: readonly Hit[]) {
  const beatTravel = new Float32Array(pulses.length);
  const beatStep = new Float32Array(pulses.length);
  let part = 0;
  let travel = 0;
  pulses.forEach((pulse, i) => {
    while (part + 1 < plan.parts.length && plan.parts[part + 1].start <= pulse.time + 0.05) part++;
    const drop = plan.drops.some((candidate) => Math.abs(candidate.time - pulse.time) < 0.05);
    beatTravel[i] = travel;
    beatStep[i] = (TIER_STEP[plan.parts[part]?.tier ?? 1] * (drop ? 2 : 1)) / BEAT_TRIP;
    travel += beatStep[i];
  });
  return { beatTravel, beatStep };
}

/**
 * How far the beat-moved settings have gone by "time", in trips (see
 * wavePosition): each beat's step glides in quickly after the beat and
 * slows down before the next one.
 */
export function beatTravelAt(script: SongScript, time: number) {
  const { pulses, beatTravel, beatStep } = script;
  let low = 0;
  let high = pulses.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (pulses[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  const i = low - 1;
  if (i < 0) return 0;
  const length = (pulses[i + 1]?.time ?? pulses[i].time + 0.5) - pulses[i].time;
  const t = Math.min(1, Math.max(0, (time - pulses[i].time) / Math.max(1e-3, length)));
  return beatTravel[i] + beatStep[i] * (1 - (1 - t) ** 3);
}

/** How far animation time has run by "time", at the scene's own speed 1: the song's pace added up from its start. */
export const travelAt = (script: SongScript, time: number) => sample(script.travel, script.rate, time);

/** A curve's value at "time" seconds, between its points. */
function sample(curve: Float32Array, rate: number, time: number) {
  if (curve.length === 0) return 0;
  const position = Math.min(curve.length - 1, Math.max(0, time * rate));
  const index = Math.floor(position);
  const after = curve[Math.min(curve.length - 1, index + 1)];
  return curve[index] + (after - curve[index]) * (position - index);
}

/** The beat pulse at "time", from 0 to 1: the last few pulses, each a short rise and an exponential fall. */
export function pulseAt(script: SongScript, time: number) {
  const { pulses, release } = script;
  /* The last pulse at or before "time" (binary search). */
  let low = 0;
  let high = pulses.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (pulses[middle].time <= time) low = middle + 1;
    else high = middle;
  }
  let level = 0;
  for (let i = low - 1; i >= 0 && i >= low - 3; i--) {
    const since = time - pulses[i].time;
    const shape = since < PULSE_ATTACK ? since / PULSE_ATTACK : Math.exp(-(since - PULSE_ATTACK) / release);
    level = Math.max(level, pulses[i].strength * shape);
  }
  return level;
}

export const intensityAt = (script: SongScript, time: number) => sample(script.intensity, script.rate, time);

/**
 * How fast animation time runs at "time", as a part of the scene's own
 * speed: slow in soft parts, fast in loud parts.
 */
export function speedAt(script: SongScript, time: number) {
  const { rate } = script;
  const base = (SPEED_SOFT + (SPEED_LOUD - SPEED_SOFT) * intensityAt(script, time)) * sample(script.pace, rate, time);
  /* The rise speeds up, the pause stands still, and the hit kicks the speed up and lets it settle. */
  return base * (1 + 0.8 * sample(script.riser, rate, time)) * (1 - sample(script.pause, rate, time)) + 1.5 * sample(script.hit, rate, time);
}

/**
 * Where a range of the given family is at "time": 0 at its start handle,
 * 1 at its end handle. Soft parts sit near the start handle and have no
 * pulses; loud parts move toward the end handle and pulse on the beats.
 */
export function positionAt(script: SongScript, family: Family, time: number, offset = 0) {
  if (family === "beat") return wavePosition(beatTravelAt(script, time) + offset);
  const { rate } = script;
  const intensity = intensityAt(script, time);
  const pulse = PULSE_DEPTH[family] * pulseAt(script, time) * intensity ** 1.5 * sample(script.pulseScale, rate, time);
  let position: number;
  switch (family) {
    /* The pulse has room above the intensity, so a loud beat still shows and does not hit the end handle. */
    case "glow":
    case "scale": position = (1 - PULSE_DEPTH[family]) * intensity + pulse; break;
    case "complexity": position = 0.7 * intensity + 0.3 * sample(script.intensityLocal, script.rate, time); break;
    case "sparkle": position = sample(script.highs, script.rate, time) * (0.4 + 0.6 * intensity); break;
    default: position = 0;
  }
  const shape = SHAPE[family];
  position = position * sample(script.depth, rate, time)
    + shape.riser * sample(script.riser, rate, time)
    + shape.pause * sample(script.pause, rate, time)
    + shape.hit * sample(script.hit, rate, time);
  return Math.min(1, Math.max(0, position));
}
