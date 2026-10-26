import { useState } from "react";
import { createPortal } from "react-dom";
import { Cube, Eye, EyeSlash, FilmStrip, Image as ImageIcon, PencilSimple, Plus, Trash } from "@phosphor-icons/react";
import type { Engine } from "../engine/engine";
import type { SceneLayer } from "../engine/params";
import type { LayerKind, StackBlend } from "../engine/renderer";
import { ContextMenu } from "./ContextMenu";
import { Dropdown } from "./Dropdown";
import { Slider } from "./Slider";
import { useDragReorder } from "./useDragReorder";
import { useParamRows } from "./useParamRows";
import { help } from "../help/topics";

const BLENDS = [[0, "Normal"], [1, "Screen"], [2, "Add"], [3, "Multiply"]] as const;
const BLEND_NAMES: Record<StackBlend, string> = { 0: "Normal", 1: "Screen", 2: "Add", 3: "Multiply" };
/** The kinds "+ Layer" adds, in its menu's order, with each kind's name and icon. */
const KINDS: readonly (readonly [LayerKind, string])[] = [["solid", "3D Object"], ["media", "Image or Video"], ["image", "Image"]];
const KIND_ICONS: Record<LayerKind, typeof Cube> = { image: ImageIcon, solid: Cube, media: FilmStrip };

/**
 * The Layers card (see docs/LAYERS.md), at the top of the left panel, laid
 * out as Photoshop's Layers panel. Its header has what belongs to the whole
 * scene: the scene's name and its Length. Under it, one strip sets the
 * selected layer's blend and opacity; then one row per layer, the top layer
 * first: the eye switch, a thumbnail and the name, and for a layer that is
 * not Normal at 100%, its blend and opacity in small text. A click selects
 * a row (the Source and FX cards show that layer); a drag moves it; a
 * double-click or Rename in its right-click menu renames it, and Delete
 * takes it out. "+ Layer" adds a kind that the scene does not have yet. An
 * effect's grip dropped on a row moves the effect to that layer (see
 * ControlPanel). The panel owns the layers; each change goes to it.
 */
export function LayersCard({ engine, sceneName, thumbnails, layers, selected, onSelect, onChange, onAdd, onDelete }: {
  engine: Engine;
  /** The scene's name (without .ksage), or "Untitled Scene": the card's title. */
  sceneName: string;
  /** Each kind's thumbnail (a data URL), if it has one. */
  thumbnails: Partial<Record<LayerKind, string>>;
  /** The stack, the bottom layer first. */
  layers: SceneLayer[];
  selected: LayerKind;
  onSelect: (kind: LayerKind) => void;
  onChange: (layers: SceneLayer[]) => void;
  onAdd: (kind: LayerKind) => void;
  onDelete: (kind: LayerKind) => void;
}) {
  const row = useParamRows(engine);
  const [renaming, setRenaming] = useState<{ kind: LayerKind; value: string } | null>(null);
  const [menu, setMenu] = useState<{ left: number; top: number; kind: LayerKind | null } | null>(null);
  const layer = layers.find((candidate) => candidate.kind === selected) ?? layers[0];
  /* The rows show the top layer first; the stack keeps the bottom one first. */
  const shownOrder = [...layers].reverse().map((item) => item.kind);
  const drag = useDragReorder(shownOrder, (order) => {
    const byKind = new Map(layers.map((item) => [item.kind, item]));
    onChange([...order].reverse().flatMap((kind) => byKind.get(kind) ?? []));
  });

  const change = (kind: LayerKind, next: Partial<SceneLayer>) => onChange(layers.map((candidate) => candidate.kind === kind ? { ...candidate, ...next } : candidate));
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
      <ol ref={drag.listRef} className="layers-list" aria-label="Layers">
        {[...layers].reverse().map((item) => {
          const active = item.kind === layer?.kind;
          const plain = item.blend === 0 && item.opacity >= 1;
          const Icon = KIND_ICONS[item.kind];
          return (
            <li
              key={item.kind}
              data-key={item.kind}
              data-layer-kind={item.kind}
              className={`layers-row ${active ? "active" : ""} ${item.visible ? "" : "hidden"} ${drag.dragging === item.kind ? "dragging" : ""}`}
              aria-selected={active}
              onPointerDown={(event) => {
                if (event.button !== 0) return;
                onSelect(item.kind);
                drag.start(item.kind)(event);
              }}
              onDoubleClick={() => setRenaming({ kind: item.kind, value: item.name })}
              onContextMenu={(event) => {
                event.preventDefault();
                onSelect(item.kind);
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
              <span className="layers-thumb" style={thumbnails[item.kind] ? { backgroundImage: `url(${thumbnails[item.kind]})` } : undefined}>
                {!thumbnails[item.kind] && <Icon size={13} />}
              </span>
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
            ? [
              { label: "Rename…", icon: <PencilSimple size={14} />, run: () => { const item = layers.find((candidate) => candidate.kind === menu.kind); if (item) setRenaming({ kind: item.kind, value: item.name }); } },
              { label: menu.kind === "image" ? "Delete Layer (the Image layer stays)" : "Delete Layer", icon: <Trash size={14} />, disabled: menu.kind === "image", run: () => menu.kind && onDelete(menu.kind) }
            ]
            : KINDS.map(([kind, name]) => {
              const Icon = KIND_ICONS[kind];
              const there = layers.some((candidate) => candidate.kind === kind);
              return { label: there ? `${name} (in the scene)` : name, icon: <Icon size={14} />, disabled: there, run: () => onAdd(kind) };
            })}
        />,
        document.body
      )}
    </section>
  );
}
