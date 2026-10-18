import { MediaIcon } from "./MediaIcon";
import { ArrowsOut } from "@phosphor-icons/react";

interface Props {
  paused: boolean;
  onTogglePause: () => void;
  /** Pauses and goes back to the start; off while paused. */
  onStop: () => void;
  onFullscreen: () => void;
}

/**
 * The bars over the picture: Stop and Play or Pause at the bottom center,
 * and Full screen at the top right (Performance is in the View menu). They show while the
 * mouse is over the picture (see .stage-controls). Scenes open and save from the
 * start screen or the File menu; images are picked in the Source panel.
 */
export function StageControls(props: Props) {
  return (
    <>
      <nav className="stage-controls play" aria-label="Play controls">
        <div className="panel-buttons">
          <button
            className="panel-button icon"
            onClick={props.onStop}
            disabled={props.paused}
            title="Stop (Shift+Space): pause, and go back to the start"
            aria-keyshortcuts="Shift+Space"
            aria-label="Stop"
          >
            <MediaIcon kind="stop" size={17} />
          </button>
          <button
            className="panel-button icon"
            onClick={props.onTogglePause}
            title={props.paused ? "Play (Space)" : "Pause (Space)"}
            aria-label={props.paused ? "Play" : "Pause"}
          >
            {props.paused ? <MediaIcon kind="play" size={17} /> : <MediaIcon kind="pause" size={17} />}
          </button>
        </div>
      </nav>
      <nav className="stage-controls view" aria-label="View controls">
        <div className="panel-buttons">
          <button className="panel-button icon" onClick={props.onFullscreen} title="Full screen (F)" aria-label="Full screen">
            <ArrowsOut size={16} weight="bold" />
          </button>
        </div>
      </nav>
    </>
  );
}
