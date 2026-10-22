import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowCounterClockwise, ArrowsInLineHorizontal, MapTrifold, Play, Scissors, Trash, X } from "@phosphor-icons/react";
import { changeSlice, deleteSlice, mergeWithNext, splitSlice } from "../engine/songMapEdits";
import { TIER_NAMES, mapOf, planSong, type MapSlice, type Tier } from "../engine/songPlan";
import { songFollow } from "../lib/songFollow";
import { tracks } from "../lib/tracks";
import { Dropdown } from "./Dropdown";
import { placeSeek } from "./Slider";
import { MediaIcon } from "./MediaIcon";

const subscribeFollow = (listener: () => void) => songFollow.subscribe(listener);
const followVersion = () => songFollow.version;
const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksPlaying = () => tracks.playing;

/** The names a slice can have: LinkSeg's labels (see song_sections.rs). */
const NAMES = ["intro", "verse", "chorus", "bridge", "inst", "outro", "silence"] as const;
const NAME_OPTIONS = NAMES.map((name) => [name, name[0].toUpperCase() + name.slice(1)] as const);
const TIERS: readonly Tier[] = [0, 1, 2, 3];
const capital = (text: string) => text[0].toUpperCase() + text.slice(1);

/** Seconds as "1:05". */
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * The song map editor: a large map of one song's slices (its parts), each
 * colored by its level, with a red edge where a drop starts it. A click
 * selects a slice; a double-click splits it at that bar. For the selected
 * slice: its level, its name and its drop, and Split, Merge with next and
 * Delete (the slice before it grows into its place). Each change applies
 * at once (see songFollow.editMap) and is kept with the song's analysis,
 * so Save Playlist keeps it. Reset to automatic gives back the analysis's
 * own map. A toolbar across the top holds every control: Stop, Play or
 * Pause and Play slice (from the selected slice's start), then the
 * selected slice's controls, then Reset. Under the map, a bar the width of
 * the map moves in the song. A status bar above the footer shows which
 * slice is selected, where it is and how long it is, and the song's time. Delete removes the selected
 * slice, the arrow keys select another, Space plays or pauses, and Esc
 * closes.
 */
export function SongMapDialog({ path, name, onClose }: { path: string; name: string; onClose: () => void }) {
  const version = useSyncExternalStore(subscribeFollow, followVersion);
  const analysis = songFollow.analysisFor(path);
  /* The map as the plan has it: the edited slices, or the automatic map turned into slices. */
  const slices = useMemo(() => (analysis ? mapOf(planSong(analysis)) : []), [analysis, version]);
  const [selected, setSelected] = useState(0);
  const index = Math.min(selected, slices.length - 1);
  const dialog = useRef<HTMLDivElement>(null);
  const strip = useRef<HTMLDivElement>(null);
  const playhead = useRef<HTMLDivElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const scrub = useRef<HTMLInputElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const playing = useSyncExternalStore(subscribeTracks, tracksPlaying);
  useEffect(() => { dialog.current?.focus(); }, []);

  /* The frame loop reads the slices through a ref, so it need not start again on each edit. */
  const slicesRef = useRef(slices);
  slicesRef.current = slices;
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
      <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
        <div className="about-dialog song-map-dialog" role="dialog" aria-modal="true" aria-label="Song map">
          <p className="song-map-empty">This song has no analysis yet. Turn on Follow the song and play it first.</p>
          <div className="about-dialog-actions"><button className="button primary" onClick={onClose}>Close</button></div>
        </div>
      </div>
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
    <div className="about-dialog-overlay" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div
        ref={dialog}
        className="about-dialog song-map-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="song-map-title"
        tabIndex={-1}
        onKeyDown={(event) => {
          /* Here, so the keys do not also reach the app's shortcuts; a menu that is open takes its own keys first. */
          event.stopPropagation();
          if (event.key === "Escape") onClose();
          else if (event.key === "Delete" || event.key === "Backspace") {
            if (slices.length > 1) apply(deleteSlice(slices, index));
            setSelected(Math.max(0, index - 1));
          } else if (event.key === " ") {
            event.preventDefault();
            tracks.toggle();
          } else if (event.key === "ArrowLeft") setSelected(Math.max(0, index - 1));
          else if (event.key === "ArrowRight") setSelected(Math.min(slices.length - 1, index + 1));
        }}
      >
        <header className="video-dialog-header">
          <div className="open-dialog-title-icon"><MapTrifold size={22} weight="duotone" /></div>
          <div>
            <h2 id="song-map-title">Song map</h2>
            <p>{name} · {time(duration)} · {Math.round(analysis.tempo)} BPM</p>
          </div>
          <button className="about-dialog-close" onClick={onClose} aria-label="Close" data-tip="Close `Esc`"><X size={18} /></button>
        </header>
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
              <div className="song-map-field">
                <span>Name</span>
                <Dropdown value={NAMES.includes(slice.label as typeof NAMES[number]) ? slice.label : "verse"} options={NAME_OPTIONS} label="Slice name" onChange={(label) => apply(changeSlice(slices, index, { label }))} />
              </div>
              <label className="song-map-field" data-tip={index === 0 ? "The first slice has nothing before it, so it cannot start with a drop" : "On a drop the picture rises before it, and changes hard on it"}>
                <input type="checkbox" checked={slice.drop} disabled={index === 0} onChange={(event) => apply(changeSlice(slices, index, { drop: event.target.checked }))} />
                <span className="song-map-field-note">Drop</span>
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
            {slices.map((candidate, i) => {
              const sliceEnd = slices[i + 1]?.start ?? duration;
              return (
                <button
                  key={candidate.start}
                  className={`song-map-slice tier-${candidate.tier} ${i === index ? "selected" : ""} ${candidate.drop ? "drop" : ""}`}
                  style={{ left: at(candidate.start), width: at(sliceEnd - candidate.start) }}
                  aria-pressed={i === index}
                  aria-label={`${capital(candidate.label)}, ${TIER_NAMES[candidate.tier]}, ${time(candidate.start)} to ${time(sliceEnd)}${candidate.drop ? ", starts with a drop" : ""}`}
                  onClick={() => setSelected(i)}
                  onDoubleClick={(event) => {
                    apply(splitSlice(slices, i, analysis.downbeats, duration, timeAt(event)));
                    setSelected(i + 1);
                  }}
                >
                  {candidate.drop && <span className="song-map-drop-tag">Drop</span>}
                  <span className="song-map-slice-name">{capital(candidate.label)}</span>
                  <span className="song-map-slice-level">{capital(TIER_NAMES[candidate.tier])}</span>
                </button>
              );
            })}
            {bars.map((bar) => <i key={bar} className="song-map-bar" style={{ left: at(bar) }} />)}
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
          {slice && <span>Slice {index + 1} of {slices.length} · {time(slice.start)} – {time(end)} · {Math.round(end - slice.start)} s</span>}
          <span ref={clock} className="song-map-clock" />
        </div>
        <footer className="about-dialog-actions song-map-footer">
          <button className="button primary" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}
