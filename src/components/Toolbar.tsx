import { ArrowsOut, FilmSlate, FloppyDisk, Gauge } from "@phosphor-icons/react";

interface Props {
  onOpenScene: () => void;
  onSaveScene: () => void;
  statsOpen: boolean;
  onToggleStats: () => void;
  onFullscreen: () => void;
}

/**
 * The app toolbar under the menu bar: Open Scene and Save Scene at the left,
 * view buttons at the right. Images are picked in the Source panel.
 */
export function Toolbar(props: Props) {
  return (
    <nav className="toolbar">
      <button className="toolbar-button" onClick={props.onOpenScene} title="Open a scene (Ctrl+O)"><FilmSlate size={15} /> Open Scene</button>
      <button className="toolbar-button" onClick={props.onSaveScene} title="Save the scene (Ctrl+S)"><FloppyDisk size={15} /> Save Scene</button>
      <div className="toolbar-spacer" />
      <button
        className={`toolbar-button icon ${props.statsOpen ? "active" : ""}`}
        onClick={props.onToggleStats}
        title="Performance: frame rate and GPU time (P)"
        aria-label="Performance"
        aria-pressed={props.statsOpen}
      >
        <Gauge size={16} />
      </button>
      <button className="toolbar-button icon" onClick={props.onFullscreen} title="Full screen (F)" aria-label="Full screen"><ArrowsOut size={16} /></button>
    </nav>
  );
}
