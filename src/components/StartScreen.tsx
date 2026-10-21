import { FolderOpen, MusicNotes, Plus } from "@phosphor-icons/react";

interface Props {
  /** The app's version, after the author ("" until it is known). */
  version: string;
  onNewScene: () => void;
  onOpenScene: () => void;
  onOpenPlaylist: () => void;
}

/**
 * The first screen after start-up, styled like the Image Sage start screen.
 * It covers the work area until the user starts a new scene, or opens a
 * scene or a playlist. The author and the version are on one quiet line
 * under the tagline, above the buttons.
 */
export function StartScreen({ version, onNewScene, onOpenScene, onOpenPlaylist }: Props) {
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
          <button className="button secondary large" onClick={onOpenScene}>
            <FolderOpen size={19} weight="bold" /> Open Scene
          </button>
          <button className="button secondary large" onClick={onOpenPlaylist}>
            <MusicNotes size={19} weight="bold" /> Open Playlist
          </button>
        </div>
      </div>
    </section>
  );
}
