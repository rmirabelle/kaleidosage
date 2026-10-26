import { useState } from "react";
import { createPortal } from "react-dom";
import { Cube, Eye, EyeSlash, FilmStrip, PencilSimple, Plus } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { SceneLayer } from "../engine/params";
import type { StackBlend } from "../engine/renderer";
import { ContextMenu } from "./ContextMenu";
import { Dropdown } from "./Dropdown";
import { Slider } from "./Slider";
import { useParamRows } from "./useParamRows";
import { help } from "../help/topics";

const BLENDS = [[0, "Normal"], [1, "Screen"], [2, "Add"], [3, "Multiply"]] as const;
const BLEND_NAMES: Record<StackBlend, string> = { 0: "Normal", 1: "Screen", 2: "Add", 3: "Multiply" };

/**
 * The Layers card (see docs/LAYERS.md), at the top of the left panel, laid
 * out as Photoshop's Layers panel. Its header has what belongs to the whole
 * scene: the scene's name and its Length. Under it, one strip sets the
 * selected layer's blend and opacity; then one row per layer, the top layer
 * first: the eye switch, a thumbnail and the name, and for a layer that is
 * not Normal at 100%, its blend and opacity in small text. A click selects
 * a row; a double-click or Rename in its right-click menu renames it.
 * "+ Layer" adds a kind of layer; the 3D Object and Image or Video kinds
 * come in the next steps. Each change goes to the engine at once, so the
 * canvas shows it, and is part of Undo and of the unsaved-change check.
 */
export function LayersCard({ engine, sceneName, thumbnails }: {
  engine: Engine;
  /** The scene's name (without .ksage), or "Untitled Scene": the card's title. */
  sceneName: string;
  /** Each kind's thumbnail (a data URL), if it has one: the Image layer shows slot A's. */
  thumbnails: Partial<Record<SceneLayer["kind"], string>>;
}) {
  const row = useParamRows(engine);
  const [layers, setLayers] = useState(() => engine.state.layers.map((layer) => ({ ...layer })));
  const [selected, setSelected] = useState<SceneLayer["kind"]>(() => engine.state.layers.find((layer) => layer.kind === "image")?.kind ?? "image");
  const [renaming, setRenaming] = useState<{ kind: SceneLayer["kind"]; value: string } | null>(null);
  const [menu, setMenu] = useState<{ left: number; top: number; kind: SceneLayer["kind"] | null } | null>(null);
  const layer = layers.find((candidate) => candidate.kind === selected) ?? layers[0];

  /** Changes one layer in the engine and in the card. */
  const change = (kind: SceneLayer["kind"], next: Partial<SceneLayer>) => {
    const updated = layers.map((candidate) => candidate.kind === kind ? { ...candidate, ...next } : candidate);
    engine.state.layers = updated.map((candidate) => ({ ...candidate }));
    engine.wake();
    setLayers(updated);
  };
  const commitRename = () => {
    if (!renaming) return;
    const name = renaming.value.trim();
    if (name) change(renaming.kind, { name: name.slice(0, 60) });
    setRenaming(null);
  };

  return (
    <section className="panel-card layers-card" {...help("layers")}>
      <div className="panel-header-bar layers-header">
        <h2 className="side-panel-title source-title" data-tip={sceneName}><span>{sceneName}</span></h2>
        <button
          className="panel-button layers-add"
          data-tip="Add a layer"
          aria-label="Add a layer"
          aria-haspopup="menu"
          onClick={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            setMenu(menu ? null : { left: box.left, top: box.bottom + 4, kind: null });
          }}
        >
          <Plus size={14} weight="bold" /> Layer
        </button>
      </div>
      <div className="panel-root-row source-length">
        {row("cycle")}
      </div>
      {layer && (
        <div className="layers-strip">
          <Dropdown
            value={layer.blend}
            options={BLENDS}
            label={`How ${layer.name} goes over the layers under it`}
            onChange={(blend) => change(layer.kind, { blend })}
          />
          <div className="layers-opacity">
            <Slider
              min={0}
              max={1}
              step={0.01}
              value={layer.opacity}
              label={`${layer.name} opacity`}
              onChange={(opacity) => change(layer.kind, { opacity })}
            />
          </div>
          <span className="layers-opacity-value">{Math.round(layer.opacity * 100)}%</span>
        </div>
      )}
      <ol className="layers-list" aria-label="Layers">
        {[...layers].reverse().map((item) => {
          const active = item.kind === layer?.kind;
          const plain = item.blend === 0 && item.opacity >= 1;
          return (
            <li
              key={item.kind}
              className={`layers-row ${active ? "active" : ""} ${item.visible ? "" : "hidden"}`}
              aria-selected={active}
              onPointerDown={(event) => { if (event.button === 0) setSelected(item.kind); }}
              onDoubleClick={() => setRenaming({ kind: item.kind, value: item.name })}
              onContextMenu={(event) => {
                event.preventDefault();
                setSelected(item.kind);
                setMenu({ left: event.clientX, top: event.clientY, kind: item.kind });
              }}
            >
              <button
                className="layers-eye"
                onPointerDown={(event) => event.stopPropagation()}
                onClick={() => change(item.kind, { visible: !item.visible })}
                data-tip={item.visible ? "Hide this layer" : "Show this layer"}
                aria-label={item.visible ? `Hide ${item.name}` : `Show ${item.name}`}
                aria-pressed={item.visible}
              >
                {item.visible ? <Eye size={14} /> : <EyeSlash size={14} />}
              </button>
              <span className="layers-thumb" style={thumbnails[item.kind] ? { backgroundImage: `url(${thumbnails[item.kind]})` } : undefined} />
              {renaming?.kind === item.kind ? (
                <input
                  className="scene-list-rename"
                  value={renaming.value}
                  autoFocus
                  spellCheck={false}
                  aria-label={`New name for ${item.name}`}
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setRenaming({ kind: item.kind, value: event.target.value })}
                  onPointerDown={(event) => event.stopPropagation()}
                  onKeyDown={(event) => {
                    /* Here, so the keys do not also reach the app's shortcuts. */
                    event.stopPropagation();
                    if (event.key === "Enter") commitRename();
                    if (event.key === "Escape") setRenaming(null);
                  }}
                  onBlur={commitRename}
                />
              ) : (
                <span className="layers-name">{item.name}</span>
              )}
              {!plain && <span className="layers-mode">{BLEND_NAMES[item.blend]} {Math.round(item.opacity * 100)}%</span>}
            </li>
          );
        })}
      </ol>
      {menu && createPortal(
        <ContextMenu
          position={{ left: menu.left, top: menu.top }}
          onClose={() => setMenu(null)}
          items={menu.kind
            ? [{ label: "Rename…", icon: <PencilSimple size={14} />, run: () => { const item = layers.find((candidate) => candidate.kind === menu.kind); if (item) setRenaming({ kind: item.kind, value: item.name }); } }]
            : [
              { label: "3D Object (coming soon)", icon: <Cube size={14} />, disabled: true, run: () => {} },
              { label: "Image or Video (coming soon)", icon: <FilmStrip size={14} />, disabled: true, run: () => {} }
            ]}
        />,
        document.body
      )}
    </section>
  );
}
