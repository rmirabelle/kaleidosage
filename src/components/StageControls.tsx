import { ArrowsOut } from "@phosphor-icons/react";

/**
 * The button over the picture: Full screen at the top right (Performance is
 * in the View menu). It shows while the mouse is over the picture (see
 * .stage-controls). The scene's play controls are in a toolbar at the
 * bottom of the left panel, under the FX card (see SceneTransport), and the music's at the
 * bottom of the Playlist card.
 */
export function StageControls({ onFullscreen }: { onFullscreen: () => void }) {
  return (
    <nav className="stage-controls view" aria-label="View controls">
      <div className="panel-buttons">
        <button className="panel-button icon" onClick={onFullscreen} data-tip="Full screen `f`" aria-label="Full screen">
          <ArrowsOut size={16} weight="bold" />
        </button>
      </div>
    </nav>
  );
}
