import { FolderOpen, Plus } from "@phosphor-icons/react";

interface Props {
  onNewScene: () => void;
  onOpenScene: () => void;
}

/**
 * The first screen after start-up, styled like the Image Sage start screen.
 * It covers the work area until the user starts a new scene or opens one.
 */
export function StartScreen({ onNewScene, onOpenScene }: Props) {
  return (
    <section className="start-screen">
      <div className="start-above">
        <div className="start-icon"><div className="start-glow" /><img src="/app-icon.png" alt="" /></div>
      </div>
      <h1>Any image or video, in endless motion.</h1>
      <div className="start-below">
        <p className="start-copy">
          Turn any image into a moving kaleidoscope.<br />
          Add motion blur, drift, and color.<br />
          Play it full screen, and save scenes and snapshots.
        </p>
        <div className="start-actions">
          <button className="button primary large" onClick={onNewScene}>
            <Plus size={19} weight="bold" /> New Scene
          </button>
          <button className="button secondary large" onClick={onOpenScene}>
            <FolderOpen size={19} weight="bold" /> Open Scene
          </button>
        </div>
      </div>
    </section>
  );
}
