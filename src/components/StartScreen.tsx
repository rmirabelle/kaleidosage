import { FolderOpen, Plus } from "@phosphor-icons/react";

interface Props {
  /** The app's version, after the author ("" until it is known). */
  version: string;
  onNewScene: () => void;
  /** Opens the Open dialog, which lists scenes and playlists. */
  onOpen: () => void;
}

/**
 * The first screen after start-up, styled like the Image Sage start screen.
 * It covers the work area until the user starts a new scene, or opens a
 * scene or a playlist. The author and the version are on one quiet line
 * under the tagline, above the buttons. The credits for the models of Song
 * follow are in the About dialog.
 */
export function StartScreen({ version, onNewScene, onOpen }: Props) {
  return (
    <section className="start-screen">
      <div className="start-above">
        <div className="start-icon"><div className="start-glow" /><img src="/kaleido-sage-logo.png" alt="" /></div>
        <div className="start-name">Kaleido Sage</div>
      </div>
      <h1>Visual FX Playground</h1>
      <div className="start-below">
        <div className="start-credits">
          <span>by Robert Mirabelle</span>
          {version && <span>Version {version}</span>}
        </div>
        <div className="start-actions">
          <button className="button primary large" onClick={onNewScene}>
            <Plus size={19} weight="bold" /> New Scene
          </button>
          <button className="button secondary large" onClick={onOpen}>
            <FolderOpen size={19} weight="bold" /> Open Scene/Playlist
          </button>
        </div>
      </div>
    </section>
  );
}
