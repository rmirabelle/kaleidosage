import { useEffect, useRef } from "react";
import { MediaIcon } from "./MediaIcon";
import { ArrowsOut, SkipBack, SkipForward } from "@phosphor-icons/react";
import { tracks } from "../lib/tracks";
import { HelpButton } from "./HelpButton";
import { help } from "../help/topics";

interface Props {
  paused: boolean;
  onTogglePause: () => void;
  /** Pauses and goes back to the start; off while paused. */
  onStop: () => void;
  onFullscreen: () => void;
  /** True while the tracks are the input: the controls then run the show (see docs/AUDIO.md, part 7). */
  tracks: boolean;
}

const time = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/**
 * The track under the play controls while the tracks run the show: its
 * name, the time, and a bar to seek in it. The bar and the time follow the
 * music in each animation frame, not through React state; a drag on the
 * bar seeks.
 */
function TrackBar() {
  const bar = useRef<HTMLInputElement>(null);
  const clock = useRef<HTMLSpanElement>(null);
  const name = useRef<HTMLSpanElement>(null);
  const dragging = useRef(false);
  useEffect(() => {
    let frame = 0;
    const draw = () => {
      const duration = tracks.duration;
      if (bar.current && !dragging.current) {
        bar.current.max = String(duration || 1);
        bar.current.value = String(tracks.position);
      }
      const text = duration ? `${time(tracks.position)} / ${time(duration)}` : "";
      if (clock.current && clock.current.textContent !== text) clock.current.textContent = text;
      const title = tracks.current?.name ?? "No files yet";
      if (name.current && name.current.textContent !== title) name.current.textContent = title;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, []);
  return (
    <div className="stage-track">
      <div className="stage-track-text">
        <span ref={name} className="stage-track-name" />
        <span ref={clock} className="stage-track-time" />
      </div>
      <input
        ref={bar}
        type="range"
        className="stage-track-bar"
        min={0}
        step={0.1}
        aria-label="Position in the file"
        onPointerDown={() => { dragging.current = true; }}
        onPointerUp={() => { dragging.current = false; }}
        onChange={(event) => tracks.seek(Number(event.target.value))}
      />
    </div>
  );
}

/**
 * The bars over the picture: Stop and Play or Pause at the bottom center,
 * and Full screen at the top right (Performance is in the View menu). They show while the
 * mouse is over the picture (see .stage-controls). While the tracks are
 * the input, Previous and Next go to another track, Play and Pause run the
 * music and the animation together, and the track bar shows where the
 * music is. Scenes open and save from the start screen or the File menu;
 * images are picked in the Source panel.
 */
export function StageControls(props: Props) {
  return (
    <>
      <nav className={`stage-controls play ${props.tracks ? "with-track" : ""}`} aria-label="Play controls" {...help("play")}>
        <div className="panel-buttons">
          {props.tracks && (
            <button className="panel-button icon" onClick={() => tracks.previous()} data-tip="Previous file (back to the start of this file after 3 seconds)" aria-label="Previous file">
              <SkipBack size={16} weight="fill" />
            </button>
          )}
          <button
            className="panel-button icon"
            onClick={props.onStop}
            disabled={props.paused}
            data-tip={props.tracks ? "Stop `Shift+Space`: pause, and go back to the start of the file and the scene" : "Stop `Shift+Space`: pause, and go back to the start"}
            aria-keyshortcuts="Shift+Space"
            aria-label="Stop"
          >
            <MediaIcon kind="stop" size={17} />
          </button>
          <button
            className="panel-button icon"
            onClick={props.onTogglePause}
            data-tip={props.paused ? "Play `Space`" : "Pause `Space`"}
            aria-label={props.paused ? "Play" : "Pause"}
          >
            {props.paused ? <MediaIcon kind="play" size={17} /> : <MediaIcon kind="pause" size={17} />}
          </button>
          {props.tracks && (
            <button className="panel-button icon" onClick={() => tracks.next()} data-tip="Next file" aria-label="Next file">
              <SkipForward size={16} weight="fill" />
            </button>
          )}
        </div>
        {props.tracks && <TrackBar />}
        <HelpButton topic="play" />
      </nav>
      <nav className="stage-controls view" aria-label="View controls">
        <div className="panel-buttons">
          <button className="panel-button icon" onClick={props.onFullscreen} data-tip="Full screen `f`" aria-label="Full screen">
            <ArrowsOut size={16} weight="bold" />
          </button>
        </div>
      </nav>
    </>
  );
}
