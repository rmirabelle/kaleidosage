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
 * under the tagline, above the buttons. At the bottom, in small quiet text,
 * the models that Song follow uses are credited as their licenses ask
 * (see src-tauri/src/song_analysis.rs and song_sections.rs): LinkSeg's
 * weights are CC-BY 4.0, Beat This! is MIT.
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
      <div className="start-model-credits selectable">
        Song follow uses Beat This! by F. Foscarin, J. Schlüter and G. Widmer (ISMIR 2024, MIT license; Rust port by danigb) and LinkSeg by M. Buisson, B. McFee and S. Essid, “Using Pairwise Link Prediction and Graph Attention Networks for Music Structure Analysis” (ISMIR 2024; model weights under CC-BY 4.0, creativecommons.org/licenses/by/4.0; ONNX port by linkseg-web, MIT license).
      </div>
    </section>
  );
}
