import { useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { CircleHalfTilt, FlipHorizontal, GridFour, MagicWand, Sun } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { BlendMode, Tiling } from "../engine/renderer";
import { ContextMenu } from "./ContextMenu";
import { TilingIcon } from "./TilingIcon";
import { useParamRows } from "./useParamRows";
import { SourceImages, type SourceImagesProps } from "./SourceImages";
import { help } from "../help/topics";
import { HelpButton } from "./HelpButton";

/** How the picture fades from A to B: an even crossfade, or B appearing by brightness. */
const BLEND_MODES: readonly (readonly [BlendMode, string, ReactNode])[] = [
  [0, "Even crossfade", <CircleHalfTilt size={14} />],
  [1, "Dissolve by brightness", <Sun size={14} />]
];

/** How the images go on past their edges; auto repeats a repeating test pattern and mirrors anything else. */
const TILINGS: readonly (readonly [Tiling, string, ReactNode])[] = [
  [0, "Auto", <MagicWand size={14} />],
  [1, "Mirror", <FlipHorizontal size={14} />],
  [2, "Repeat", <GridFour size={14} />]
];

/**
 * The Source section, at the top of the left panel: images A and B side by
 * side, and, once B is loaded, the Crossfade slider between them. The
 * blend only has an effect with a second image, so it shows only then. How
 * it fades (evenly, or by brightness) is in the slider's right-click menu,
 * to save the room a menu row took. The tile button in the title bar sets
 * how the images go on past their edges. It is always open.
 */
export function SourcePanel({ engine, ...sources }: SourceImagesProps & { engine: Engine }) {
  const row = useParamRows(engine);
  const [blendMode, setBlendMode] = useState<BlendMode>(engine.state.blendMode);
  const [tiling, setTiling] = useState<Tiling>(engine.state.tiling);
  const [tilingMenu, setTilingMenu] = useState<{ left: number; top: number } | null>(null);
  const tilingName = TILINGS.find(([mode]) => mode === tiling)?.[1] ?? "Auto";
  return (
    <section className="panel-card source-section" {...help("source")}>
      <div className="panel-header-bar">
        <h2 className="side-panel-title">Source</h2>
        <HelpButton topic="source" />
        <button
          className={`source-tiling ${tilingMenu ? "open" : ""}`}
          data-tip={`Tiling: ${tilingName}. How the images go on past their edges.`}
          aria-label={`Tiling: ${tilingName}`}
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setTilingMenu(tilingMenu ? null : { left: box.left, top: box.bottom + 4 });
          }}
        >
          <TilingIcon size={18} />
        </button>
        {tilingMenu && createPortal(
          <ContextMenu
            position={tilingMenu}
            onClose={() => setTilingMenu(null)}
            items={TILINGS.map(([mode, label, icon]) => ({
              label,
              icon,
              selected: mode === tiling,
              run: () => {
                engine.state.tiling = mode;
                setTiling(mode);
              }
            }))}
          />,
          document.body
        )}
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
