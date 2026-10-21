import { MediaIcon } from "./MediaIcon";
import { ArrowsOut } from "@phosphor-icons/react";
import { HelpButton } from "./HelpButton";
import { help } from "../help/topics";

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
 * mouse is over the picture (see .stage-controls). They run the scene only;
 * the music has its own controls at the bottom of the Playlist card (see
 * FilesCard). Scenes open and save from the start screen or the Scene menu;
 * images are picked in the Source panel.
 */
export function StageControls(props: Props) {
  return (
    <>
      <nav className="stage-controls play" aria-label="Play controls" {...help("play")}>
        <div className="panel-buttons">
          <button
            className="panel-button icon"
            onClick={props.onStop}
            disabled={props.paused}
            data-tip="Stop `Shift+Space`: pause the scene, and go back to its start"
            aria-keyshortcuts="Shift+Space"
            aria-label="Stop"
          >
            <MediaIcon kind="stop" size={17} />
          </button>
          <button
            className="panel-button icon"
            onClick={props.onTogglePause}
            data-tip={props.paused ? "Play the scene `Space`" : "Pause the scene `Space`"}
            aria-label={props.paused ? "Play" : "Pause"}
          >
            {props.paused ? <MediaIcon kind="play" size={17} /> : <MediaIcon kind="pause" size={17} />}
          </button>
        </div>
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
