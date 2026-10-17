import { useState, type ReactNode } from "react";
import { CircleHalfTilt, Sun } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { BlendMode } from "../engine/renderer";
import { useParamRows } from "./useParamRows";
import { SourceImages, type SourceImagesProps } from "./SourceImages";

/** How the picture fades from A to B: an even crossfade, or B appearing by brightness. */
const BLEND_MODES: readonly (readonly [BlendMode, string, ReactNode])[] = [
  [0, "Even crossfade", <CircleHalfTilt size={14} />],
  [1, "Dissolve by brightness", <Sun size={14} />]
];

/**
 * The Source section, at the top of the left panel: images A and B side by
 * side, and, once B is loaded, the Crossfade slider between them. The
 * blend only has an effect with a second image, so it shows only then. How
 * it fades (evenly, or by brightness) is in the slider's right-click menu,
 * to save the room a menu row took. It is always open.
 */
export function SourcePanel({ engine, ...sources }: SourceImagesProps & { engine: Engine }) {
  const row = useParamRows(engine);
  const [blendMode, setBlendMode] = useState<BlendMode>(engine.state.blendMode);
  return (
    <section className="panel-card source-section">
      <div className="panel-header-bar">
        <h2 className="side-panel-title">Source</h2>
      </div>
      <div className="source-well">
        <SourceImages {...sources} />
        {sources.images[1] && row.with("imageBlend", {
          menu: BLEND_MODES.map(([mode, label, icon]) => ({
            label,
            icon,
            selected: mode === blendMode,
            run: () => {
              engine.state.blendMode = mode;
              setBlendMode(mode);
            }
          }))
        })}
      </div>
    </section>
  );
}
