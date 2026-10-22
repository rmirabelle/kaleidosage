import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowCounterClockwise, ArrowUUpLeft, ArrowsInLineHorizontal, CaretLeft, CaretRight, Lightning, ListNumbers, Scissors, Trash } from "@phosphor-icons/react";
import { changeSlice, deleteSlice, fillScenes, mergeWithNext, moveDivider, splitAt } from "../engine/songMapEdits";
import { TIER_NAMES, mapOf, planSong, type MapSlice, type Tier } from "../engine/songPlan";
import type { ScheduledSlice } from "../engine/showSchedule";
import { songFollow } from "../lib/songFollow";
import { tracks } from "../lib/tracks";
import { placeSeek } from "./Slider";
import { EmptyState } from "./EmptyState";
import { useCtrlHeld } from "./useCtrlHeld";

const subscribeFollow = (listener: () => void) => songFollow.subscribe(listener);
const followVersion = () => songFollow.version;
const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksVersion = () => tracks.version;

const TIERS: readonly Tier[] = [0, 1, 2, 3];
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Seconds as "1:05". */
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * The Song Map, under the scenes and the left panel (see App), while Song follow is on: the map
 * of one song, at first the song that plays. The arrows on each side of
 * the song's name show the map of the song before or after it in the
 * playlist, and do nothing else. The slices (the song's parts) are each
 * colored by their level, with a red lightning mark where a hit starts one, and
 * show the number of the scene that the show's schedule gives them (see
 * showSchedule.ts): amber for a scene the user picked, bright for the
 * scene selected in the scene list. While a slice is selected, a Ctrl+click
 * on a scene in the scene list picks that scene for it (see
 * songFollow.pickScene); while Ctrl is held, the selected slice shows the
 * same amber as the scene under the pointer. A click selects a slice and plays its song from the
 * slice's start, with the slice's scene, and the map then follows the
 * song that plays again; a right-click stops the
 * song where it is; a drag of the divider between
 * two slices moves it from bar to bar. It is a card: a title bar with
 * the song's name and the arrows, then a dark toolbar that holds the
 * selected slice's level, the Slice buttons (the picked scene, where a
 * click undoes the pick; Hit; Split at the playhead; Merge with next; and
 * Delete: the slice before it grows into its place), then Fill (a picked
 * scene for each slice with none, in scene list order) and Reset Map (the
 * analysis's own map); the Playlist card's controls
 * play the song. Each change applies at
 * once (see songFollow.editMap) and is kept with the song's analysis, so
 * Save Playlist keeps it. Under the map, a bar the width of the map moves
 * in the song. While the map has the keyboard focus,
 * Delete removes the selected slice.
 */
/**
 * "sceneCount": the number of scenes (tabs) that the schedule goes round.
 * "activeScene": the tab index of the scene selected in the scene list.
 * "held": true while Scene Hold keeps the scene; the slice that plays then
 * shows a HOLD mark (it loops in the music). The mark only shows the state:
 * a click on the slice still plays it.
 * "onSlicePick": a click on a slice, with its place in the schedule.
 */
export function SongMapPanel({ sceneCount, activeScene, held, onSlicePick }: { sceneCount: number; activeScene: number; held: boolean; onSlicePick: (slice: ScheduledSlice) => void }) {
  const version = useSyncExternalStore(subscribeFollow, followVersion);
  useSyncExternalStore(subscribeTracks, tracksVersion);
  const schedule = songFollow.enabled ? songFollow.schedule(sceneCount) : [];
  /** The song that the arrows picked to show, or null for the song that plays. */
  const [viewed, setViewed] = useState<string | null>(null);
  const playingPath = songFollow.enabled ? songFollow.currentPath ?? "" : "";
  const path = songFollow.enabled && viewed && tracks.list.some((track) => track.path === viewed) ? viewed : playingPath;
  const trackIndex = tracks.list.findIndex((track) => track.path === path);
  /** Shows the map of the song before (-1) or after (1) this one. */
  const showSong = (step: -1 | 1) => {
    const next = tracks.list[trackIndex + step];
    if (!next) return;
    setViewed(next.path === playingPath ? null : next.path);
    setSelected(0);
  };
  const scenes = schedule[trackIndex] ?? [];
  const analysis = path ? songFollow.analysisFor(path) : undefined;
  const name = tracks.list.find((track) => track.path === path)?.name ?? "";
  /* The map as the plan has it: the edited slices, or the automatic map turned into slices. */
  const slices = useMemo(() => (analysis ? mapOf(planSong(analysis)) : []), [analysis, version]);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, slices.length - 1);
  const strip = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const ctrlHeld = useCtrlHeld();
  /* The selected slice, for a Ctrl+click in the scene list; none while the page does not show. */
  useEffect(() => {
    songFollow.selectSlice(analysis && slices.length ? { path, index } : null);
  }, [analysis, path, index, slices.length]);
  useEffect(() => () => songFollow.selectSlice(null), []);

  /* The frame loop reads the slices through a ref, so it need not start again on each edit. */
  /** The map while a divider is dragged (see the dividers below); it applies when the drag ends. */
  const [draft, setDraft] = useState<MapSlice[] | null>(null);
  const view = draft ?? slices;
  const slicesRef = useRef(view);
  slicesRef.current = view;
  /**
   * The playhead follows the song in each animation frame, while this song
   * plays. Each time another slice starts to play (or the playhead jumps
   * into it), that slice is selected.
   */
  useEffect(() => {
    let frame = 0;
    let lastPlaying = -1;
    const draw = () => {
      const line = playhead.current;
      if (line && analysis) {
        const shown = tracks.current?.path === path;
        line.style.display = shown ? "" : "none";
        if (shown) line.style.left = `${(tracks.position / Math.max(1e-3, analysis.duration)) * 100}%`;
        const now = shown ? tracks.position : 0;
        if (scrub.current && !dragging.current) scrub.current.value = String(now);
        placeSeek(scrub.current, fill.current, cap.current, Number(scrub.current?.value ?? 0) / Math.max(1e-3, analysis.duration));
        const current = shown ? slicesRef.current.filter((slice) => slice.start <= now).length - 1 : -1;
        if (current >= 0 && current !== lastPlaying) setSelected(current);
        lastPlaying = current;
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analysis, path]);

  /* The card's title bar: the song's file name, in the style of the scene card's title, with an arrow on each side to show the song before or after it. */
  const title = (
    <div className="panel-header-bar song-map-header">
      <button className="panel-button icon song-map-song-step" disabled={trackIndex < 1} onClick={() => showSong(-1)} data-tip="Show the map of the song before this one" aria-label="Previous song's map">
        <CaretLeft size={13} />
      </button>
      <h2 className="side-panel-title source-title song-map-title" data-tip={name}><span>{name}</span></h2>
      <button className="panel-button icon song-map-song-step" disabled={trackIndex < 0 || trackIndex >= tracks.list.length - 1} onClick={() => showSong(1)} data-tip="Show the map of the song after this one" aria-label="Next song's map">
        <CaretRight size={13} />
      </button>
    </div>
  );

  if (!analysis) {
    return (
      <section className="panel-card song-map-page" aria-label="Song Map">
        {songFollow.enabled && trackIndex >= 0 ? (
          <>
            {title}
            <div className="song-map-body">
              <p className="song-map-wait">This song's map comes when its analysis is done.</p>
            </div>
          </>
        ) : (
          <EmptyState text="No song map yet: turn on Song follow in the Playlist card, and play a song." />
        )}
      </section>
    );
  }

  const duration = analysis.duration;
  const at = (seconds: number) => `${(seconds / Math.max(1e-3, duration)) * 100}%`;
  const apply = (next: MapSlice[]) => songFollow.editMap(path, next);
  const slice = slices[index];
  /* The slice that Scene Hold loops: the selected one, which is the one that plays. */
  const heldSlice = held && tracks.current?.path === path ? index : -1;
  /* The song time under the pointer, for a double-click split. */
  const timeAt = (event: { clientX: number }) => {
    const box = strip.current!.getBoundingClientRect();
    return ((event.clientX - box.left) / box.width) * duration;
  };
  const bars = analysis.downbeats.filter((_, i) => i % 4 === 0);

  return (
    <section
      className="panel-card song-map-page"
      aria-label="Song Map"
      tabIndex={-1}
      onKeyDown={(event) => {
        const target = event.target as Element;
        if (target.closest("input, select, [role=listbox]")) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          if (slices.length > 1) apply(deleteSlice(slices, index));
          setSelected(Math.max(0, index - 1));
        } else return;
        /* A key this page used does not also reach the app's shortcuts. */
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      {title}
      <div className="song-map-toolbar">
        {slice && (
          <>
            <div className="song-map-field">
              <span>Level</span>
              <div className="panel-buttons">
                {TIERS.map((tier) => (
                  <button key={tier} className={`panel-button text-only ${slice.tier === tier ? "active" : ""}`} aria-pressed={slice.tier === tier} onClick={() => apply(changeSlice(slices, index, { tier }))}>
                    {capital(TIER_NAMES[tier])}
                  </button>
                ))}
              </div>
            </div>
            {/* The selected slice: first its picked scene, if any (a click undoes the pick); Hit stays pressed while it is on; Split, Merge and Delete change the slices. */}
            <div className="song-map-field song-map-slice-tools">
              <span>Slice</span>
              <div className="panel-buttons">
                {slice.scene !== undefined && (
                  <button className="panel-button picked-scene" onClick={() => apply(changeSlice(slices, index, { scene: undefined }))} data-tip="You picked this scene (Ctrl+click in the scene list, or Fill). Click to undo the pick: the slice keeps the scene of the slice before it again">
                    Scene {slice.scene + 1} <ArrowUUpLeft size={13} weight="bold" />
                  </button>
                )}
                <button
                  className={`panel-button ${slice.drop ? "active" : ""}`}
                  aria-pressed={slice.drop}
                  disabled={index === 0}
                  onClick={() => apply(changeSlice(slices, index, { drop: !slice.drop }))}
                  data-tip={index === 0 ? "The first slice has nothing before it, so it cannot start with a hit" : "Hit: the picture rises before this slice, and changes hard as it starts; then the slice moves at its level"}
                >
                  <Lightning size={15} /> Hit
                </button>
                <button
                  className="panel-button"
                  disabled={tracks.current?.path !== path}
                  onClick={() => {
                    const next = splitAt(slices, analysis.downbeats, tracks.position);
                    if (next.length === slices.length) return;
                    apply(next);
                    setSelected(next.filter((candidate) => candidate.start <= tracks.position + 0.01).length - 1);
                  }}
                  data-tip={tracks.current?.path !== path ? "Play this song to split at the playhead" : "Split the slice at the playhead, at the bar nearest it. Nothing happens at a bar where a slice starts already"}
                >
                  <Scissors size={15} /> Split
                </button>
                <button className="panel-button" disabled={index >= slices.length - 1} onClick={() => apply(mergeWithNext(slices, index))} data-tip="Join this slice with the next one; it keeps this slice's name and level">
                  <ArrowsInLineHorizontal size={15} /> Merge
                </button>
                <button
                  className="panel-button icon"
                  disabled={slices.length < 2}
                  aria-label="Delete this slice"
                  onClick={() => {
                    apply(deleteSlice(slices, index));
                    setSelected(Math.max(0, index - 1));
                  }}
                  data-tip="Delete this slice: the slice before it grows into its place `Delete`"
                >
                  <Trash size={15} />
                </button>
              </div>
            </div>
          </>
        )}
        <div className="song-map-song-tools">
          <button
            className="panel-button song-map-fill"
            disabled={slices.every((candidate) => candidate.scene !== undefined)}
            onClick={() => apply(fillScenes(slices, scenes[0]?.scene ?? 0, sceneCount))}
            data-tip="Fill: pick a scene for each slice of this song that has none, so each slice plays the next scene in the scene list. Your own picks stay"
          >
            <ListNumbers size={15} /> Fill
          </button>
          <button className="panel-button song-map-reset" disabled={!analysis.mapEdits} onClick={() => songFollow.editMap(path, null)} data-tip="Give back the map that the analysis found: its slices, levels and hits, with no picked scenes">
            <ArrowCounterClockwise size={14} /> Reset Map
          </button>
        </div>
      </div>
      <div className="song-map-body">
        <div ref={strip} className="song-map-strip" data-tip="Click a slice to select it and play the song from its start; right-click to stop the song where it is. Ctrl+click a scene in the scene list to play it on the selected slice">
          {view.map((candidate, i) => {
            const sliceEnd = view[i + 1]?.start ?? duration;
            return (
              <button
                key={candidate.start}
                className={`song-map-slice tier-${candidate.tier} ${i === index ? "selected" : ""} ${i === index && ctrlHeld ? "picking" : ""}`}
                style={{ left: at(candidate.start), width: at(sliceEnd - candidate.start) }}
                aria-pressed={i === index}
                aria-label={`${capital(TIER_NAMES[candidate.tier])}, ${time(candidate.start)} to ${time(sliceEnd)}${candidate.drop ? ", starts with a hit" : ""}`}
                onClick={() => {
                  setSelected(i);
                  /* The song plays from the slice's start, and the slice's scene comes in (see App's show schedule); the map follows the song that plays again. */
                  if (scenes[i]) onSlicePick(scenes[i]);
                  tracks.playAt(trackIndex, candidate.start);
                  setViewed(null);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  tracks.pause();
                }}
              >
                {scenes[i] && (
                  <span className="song-map-tags">
                    <span
                      className={`song-map-scene-tag ${scenes[i].picked ? "picked" : ""} ${scenes[i].scene === activeScene ? "current" : ""}`}
                      data-tip={`Scene ${scenes[i].scene + 1}${scenes[i].picked ? ", picked by you" : i > 0 ? ", kept from the slice before" : ", the next one after the song before"}${scenes[i].scene === activeScene ? "; the scene selected in the scene list" : ""}`}
                    >
                      {scenes[i].scene + 1}
                    </span>
                  </span>
                )}
                {(candidate.drop || i === heldSlice) && (
                  <span className="song-map-center-tags">
                    {candidate.drop && <span className="song-map-drop-tag" data-tip="Hit: the picture rises before this slice, and changes hard as it starts" aria-hidden="true"><Lightning size={12} weight="fill" /></span>}
                    {i === heldSlice && <span className="song-map-hold-tag hold-badge-label">Hold</span>}
                  </span>
                )}
                <span className="song-map-slice-name">{capital(TIER_NAMES[candidate.tier])}</span>
              </button>
            );
          })}
          {bars.map((bar) => <i key={bar} className="song-map-bar" style={{ left: at(bar) }} />)}
          {/* A divider between two slices: a drag moves it from bar to bar, and both slices change size. */}
          {view.slice(1).map((candidate, k) => (
            <div
              key={`divider-${k}`}
              className="song-map-divider"
              style={{ left: at(candidate.start) }}
              data-tip="Drag to move this divider: both slices change size"
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                event.preventDefault();
                const handle = event.currentTarget;
                handle.setPointerCapture(event.pointerId);
                const base = slices;
                let latest = base;
                const move = (moveEvent: PointerEvent) => {
                  latest = moveDivider(base, k + 1, analysis.downbeats, duration, timeAt(moveEvent));
                  setDraft(latest);
                };
                const end = () => {
                  handle.removeEventListener("pointermove", move);
                  handle.removeEventListener("pointerup", end);
                  handle.removeEventListener("lostpointercapture", end);
                  setDraft(null);
                  if (latest !== base && latest[k + 1].start !== base[k + 1].start) apply(latest);
                };
                handle.addEventListener("pointermove", move);
                handle.addEventListener("pointerup", end);
                handle.addEventListener("lostpointercapture", end);
              }}
            />
          ))}
          <div ref={playhead} className="song-map-playhead" />
        </div>
        <div className="slider playlist-seek song-map-scrub" data-tip="Drag to move in the song">
          <div className="slider-well">
            <div ref={fill} className="slider-fill" style={{ left: 0 }} />
          </div>
          <div ref={cap} className="seek-cap" />
          <input
            ref={scrub}
            type="range"
            min={0}
            max={duration}
            step={0.05}
            aria-label="Place in the song"
            onPointerDown={() => { dragging.current = true; }}
            onPointerUp={() => { dragging.current = false; }}
            onChange={(event) => {
              /* On the map of another song, a drag plays that song from there, as a slice click does. */
              if (tracks.current?.path === path) tracks.seek(Number(event.target.value));
              else {
                tracks.playAt(trackIndex, Number(event.target.value));
                setViewed(null);
              }
            }}
          />
        </div>
        <div className="song-map-ruler">
          {Array.from({ length: Math.floor(duration / 30) + 1 }, (_, i) => (
            <span key={i} style={{ left: at(i * 30) }}>{time(i * 30)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}
