import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { PencilSimple, Trash } from "@phosphor-icons/react";
import { ContextMenu } from "./ContextMenu";
import { help } from "../help/topics";
import type { DocumentTabInfo } from "./DocumentTabs";
import { useDragReorder } from "./useDragReorder";
import { useCtrlHeld } from "./useCtrlHeld";
import { songFollow } from "../lib/songFollow";

const subscribeFollow = (listener: () => void) => songFollow.subscribe(listener);
/** True while a Song Map slice is selected (see songFollow.selection): a Ctrl+click on a scene then picks it for that slice. */
const sliceSelected = () => songFollow.enabled && songFollow.selection !== null;

interface Props {
  tabs: DocumentTabInfo[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  /** The scenes' ids in a new order, after a drag. */
  onReorder: (ids: number[]) => void;
  /** Gives the scene a new name (without the .ksage), from Rename in its right-click menu. */
  onRename: (id: number, name: string) => void;
  /** A Ctrl+click on a scene while a Song Map slice is selected: the slice plays this scene (see songFollow.pickScene). */
  onPick: (id: number) => void;
}

/**
 * The open scenes as a list, in the first column of the left side, before
 * the Source and FX column (see .sidebar): in Files mode it takes the place
 * of the tabs, which would fill many rows for a long show. The scenes play
 * from the top down. A press selects a scene; a drag moves it to another
 * place (see useDragReorder); the trash button or a middle click takes it out of the
 * file. A right-click opens a menu: Rename (the name turns into a text box:
 * Enter keeps the new name, Esc does not) and Remove Scene. While a slice of the
 * Song Map is selected, Ctrl+click picks a scene for it and shows that
 * scene, as a plain click does: as long as Ctrl
 * is held, the list shows a pick cursor, and the scene under the pointer
 * lights up in the same color as the selected slice. Its card has a title
 * bar like the Source card's.
 */
export function SceneList({ tabs, activeId, onSelect, onClose, onReorder, onRename, onPick }: Props) {
  const drag = useDragReorder(tabs.map((tab) => tab.id), onReorder);
  const canPick = useSyncExternalStore(subscribeFollow, sliceSelected);
  const picking = useCtrlHeld() && canPick;
  const [menu, setMenu] = useState<{ id: number; left: number; top: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(null);
  const baseName = (tab: Props["tabs"][number]) => tab.fileName.replace(/\.ksage$/i, "");
  const commitRename = () => {
    if (!renaming) return;
    const tab = tabs.find((each) => each.id === renaming.id);
    setRenaming(null);
    const name = renaming.value.trim();
    if (tab && name && name !== baseName(tab)) onRename(tab.id, name);
  };
  return (
    <aside className="side-panel scene-list" aria-label="Scenes" {...help("scene.tabs")}>
      <section className="panel-card scene-card">
        <div className="panel-header-bar">
          <h2 className="side-panel-title">Scenes</h2>
        </div>
        <ol ref={drag.listRef} className={`scene-list-items ${picking ? "picking" : ""}`} role="listbox" aria-label="Scenes">
          {tabs.map((tab, index) => {
            const active = tab.id === activeId;
            return (
              <li
                key={tab.id}
                data-key={tab.id}
                role="option"
                aria-selected={active}
                className={`scene-list-item ${active ? "active" : ""} ${drag.dragging === tab.id ? "dragging" : ""}`}
                data-tip={picking ? "Click to play this scene on the selected slice" : undefined}
                onPointerDown={(event) => {
                  if (event.button !== 0) return;
                  if (event.ctrlKey && canPick) {
                    /* The pick, then the scene shows, as a plain click shows it; no drag starts. */
                    onPick(tab.id);
                    onSelect(tab.id);
                    return;
                  }
                  onSelect(tab.id);
                  drag.start(tab.id)(event);
                }}
                onAuxClick={(event) => { if (event.button === 1) onClose(tab.id); }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  setMenu({ id: tab.id, left: event.clientX, top: event.clientY });
                }}
              >
                <span className="scene-list-number">{index + 1}</span>
                {renaming?.id === tab.id ? (
                  <input
                    className="scene-list-rename"
                    value={renaming.value}
                    autoFocus
                    spellCheck={false}
                    aria-label={`New name for ${tab.fileName}`}
                    onFocus={(event) => event.currentTarget.select()}
                    onChange={(event) => setRenaming({ id: tab.id, value: event.target.value })}
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
                  <span className="scene-list-name">{baseName(tab)}</span>
                )}
                <button
                  className="scene-list-close"
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => onClose(tab.id)}
                  data-tip={active ? "Remove the scene from the file `Ctrl+w`" : "Remove the scene from the file"}
                  aria-label={`Remove ${tab.fileName}`}
                >
                  <Trash size={12} weight="bold" />
                </button>
              </li>
            );
          })}
        </ol>
        {menu && createPortal(
          <ContextMenu
            position={{ left: menu.left, top: menu.top }}
            onClose={() => setMenu(null)}
            items={(() => {
              const tab = tabs.find((each) => each.id === menu.id);
              return [
                { label: tab?.path ? "Rename…" : "Rename… (save the file first)", icon: <PencilSimple size={14} />, disabled: !tab?.path, run: () => tab && setRenaming({ id: tab.id, value: baseName(tab) }) },
                { label: "Remove Scene", icon: <Trash size={14} />, run: () => onClose(menu.id) }
              ];
            })()}
          />,
          document.body
        )}
        {/* The footer: how many scenes. The title bar has the file's one unsaved mark. */}
        <div className="files-card-foot">
          <span>{tabs.length === 1 ? "1 scene" : `${tabs.length} scenes`}</span>
        </div>
      </section>
    </aside>
  );
}
