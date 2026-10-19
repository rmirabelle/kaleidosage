import { FolderOpen, MusicNotes, Plus } from "@phosphor-icons/react";

interface Props {
  onNewScene: () => void;
  onOpenScene: () => void;
  onOpenPlaylist: () => void;
}

/**
 * The first screen after start-up, styled like the Image Sage start screen.
 * It covers the work area until the user starts a new scene, or opens a
 * scene or a playlist.
 */
export function StartScreen({ onNewScene, onOpenScene, onOpenPlaylist }: Props) {
  return (
    <section className="start-screen">
      <div className="start-above">
        <div className="start-icon"><div className="start-glow" /><img src="/app-icon.png" alt="" /></div>
        <div className="start-name">Kaleido Sage</div>
      </div>
      <h1>Live Visual FX Playground</h1>
      <div className="start-below">
        <p className="start-copy">
          Design mind-bending infinite visuals in seconds.<br />
          Sync your visuals to music and tweak live via MIDI.
        </p>
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
