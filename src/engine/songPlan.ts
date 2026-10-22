import type { SongAnalysis } from "./songScript";

/**
 * The song plan (phase 2 of reports/Intelligent music driven animation.md):
 * the song's parts from the analysis (see song_sections.rs), each with a
 * level from calm to peak, and the drops: the part starts where the music
 * comes in hard after a build. The script (songScript.ts) turns the plan
 * into how far the settings may move, a rise before each drop, a short
 * dark pause just before it when the music goes quiet, and a hit on it.
 * Every time in the plan is on a bar start, from the analysis; nothing here
 * guesses a time. The user can edit a song's map (see songMapEdits.ts):
 * the edited slices then take the place of the automatic parts, levels and
 * drops.
 */

/** 0 calm, 1 steady, 2 rising, 3 peak. */
export type Tier = 0 | 1 | 2 | 3;
export const TIER_NAMES: Record<Tier, string> = { 0: "calm", 1: "steady", 2: "rising", 3: "peak" };

export interface Part {
  start: number;
  end: number;
  /** LinkSeg's label: silence, verse, chorus, intro, outro, inst or bridge. */
  label: string;
  tier: Tier;
  /** The part's mean intensity (0 to 1, see SongAnalysis.curves.intensity). */
  intensity: number;
}

export interface Drop {
  /** The bar start where the music comes in. */
  time: number;
  /** How hard it comes in, 0 to 1; the strongest drop of the song is 1. */
  strength: number;
  /** Where the rise before it starts (a bar start), and where the quiet pause before it starts, or null when the music does not go quiet. */
  buildStart: number;
  pauseStart: number | null;
}

/**
 * One slice of a song map as the user edited it (see songMapEdits.ts and
 * SongAnalysis.mapEdits): where it starts (a bar start; the first starts at
 * 0), its name, its level, and whether a drop starts it.
 */
export interface MapSlice {
  start: number;
  label: string;
  tier: Tier;
  drop: boolean;
}

/** A place where the picture changes its look (see App's scene changes): a drop, or a part with another level. */
export interface Cue {
  time: number;
  drop: boolean;
}

export interface SongPlan {
  parts: Part[];
  drops: Drop[];
  cues: Cue[];
}

/** A part shorter than this many bars joins the part before it. */
const MIN_PART_BARS = 2;
/** The intensity before and after a part start is compared over this many bars. */
const JUMP_BARS = 2;
/** A part start is a drop when its jump score (see dropScore) is at least this. */
const DROP_SCORE = 0.25;
/** The rise before a drop lasts at most this many bars, and at least 2. */
const BUILD_BARS = 8;
/** The music counts as gone quiet before a drop when its last beat is this many dB under the bar before. */
const PAUSE_DB = 6;

/** The mean of a curve from "from" to "to" seconds. */
function mean(curve: readonly number[], rate: number, from: number, to: number) {
  const first = Math.max(0, Math.floor(from * rate));
  const last = Math.min(curve.length, Math.ceil(to * rate));
  if (last <= first) return 0;
  let sum = 0;
  for (let i = first; i < last; i++) sum += curve[i];
  return sum / (last - first);
}

/** The bar start nearest "time", or "time" with no bars. */
function nearest(times: readonly number[], time: number) {
  return times.reduce((best, candidate) => Math.abs(candidate - time) < Math.abs(best - time) ? candidate : best, times[0] ?? time);
}

/** Plans a song from its analysis. */
export function planSong(analysis: SongAnalysis): SongPlan {
  const { curves, curveRate: rate, duration } = analysis;
  const downbeats = analysis.downbeats.length ? analysis.downbeats : analysis.beats;
  const bar = analysis.tempo > 0 ? 240 / analysis.tempo : 2;

  /* An edited map gives the parts, their levels and the drops as the user set them. */
  const edits = analysis.mapEdits?.length ? [...analysis.mapEdits].sort((a, b) => a.start - b.start) : null;
  if (edits) {
    const parts: Part[] = edits.map((slice, index) => ({
      start: index === 0 ? 0 : slice.start,
      end: edits[index + 1]?.start ?? duration,
      label: slice.label,
      tier: slice.tier,
      intensity: 0
    }));
    for (const part of parts) part.intensity = mean(curves.intensity, rate, part.start, part.end);
    const wanted = new Set(edits.slice(1).filter((slice) => slice.drop).map((slice) => slice.start));
    return finishPlan(analysis, parts, (part) => wanted.has(part.start));
  }

  /* Part starts move to the nearest bar start; a part that is too short joins the one before it. */
  const parts: Part[] = [];
  for (const section of analysis.sections ?? []) {
    const start = parts.length === 0 ? 0 : nearest(downbeats, section.start);
    const last = parts[parts.length - 1];
    if (last && start - last.start < MIN_PART_BARS * bar) continue;
    if (last) last.end = start;
    parts.push({ start, end: duration, label: section.label, tier: 1, intensity: 0 });
  }
  if (parts.length === 0) parts.push({ start: 0, end: duration, label: "verse", tier: 1, intensity: 0 });
  for (const part of parts) part.intensity = mean(curves.intensity, rate, part.start, part.end);

  /* Levels follow each part's intensity within this song, then its label: an intro or outro is at most steady, a chorus at least rising. */
  const levels = parts.map((part) => part.intensity);
  const low = Math.min(...levels);
  const high = Math.max(...levels);
  for (const part of parts) {
    const place = high - low > 0.05 ? (part.intensity - low) / (high - low) : 0.5;
    let tier: Tier = place < 0.25 ? 0 : place < 0.55 ? 1 : place < 0.85 ? 2 : 3;
    if (part.label === "silence") tier = 0;
    if ((part.label === "intro" || part.label === "outro") && tier > 1) tier = 1;
    if (part.label === "chorus" && tier < 2) tier = 2;
    part.tier = tier;
  }
  /* A drop: a part start of a rising or peak part where the intensity and the bass jump up (see dropScore). */
  return finishPlan(analysis, parts, (part, score) => part.tier >= 2 && score >= DROP_SCORE);
}

/**
 * The plan's drops and cues, from its parts: "isDrop" picks the part
 * starts that are drops, from the part and its jump score (how hard the
 * intensity and the bass jump up there). The strongest drop has strength
 * 1; each drop gets its rise and, when the music goes quiet just before
 * it, its pause.
 */
function finishPlan(analysis: SongAnalysis, parts: Part[], isDrop: (part: Part, score: number) => boolean): SongPlan {
  const { curves, curveRate: rate } = analysis;
  const downbeats = analysis.downbeats.length ? analysis.downbeats : analysis.beats;
  const bar = analysis.tempo > 0 ? 240 / analysis.tempo : 2;
  const beat = bar / 4;
  const scored = parts.slice(1).map((part, index) => {
    const before = parts[index];
    const after = mean(curves.intensity, rate, part.start, part.start + JUMP_BARS * bar) - mean(curves.intensity, rate, part.start - JUMP_BARS * bar, part.start);
    const bass = mean(curves.bass, rate, part.start, part.start + JUMP_BARS * bar) - mean(curves.bass, rate, part.start - bar, part.start);
    const score = Math.max(0, after) + 0.5 * Math.max(0, bass) + (part.tier > before.tier ? 0.1 * (part.tier - before.tier) : 0);
    return { part, before, score };
  });
  const found = scored.filter(({ part, score }) => isDrop(part, score));
  const strongest = Math.max(0, ...found.map(({ score }) => score));
  const drops: Drop[] = found.map(({ part, before, score }) => {
    /* The rise covers the part before, up to BUILD_BARS bars, and at least 2 bars. */
    const buildStart = Math.min(part.start - 2 * bar, Math.max(before.start, part.start - BUILD_BARS * bar));
    const lastBeat = mean(curves.loudness, rate, part.start - beat, part.start);
    const barBefore = mean(curves.loudness, rate, part.start - bar - beat, part.start - beat);
    return {
      time: part.start,
      /* A drop the user set where the music hardly jumps still gets a clear hit. */
      strength: strongest > 0 ? Math.max(0.5, score / strongest) : 1,
      buildStart: nearest(downbeats, Math.max(0, buildStart)),
      pauseStart: barBefore - lastBeat >= PAUSE_DB ? part.start - beat : null
    };
  });

  const dropTimes = new Set(drops.map((drop) => drop.time));
  const cues = parts.slice(1).flatMap<Cue>((part, index) =>
    dropTimes.has(part.start) ? [{ time: part.start, drop: true }]
      : part.tier !== parts[index].tier ? [{ time: part.start, drop: false }]
      : []);
  return { parts, drops, cues };
}

/** The plan as a map the user can edit: one slice per part, with its name, its level, and whether a drop starts it. */
export function mapOf(plan: SongPlan): MapSlice[] {
  const drops = new Set(plan.drops.map((drop) => drop.time));
  return plan.parts.map((part) => ({ start: part.start, label: part.label, tier: part.tier, drop: drops.has(part.start) }));
}
