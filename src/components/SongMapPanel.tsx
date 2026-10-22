import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowCounterClockwise, ArrowsInLineHorizontal, Play, Scissors, Trash } from "@phosphor-icons/react";
import { changeSlice, deleteSlice, mergeWithNext, moveDivider, splitSlice } from "../engine/songMapEdits";
import { TIER_NAMES, mapOf, planSong, type MapSlice, type Tier } from "../engine/songPlan";
import { songFollow } from "../lib/songFollow";
import { tracks } from "../lib/tracks";
import { placeSeek } from "./Slider";
import { MediaIcon } from "./MediaIcon";
import { EmptyState } from "./EmptyState";

const subscribeFollow = (listener: () => void) => songFollow.subscribe(listener);
const followVersion = () => songFollow.version;
const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksPlaying = () => tracks.playing;

const TIERS: readonly Tier[] = [0, 1, 2, 3];
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Seconds as "1:05". */
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * The Song Map page of the bottom panel: the map of the song that plays,
 * while Song follow is on. Its slices (its parts) are each colored by
 * their level, with a red edge where a hit starts one. A click selects a
 * slice; a double-click splits it at that bar; a drag of the divider
 * between two slices moves it from bar to bar. A toolbar across the top
 * holds every control: Stop, Play or Pause and Play slice (from the
 * selected slice's start), then the selected slice's level, Hit and Keep
 * Scene, Split, Merge with next and Delete (the slice before it grows into
 * its place), then Reset (the analysis's own map). Each change applies at
 * once (see songFollow.editMap) and is kept with the song's analysis, so
 * Save Playlist keeps it. Under the map, a bar the width of the map moves
 * in the song; a status bar at the bottom shows the song, the selected
 * slice, and the song's time. While the page has the keyboard focus,
 * Delete removes the selected slice and the arrow keys select another.
 */
export function SongMapPanel() {
  const version = useSyncExternalStore(subscribeFollow, followVersion);
  const path = songFollow.enabled ? songFollow.currentPath ?? "" : "";
  const analysis = path ? songFollow.analysisFor(path) : undefined;
  const name = tracks.list.find((track) => track.path === path)?.name ?? "";
  /* The map as the plan has it: the edited slices, or the automatic map turned into slices. */
  const slices = useMemo(() => (analysis ? mapOf(planSong(analysis)) : []), [analysis, version]);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, slices.length - 1);
  const strip = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const playing = useSyncExternalStore(subscribeTracks, tracksPlaying);

  /* The frame loop reads the slices through a ref, so it need not start again on each edit. */
  /** The map while a divider is dragged (see the dividers below); it applies when the drag ends. */
  const [draft, setDraft] = useState<MapSlice[] | null>(null);
  const view = draft ?? slices;
  const slicesRef = useRef(view);
  slicesRef.current = view;
  /* The playhead follows the song in each animation frame, while this song plays, and the slice it is in gets a subtle highlight. */
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const line = playhead.current;
      if (line && analysis) {
        const shown = tracks.current?.path === path;
        line.style.display = shown ? "" : "none";
        if (shown) line.style.left = `${(tracks.position / Math.max(1e-3, analysis.duration)) * 100}%`;
        const now = shown ? tracks.position : 0;
        if (scrub.current && !dragging.current) scrub.current.value = String(now);
        placeSeek(scrub.current, fill.current, cap.current, Number(scrub.current?.value ?? 0) / Math.max(1e-3, analysis.duration));
        const text = `${time(shown ? tracks.position : 0)} / ${time(analysis.duration)}`;
        if (clock.current && clock.current.textContent !== text) clock.current.textContent = text;
        const current = shown ? slicesRef.current.filter((slice) => slice.start <= now).length - 1 : -1;
        strip.current?.querySelectorAll(".song-map-slice").forEach((element, i) => element.classList.toggle("playing", i === current));
      }
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [analysis, path]);

  if (!analysis) {
    return (
      <section className="bottom-panel-page song-map-page" aria-label="Song Map">
        <EmptyState text="No song map yet: turn on Song follow in the Playlist card, and play a song." />
      </section>
    );
  }

  const duration = analysis.duration;
  const at = (seconds: number) => `${(seconds / Math.max(1e-3, duration)) * 100}%`;
  const apply = (next: MapSlice[]) => songFollow.editMap(path, next);
  const slice = slices[index];
  const end = slices[index + 1]?.start ?? duration;
  /* The song time under the pointer, for a double-click split. */
  const timeAt = (event: { clientX: number }) => {
    const box = strip.current!.getBoundingClientRect();
    return ((event.clientX - box.left) / box.width) * duration;
  };
  const bars = analysis.downbeats.filter((_, i) => i % 4 === 0);

  return (
    <section
      className="bottom-panel-page song-map-page"
      aria-label="Song Map"
      tabIndex={-1}
      onKeyDown={(event) => {
        const target = event.target as Element;
        if (target.closest("input, select, [role=listbox]")) return;
        if (event.key === "Delete" || event.key === "Backspace") {
          if (slices.length > 1) apply(deleteSlice(slices, index));
          setSelected(Math.max(0, index - 1));
        } else if (event.key === "ArrowLeft") setSelected(Math.max(0, index - 1));
        else if (event.key === "ArrowRight") setSelected(Math.min(slices.length - 1, index + 1));
        else return;
        /* A key this page used does not also reach the app's shortcuts. */
        event.preventDefault();
        event.stopPropagation();
      }}
    >
      <div className="song-map-toolbar">
        <div className="panel-buttons">
          <button className="panel-button icon" onClick={() => tracks.stop()} data-tip="Stop the song, and go back to its start" aria-label="Stop the song">
            <MediaIcon kind="stop" size={16} />
          </button>
          <button className="panel-button icon" onClick={() => tracks.toggle()} data-tip={playing ? "Pause the song `Space`" : "Play the song `Space`"} aria-label={playing ? "Pause the song" : "Play the song"}>
            {playing ? <MediaIcon kind="pause" size={16} /> : <MediaIcon kind="play" size={16} />}
          </button>
          <button
            className="panel-button"
            disabled={!slice}
            onClick={() => {
              tracks.seek(slice.start);
              if (!tracks.playing) void tracks.play();
            }}
            data-tip="Play the song from the start of the selected slice"
          >
            <Play size={14} weight="fill" /> Play slice
          </button>
        </div>
        <span className="song-map-toolbar-divider" />
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
            <label className="song-map-field" data-tip={index === 0 ? "The first slice has nothing before it, so it cannot start with a hit" : "Hit: the picture rises before this slice, and changes hard as it starts; then the slice moves at its level"}>
              <input type="checkbox" checked={slice.drop} disabled={index === 0} onChange={(event) => apply(changeSlice(slices, index, { drop: event.target.checked }))} />
              <span className="song-map-field-note">Hit</span>
            </label>
            <label className="song-map-field" data-tip={index === 0 ? "The first slice has nothing before it, so there is no scene change to skip" : "Keep the scene as this slice starts: its level and hit still change the motion, but the next scene does not come in"}>
              <input type="checkbox" checked={Boolean(slice.keepScene)} disabled={index === 0} onChange={(event) => apply(changeSlice(slices, index, { keepScene: event.target.checked }))} />
              <span className="song-map-field-note">Keep Scene</span>
            </label>
            <div className="panel-buttons">
              <button className="panel-button" onClick={() => apply(splitSlice(slices, index, analysis.downbeats, duration))} data-tip="Split this slice in two at the bar nearest its middle (or double-click the slice where you want the cut)">
                <Scissors size={15} /> Split
              </button>
              <button className="panel-button" disabled={index >= slices.length - 1} onClick={() => apply(mergeWithNext(slices, index))} data-tip="Join this slice with the next one; it keeps this slice's name and level">
                <ArrowsInLineHorizontal size={15} /> Merge
              </button>
              <button
                className="panel-button"
                disabled={slices.length < 2}
                onClick={() => {
                  apply(deleteSlice(slices, index));
                  setSelected(Math.max(0, index - 1));
                }}
                data-tip="Delete this slice: the slice before it grows into its place `Delete`"
              >
                <Trash size={15} /> Delete
              </button>
            </div>
          </>
        )}
        <button className="panel-button song-map-reset" disabled={!analysis.mapEdits} onClick={() => songFollow.editMap(path, null)} data-tip="Give back the map that the analysis found">
          <ArrowCounterClockwise size={14} /> Reset
        </button>
      </div>
      <div className="song-map-body">
        <div ref={strip} className="song-map-strip" data-tip="Click a slice to select it; double-click to split it at that bar">
          {view.map((candidate, i) => {
            const sliceEnd = view[i + 1]?.start ?? duration;
            return (
              <button
                key={candidate.start}
                className={`song-map-slice tier-${candidate.tier} ${i === index ? "selected" : ""} ${candidate.drop ? "drop" : ""}`}
                style={{ left: at(candidate.start), width: at(sliceEnd - candidate.start) }}
                aria-pressed={i === index}
                aria-label={`${capital(TIER_NAMES[candidate.tier])}, ${time(candidate.start)} to ${time(sliceEnd)}${candidate.drop ? ", starts with a hit" : ""}`}
                onClick={() => setSelected(i)}
                onDoubleClick={(event) => {
                  apply(splitSlice(slices, i, analysis.downbeats, duration, timeAt(event)));
                  setSelected(i + 1);
                }}
              >
                {(candidate.drop || candidate.keepScene) && (
                  <span className="song-map-tags">
                    {candidate.drop && <span className="song-map-drop-tag">Hit</span>}
                    {candidate.keepScene && <span className="song-map-keep-tag">Keep Scene</span>}
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
            onChange={(event) => tracks.seek(Number(event.target.value))}
          />
        </div>
        <div className="song-map-ruler">
          {Array.from({ length: Math.floor(duration / 30) + 1 }, (_, i) => (
            <span key={i} style={{ left: at(i * 30) }}>{time(i * 30)}</span>
          ))}
        </div>
      </div>
      <div className="song-map-status" aria-live="polite">
        <span>{name} · {time(duration)} · {Math.round(analysis.tempo)} BPM</span>
        {slice && <span>Slice {index + 1} of {slices.length} · {time(slice.start)} – {time(end)} · {Math.round(end - slice.start)} s</span>}
        <span ref={clock} className="song-map-clock" />
      </div>
    </section>
  );
}
