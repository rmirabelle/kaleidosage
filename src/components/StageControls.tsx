import { ArrowsOut, Screencast, VirtualReality } from "@phosphor-icons/react";

/**
 * The buttons over the picture, at the top right: VR (only while a headset
 * is ready, see vr.ts), Cast (only while there is another screen, see
 * cast.ts) and Full screen (Performance is in the View menu).
 * They show while the mouse is over the picture (see .stage-controls). The
 * scene's play controls are in a toolbar at the bottom of the left panel,
 * under the FX card (see SceneTransport), and the music's at the bottom of
 * the Playlist card.
 */
export function StageControls({ onFullscreen, onVr, inVr, onCast, casting }: {
  onFullscreen: () => void;
  onVr: (() => void) | null;
  inVr: boolean;
  onCast: (() => void) | null;
  casting: boolean;
}) {
  return (
    <nav className="stage-controls view" aria-label="View controls">
      <div className="panel-buttons">
        {onVr && (
          <button className={`panel-button icon ${inVr ? "active" : ""}`} onClick={onVr} data-tip={inVr ? "Exit VR `Esc`" : "Show in the VR headset"} aria-label={inVr ? "Exit VR" : "Enter VR"}>
            <VirtualReality size={16} weight="bold" />
          </button>
        )}
        {onCast && (
          <button className={`panel-button icon ${casting ? "active" : ""}`} onClick={onCast} data-tip={casting ? "Stop the cast `c`" : "Cast: show the picture full screen on the other screen `c`"} aria-label={casting ? "Stop Cast" : "Cast"}>
            <Screencast size={16} weight="bold" />
          </button>
        )}
        <button className="panel-button icon" onClick={onFullscreen} data-tip="Full screen `f`" aria-label="Full screen">
          <ArrowsOut size={16} weight="bold" />
        </button>
      </div>
    </nav>
  );
}
