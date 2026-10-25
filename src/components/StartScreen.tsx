import { FilePlus, FolderOpen } from "@phosphor-icons/react";

interface Props {
  /** The app's version, after the author ("" until it is known). */
  version: string;
  /** Starts a new, untitled project with one blank scene. */
  onNew: () => void;
  /** Opens the Open dialog, which lists Kaleido Sage projects. */
  onOpen: () => void;
}

/**
 * The first screen after start-up, styled like the Image Sage start screen.
 * It covers the work area until the user starts a new project, or opens a
 * Kaleido Sage project. The author and the version are on one quiet line
 * under the tagline, above the buttons. The credits for the models of Song
 * follow are in the About dialog.
 */
export function StartScreen({ version, onNew, onOpen }: Props) {
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
          <button className="button primary large" onClick={onNew}>
            <FilePlus size={19} weight="bold" /> New Project
          </button>
          <button className="button secondary large" onClick={onOpen}>
            <FolderOpen size={19} weight="bold" /> Open Project
          </button>
        </div>
      </div>
    </section>
  );
}
