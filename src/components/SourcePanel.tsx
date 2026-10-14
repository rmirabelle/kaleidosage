import type { Engine } from "../engine/engine";
import { ModeSelect } from "./ControlPanel";
import { useParamRows } from "./useParamRows";
import { SourceImages, type SourceImagesProps } from "./SourceImages";

const BLEND_MODES = [[0, "Crossfade"], [1, "Dissolve by brightness"]] as const;

/**
 * The Source panel, docked at the left: images A and B, and, once B is
 * loaded, how the picture fades between them. The blend only has an effect
 * with a second image, so it shows only then.
 */
export function SourcePanel({ engine, ...sources }: SourceImagesProps & { engine: Engine }) {
  const row = useParamRows(engine);
  return (
    <aside className="side-panel source-panel">
      <h2 className="side-panel-title">Source</h2>
      <div className="source-well">
        <SourceImages {...sources} />
        {sources.images[1] && (
          <>
            <ModeSelect engine={engine} stateKey="blendMode" options={BLEND_MODES} />
            {row("imageBlend")}
          </>
        )}
      </div>
    </aside>
  );
}
