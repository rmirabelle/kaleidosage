import { MediaIcon } from "./MediaIcon";
import { ColorDisk, ColorFullScreen, ColorGauge } from "./ToolbarIcons";

interface Props {
  paused: boolean;
  onTogglePause: () => void;
  /** Pauses and goes back to the start; off while paused. */
  onStop: () => void;
  onSaveScene: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  onFullscreen: () => void;
}

/**
 * The app toolbar under the menu bar, styled like the Designer toolbar:
 * button groups with color icons, Save Scene at the left, Stop and Play or
 * Pause in the middle, the view buttons at the right. Scenes open from the start screen or the File menu; images
 * are picked in the Source panel.
 */
export function Toolbar(props: Props) {
  return (
    <nav className="toolbar">
      <div className="panel-buttons">
        <button className="panel-button" onClick={props.onSaveScene} title="Save the scene (Ctrl+S)"><ColorDisk size={16} /> Save Scene</button>
      </div>
      <div className="panel-buttons toolbar-center">
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
      <div className="panel-buttons toolbar-end">
        <button
          className={`panel-button icon ${props.statsOpen ? "active" : ""}`}
          onClick={props.onToggleStats}
          title="Performance: frame rate and GPU time (P)"
          aria-label="Performance"
          aria-pressed={props.statsOpen}
        >
          <ColorGauge size={17} />
        </button>
        <button className="panel-button icon" onClick={props.onFullscreen} title="Full screen (F)" aria-label="Full screen">
          <ColorFullScreen size={16} />
        </button>
      </div>
    </nav>
  );
}
