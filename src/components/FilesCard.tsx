import { useEffect, useRef, useState, useSyncExternalStore, type RefObject } from "react";
import { createPortal } from "react-dom";
import { CaretDoubleLeft, CaretDoubleRight, MapTrifold, Plus, SpeakerHigh, Trash, Waveform, X } from "@phosphor-icons/react";
import { MediaIcon } from "./MediaIcon";
import { placeSeek } from "./Slider";
import { FLOOR_DB } from "../engine/audio";
import type { Engine } from "../engine/engine";
import { PARAM_KEYS } from "../engine/params";
import { TIER_NAMES } from "../engine/songPlan";
import { THRESHOLD_DB, audioInput } from "../lib/audioInput";
import { panelLayout } from "../lib/panelLayout";
import { formatPlayTime, tracks } from "../lib/tracks";
import { songFollow, type FollowStatus } from "../lib/songFollow";
import { help } from "../help/topics";
import { ConfirmDialog } from "./ConfirmDialog";
import { EmptyState } from "./EmptyState";
import { SongMapDialog } from "./SongMapDialog";
import { HelpButton } from "./HelpButton";
import { useDragReorder } from "./useDragReorder";

const subscribeTracks = (listener: () => void) => tracks.subscribe(listener);
const tracksVersion = () => tracks.version;
const subscribeFollow = (listener: () => void) => songFollow.subscribe(listener);
const followVersion = () => songFollow.version;

/** The Follow button's tip: what Follow does, and where the analysis of the track stands. */
function followTip(enabled: boolean, status: FollowStatus) {
  if (!enabled) return "Follow the song: analyze the track that plays, and let the music move the picture in place of the audio links";
  switch (status.state) {
    case "analyzing": return `Follow the song is on: analyzing ${status.name}…`;
    case "ready": return `Follow the song is on: the picture follows ${status.name} (${Math.round(status.tempo)} BPM). Click to turn it off.`;
    case "error": return `Follow the song is on, but the analysis failed. Click to turn it off.`;
    default: return "Follow the song is on. Click to turn it off.";
  }
}

/**
 * The audio files, while Files is the input: the first column of the left
 * side (see .sidebar), a card like the Source card. Its title bar has Add
 * and a trash can that asks before it clears the list; then one row per
 * file. A click on a file plays it; a drag moves it to another place (see
 * useDragReorder); the file that plays shows a speaker; X removes a file.
 * A footer shows the number of files and their play time. The line at the
 * column's right edge sets its width (see FilesSplitter). The button at the
 * left of the title collapses the column to a narrow strip, and a click on
 * the strip opens it again (View > Hide Playlist does the same). The play
 * toolbar at the bottom runs the music on its own (see PlaylistTransport);
 * the controls on the picture run the scene.
 */
export function FilesCard({ engine, onAddTracks }: { engine: Engine | null; onAddTracks: () => void }) {
  useSyncExternalStore(subscribeTracks, tracksVersion);
  useSyncExternalStore(subscribeFollow, followVersion);
  const width = useSyncExternalStore(panelLayout.subscribe, () => panelLayout.filesWidth);
  const collapsed = useSyncExternalStore(panelLayout.subscribe, () => panelLayout.filesCollapsed);
  const [clearAsked, setClearAsked] = useState(false);
  const drag = useDragReorder(tracks.list.map((track) => track.path), (order) => tracks.reorder(order));
  const count = tracks.list.length;
  if (collapsed) {
    return (
      <aside className="side-panel files-column collapsed" aria-label="Playlist">
        <button className="files-collapsed" onClick={() => panelLayout.setFilesCollapsed(false)} data-tip="Show the Playlist column" aria-label="Show the Playlist column">
          <CaretDoubleRight size={14} weight="bold" />
          <span className="files-collapsed-title">Playlist</span>
          <span className="files-collapsed-count" data-tip={count === 1 ? "1 file" : `${count} files`}>{count}</span>
        </button>
      </aside>
    );
  }
  return (
    <>
      <aside className="side-panel files-column" style={{ width }} aria-label="Playlist" {...help("audio.files")}>
        <section className="panel-card files-card">
          <div className="panel-header-bar">
            <button className="files-collapse" onClick={() => panelLayout.setFilesCollapsed(true)} data-tip="Collapse the Playlist column to a narrow strip" aria-label="Collapse the Playlist column">
              <CaretDoubleLeft size={14} weight="bold" />
            </button>
            <h2 className="side-panel-title">Playlist</h2>
            <span className="files-card-buttons">
              <button className="button secondary small" onClick={onAddTracks} data-tip="Add audio files at the end of the list">
                <Plus size={13} weight="bold" /> Add
              </button>
              <button className="button secondary small icon-only" disabled={count === 0} onClick={() => setClearAsked(true)} data-tip="Remove every file from the list" aria-label="Remove every file from the list">
                <Trash size={14} />
              </button>
            </span>
            <HelpButton topic="audio.files" />
          </div>
          <div className="files-card-body">
            {tracks.error && <p className="audio-error selectable">{tracks.error}</p>}
            {songFollow.enabled && songFollow.status.state === "error" && <p className="audio-error selectable">{songFollow.status.message}</p>}
            {count === 0 ? (
              <EmptyState text="Add audio files to play them, one after the other.">
                <button className="button secondary small" onClick={onAddTracks}>
                  <Plus size={13} weight="bold" /> Add File(s)
                </button>
              </EmptyState>
            ) : (
              /* The rows look like the scene list's (see SceneList): a number, the name, and an X that shows on hover; the file that plays is bright blue, with a speaker for its number. */
              <ol ref={drag.listRef} className="scene-list-items">
                {tracks.list.map((track, index) => {
                  const current = index === tracks.index;
                  return (
                    <li
                      key={track.path}
                      data-key={track.path}
                      className={`scene-list-item file-item ${current ? "active" : ""} ${drag.dragging === track.path ? "dragging" : ""}`}
                      data-tip={`${track.path}. Click to play it; drag to move it.`}
                      onPointerDown={drag.start(track.path)}
                      onClick={() => { if (!drag.takeClick()) tracks.playTrack(index); }}
                    >
                      <span className="scene-list-number">{current && tracks.playing ? <SpeakerHigh size={12} weight="fill" /> : index + 1}</span>
                      <span className="scene-list-name">{track.name}</span>
                      <button
                        className="scene-list-close"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          tracks.remove(index);
                        }}
                        data-tip="Remove this file"
                        aria-label={`Remove ${track.name}`}
                      >
                        <X size={12} weight="bold" />
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
          {count > 0 && <FilesFooter count={count} />}
          <PlaylistTransport count={count} engine={engine} />
        </section>
      </aside>
      <FilesSplitter />
      {clearAsked && createPortal(
        <ConfirmDialog
          title="Remove every file?"
          message={`All ${count === 1 ? "1 file goes" : `${count} files go`} out of the list. The files on disk stay as they are.`}
          confirmLabel="Remove all"
          onCancel={() => setClearAsked(false)}
          onConfirm={() => {
            tracks.clear();
            setClearAsked(false);
          }}
        />,
        document.body
      )}
    </>
  );
}

/** Follow the song on or off (see songFollow.ts). It pulses while the track is being analyzed. */
function FollowButton() {
  useSyncExternalStore(subscribeFollow, followVersion);
  const { enabled, status } = songFollow;
  return (
    <button
      className={`panel-button icon ${enabled ? "active" : ""} ${enabled && status.state === "analyzing" ? "analyzing" : ""}`}
      aria-pressed={enabled}
      onClick={() => songFollow.toggle()}
      data-tip={followTip(enabled, status)}
      aria-label="Follow the song"
    >
      <Waveform size={16} weight={enabled ? "fill" : "regular"} />
    </button>
  );
}

/**
 * Opens the song map editor (see SongMapDialog) for the song that plays.
 * It works once the song has its analysis, while Follow the song is on.
 */
function MapButton() {
  useSyncExternalStore(subscribeFollow, followVersion);
  const [open, setOpen] = useState(false);
  const path = songFollow.enabled ? songFollow.currentPath : null;
  const ready = path !== null && songFollow.analysisFor(path) !== undefined;
  const name = tracks.list.find((track) => track.path === path)?.name ?? "";
  return (
    <>
      <button
        className={`panel-button icon ${open ? "active" : ""}`}
        disabled={!ready}
        onClick={() => setOpen(true)}
        data-tip={ready ? "Edit the song map: the song's slices, their levels, names and drops" : "Song map: turn on Follow the song and play a song first"}
        aria-label="Edit the song map"
      >
        <MapTrifold size={16} />
      </button>
      {open && path && createPortal(<SongMapDialog path={path} name={name} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** A time in the file as "1:05". */
const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * The Playlist card's play toolbar, at its bottom: a level meter of the
 * music (gray under the Threshold, which a line marks, as in the Audio
 * panel's meters; see ThresholdMeter), then on one line Stop (back to the start of the file),
 * Play or Pause, a bar to seek in the file drawn like the effects'
 * sliders, and the time in the file. It runs the music
 * only. The time and the bar follow the music in each animation frame, not
 * through React state; a drag on the bar seeks. While the picture follows
 * the song, Space and Shift+Space run these controls (see App).
 */
function PlaylistTransport({ count, engine }: { count: number; engine: Engine | null }) {
  const bar = useRef<HTMLInputElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const cap = useRef<HTMLDivElement>(null);
  const level = useRef<HTMLElement>(null);
  const threshold = useRef<HTMLElement>(null);
  /* The Threshold line is placed by React (see ThresholdMeter), the bar by this frame loop. */
  const clock = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  const song = useSyncExternalStore(subscribeFollow, () => songFollow.enabled ? songFollow.script : null);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const duration = tracks.duration;
      if (bar.current && !dragging.current) {
        bar.current.max = String(duration || 1);
        bar.current.value = String(tracks.position);
      }
      placeSeek(bar.current, fill.current, cap.current, Number(bar.current?.value ?? 0) / (duration || 1));
      /* The level from FLOOR_DB (empty) to 0 dBFS (full). */
      const loudness = audioInput.analyzer?.decibels.level ?? FLOOR_DB;
      if (level.current) {
        level.current.style.width = `${meterPlace(loudness) * 100}%`;
        level.current.classList.toggle("under", loudness < audioInput.settings.thresholdDb);
      }
      const text = duration ? `${time(tracks.position)} / ${time(duration)}` : "";
      if (clock.current && clock.current.textContent !== text) clock.current.textContent = text;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  const empty = count === 0;
  return (
    <div className="playlist-transport" aria-label="Music controls">
      <ThresholdMeter level={level} threshold={threshold} />
      <div className="playlist-transport-row">
        <div className="panel-buttons">
          <button className="panel-button icon" disabled={empty} onClick={() => tracks.stop()} data-tip={song ? "Stop the music, and go back to the start of the file `Shift+Space`" : "Stop the music, and go back to the start of the file"} aria-label="Stop the music">
            <MediaIcon kind="stop" size={16} />
          </button>
          <button className="panel-button icon" disabled={empty} onClick={() => tracks.toggle()} data-tip={`${tracks.playing ? "Pause the music" : "Play the music"}${song ? " `Space`" : ""}`} aria-label={tracks.playing ? "Pause the music" : "Play the music"}>
            {tracks.playing ? <MediaIcon kind="pause" size={16} /> : <MediaIcon kind="play" size={16} />}
          </button>
          <FollowButton />
          <MapButton />
        </div>
        <div className="slider playlist-seek">
          <div className="slider-well">
            <div ref={fill} className="slider-fill" style={{ left: 0 }} />
          </div>
          <div ref={cap} className="seek-cap" />
          <input
            ref={bar}
            type="range"
            min={0}
            step={0.1}
            disabled={empty}
            aria-label="Position in the file"
            onPointerDown={() => { dragging.current = true; }}
            onPointerUp={() => { dragging.current = false; }}
            onChange={(event) => tracks.seek(Number(event.target.value))}
          />
        </div>
        <span ref={clock} className="playlist-transport-time" />
      </div>
      <FollowStatusLine engine={engine} />
    </div>
  );
}

/**
 * Under the play toolbar while Follow the song is on: where the analysis
 * stands and, once the picture follows the song, its tempo and how many
 * settings follow it (see Engine.soundFamily). The count is drawn in each
 * frame, as the scene can change at any time.
 */
function FollowStatusLine({ engine }: { engine: Engine | null }) {
  useSyncExternalStore(subscribeFollow, followVersion);
  const line = useRef<HTMLParagraphElement>(null);
  const { enabled, status } = songFollow;
  useEffect(() => {
    if (!engine || status.state !== "ready") return;
    let frame = 0;
    const draw = () => {
      const count = PARAM_KEYS.filter((key) => engine.soundFamily(key) && engine.isShown(key)).length;
      const now = engine.songNow;
      const part = now && engine.script?.script.plan.parts.filter((candidate) => candidate.start <= now.time).pop();
      const live = now ? ` At ${time(now.time)}${part ? `, ${TIER_NAMES[part.tier]} part` : ""}: intensity ${Math.round(now.intensity * 100)}%, pace ×${now.pace.toFixed(2)}.` : "";
      const paths = tracks.list.map((track) => track.path);
      const analyzed = songFollow.analyzedCount(paths);
      const songs = paths.length > 1 ? ` ${analyzed} of ${paths.length} songs analyzed.` : "";
      const text = `Following the song, ${Math.round(status.tempo)} BPM.${live}${songs} ${count === 0
        ? "No setting follows it: click the speaker beside a setting, or use Enable All in the Audio panel."
        : `${count === 1 ? "1 setting follows" : `${count} settings follow`} it (lit waveform icons); the other ranges play at its pace.`}`;
      if (line.current && line.current.textContent !== text) line.current.textContent = text;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [engine, status]);
  if (!enabled || status.state === "off" || status.state === "error") return null;
  return <p ref={line} className="follow-status">{status.state === "analyzing" ? `Analyzing ${status.name}…` : ""}</p>;
}

/** The place of a loudness on the meter, from FLOOR_DB (0) to 0 dBFS (1). */
const meterPlace = (decibels: number) => Math.min(1, Math.max(0, (decibels - FLOOR_DB) / -FLOOR_DB));

/**
 * The music's level meter, which also sets the Master Threshold: the line
 * on it is the Threshold. While the mouse is over the meter, the line grows
 * into a handle with the value; a press or a drag anywhere on the meter
 * moves it there, and the arrow keys move it by 1 dB. The bar and the line
 * are drawn by PlaylistTransport's frame loop.
 */
function ThresholdMeter({ level, threshold }: { level: RefObject<HTMLElement | null>; threshold: RefObject<HTMLElement | null> }) {
  const thresholdDb = useSyncExternalStore((listener) => audioInput.subscribe(listener), () => audioInput.settings.thresholdDb);
  /* While the picture follows the song, the Threshold does not change the motion: the line is grayed out and takes no drags. */
  const following = useSyncExternalStore(subscribeFollow, () => songFollow.enabled);
  const set = (decibels: number) => audioInput.setThreshold(Math.round(Math.min(THRESHOLD_DB[1], Math.max(THRESHOLD_DB[0], decibels))));
  const at = (element: HTMLElement, clientX: number) => {
    const box = element.getBoundingClientRect();
    return FLOOR_DB + ((clientX - box.left) / box.width) * -FLOOR_DB;
  };
  return (
    <span
      className={`audio-meter-well playlist-level ${following ? "follow-off" : ""}`}
      role="slider"
      tabIndex={following ? -1 : 0}
      aria-disabled={following || undefined}
      aria-label="Master Threshold"
      aria-valuemin={THRESHOLD_DB[0]}
      aria-valuemax={THRESHOLD_DB[1]}
      aria-valuenow={thresholdDb}
      data-tip={following ? "The level of the music. Follow the song is on: the song's own analysis moves the picture, so the Master Threshold does not change the motion." : `The level of the music. The line is the Master Threshold (${thresholdDb} dB): drag it to change it.`}
      onPointerDown={(event) => {
        if (event.button !== 0 || following) return;
        const meter = event.currentTarget;
        meter.setPointerCapture(event.pointerId);
        set(at(meter, event.clientX));
        const move = (moveEvent: PointerEvent) => set(at(meter, moveEvent.clientX));
        const end = () => {
          meter.removeEventListener("pointermove", move);
          meter.removeEventListener("pointerup", end);
          meter.removeEventListener("lostpointercapture", end);
        };
        meter.addEventListener("pointermove", move);
        meter.addEventListener("pointerup", end);
        meter.addEventListener("lostpointercapture", end);
      }}
      onKeyDown={(event) => {
        const step = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
        if (step === undefined || following) return;
        /* Here, so the arrows do not also reach the app's shortcuts. */
        event.preventDefault();
        event.stopPropagation();
        set(thresholdDb + step);
      }}
    >
      <i ref={level as RefObject<HTMLElement>} />
      <b ref={threshold as RefObject<HTMLElement>} className="audio-meter-threshold" style={{ left: `${meterPlace(thresholdDb) * 100}%` }} />
      <span className="playlist-threshold-value">{thresholdDb} dB</span>
    </span>
  );
}

/**
 * The Files card's footer: how many files, and their play time. While the
 * lengths of new files are being read, the time ends in "…"; a file whose
 * length cannot be read is left out, and a "+" says so.
 */
function FilesFooter({ count }: { count: number }) {
  const { seconds, unknown } = tracks.playTime;
  const measuring = tracks.measuringLengths && unknown > 0;
  return (
    <div className="files-card-foot">
      <span>{count === 1 ? "1 file" : `${count} files`}</span>
      <span data-tip={unknown > 0 && !measuring ? `${unknown === 1 ? "1 file has" : `${unknown} files have`} no known length` : "The play time of every file"}>
        {formatPlayTime(seconds)}{measuring ? "…" : unknown > 0 ? "+" : ""}
      </span>
    </div>
  );
}

/**
 * The line at the Files column's right edge: a drag sets the column's
 * width (see panelLayout.ts), which a playlist keeps.
 */
function FilesSplitter() {
  return (
    <div
      className="files-splitter"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the Playlist column"
      data-tip="Drag to make the Playlist column wider or narrower"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        const startX = event.clientX;
        const startWidth = panelLayout.filesWidth;
        const move = (moveEvent: PointerEvent) => panelLayout.setFilesWidth(startWidth + moveEvent.clientX - startX);
        const end = () => {
          document.body.classList.remove("col-resizing");
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", end);
          window.removeEventListener("pointercancel", end);
        };
        document.body.classList.add("col-resizing");
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", end);
        window.addEventListener("pointercancel", end);
      }}
    />
  );
}
