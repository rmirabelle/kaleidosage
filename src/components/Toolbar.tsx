import { ColorDisk, ColorFullScreen, ColorGauge } from "./ToolbarIcons";

interface Props {
  onSaveScene: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  onFullscreen: () => void;
}

/**
 * The app toolbar under the menu bar, styled like the Designer toolbar:
 * button groups with color icons, Save Scene at the left, the view buttons
 * at the right. Scenes open from the start screen or the File menu; images
 * are picked in the Source panel.
 */
export function Toolbar(props: Props) {
  return (
    <nav className="toolbar">
      <div className="panel-buttons">
        <button className="panel-button" onClick={props.onSaveScene} title="Save the scene (Ctrl+S)"><ColorDisk size={16} /> Save Scene</button>
      </div>
      <div className="toolbar-spacer" />
      <div className="panel-buttons">
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
