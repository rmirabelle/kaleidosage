import { useState } from "react";
import { createPortal } from "react-dom";
import { PencilSimple, Trash, X } from "@phosphor-icons/react";
import { ContextMenu } from "./ContextMenu";
import { help } from "../help/topics";
import { useDragReorder } from "./useDragReorder";

export interface DocumentTabInfo {
  id: number;
  /** The scene's name (its copy's file name, with .ksage), or "Untitled Scene" (with a number after the first) for a scene that was never saved. */
  fileName: string;
  /** The scene's copy in the temp folder (see kaleidoFile.ts); null for a scene that was never saved. */
  path: string | null;
  /** True when the scene has changes that are not saved; a red asterisk shows after its name. */
  dirty?: boolean;
}

interface Props {
  tabs: DocumentTabInfo[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
  /** The tabs' ids in a new order, after a drag. */
  onReorder: (ids: number[]) => void;
  /** Renames a saved scene (its new name, without .ksage). */
  onRename?: (id: number, name: string) => void;
}

/**
 * The open file's scenes as document tabs above the picture, each labeled
 * with the scene's name, and a red asterisk while the scene has unsaved changes. The title bar has the file's unsaved mark. More tabs than one row holds go on to more rows. A press
 * selects a tab; a drag moves it to another place (see useDragReorder). A
 * middle click takes the scene out of the file. A double-click, or Rename
 * in the right-click menu, renames a saved scene in place, as in the scene
 * list (see SceneList).
 */
export function DocumentTabs({ tabs, activeId, onSelect, onClose, onReorder, onRename }: Props) {
  const drag = useDragReorder(tabs.map((tab) => tab.id), onReorder, true);
  const [menu, setMenu] = useState<{ id: number; left: number; top: number } | null>(null);
  const [renaming, setRenaming] = useState<{ id: number; value: string } | null>(null);
  const baseName = (tab: DocumentTabInfo) => tab.fileName.replace(/\.ksage$/i, "");
  const startRename = (tab: DocumentTabInfo) => { if (tab.path && onRename) setRenaming({ id: tab.id, value: baseName(tab) }); };
  const commitRename = () => {
    if (!renaming) return;
    const tab = tabs.find((each) => each.id === renaming.id);
    setRenaming(null);
    const name = renaming.value.trim();
    if (tab && name && name !== baseName(tab)) onRename?.(tab.id, name);
  };
  return (
    <div ref={drag.listRef} className="document-tabs" role="tablist" {...help("scene.tabs")}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            data-key={tab.id}
            className={`document-tab ${active ? "active" : ""} ${drag.dragging === tab.id ? "dragging" : ""}`}
            role="tab"
            aria-selected={active}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              onSelect(tab.id);
              drag.start(tab.id)(event);
            }}
            onAuxClick={(event) => { if (event.button === 1) onClose(tab.id); }}
            onDoubleClick={() => startRename(tab)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ id: tab.id, left: event.clientX, top: event.clientY });
            }}
          >
            {renaming?.id === tab.id ? (
              <input
                className="scene-list-rename document-tab-rename"
                value={renaming.value}
                autoFocus
                spellCheck={false}
                aria-label={`New name for ${tab.fileName}`}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setRenaming({ id: tab.id, value: event.target.value })}
                onPointerDown={(event) => event.stopPropagation()}
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => {
                  /* Here, so the keys do not also reach the app's shortcuts. */
                  event.stopPropagation();
                  if (event.key === "Enter") commitRename();
                  if (event.key === "Escape") setRenaming(null);
                }}
                onBlur={commitRename}
              />
            ) : (
              <span className="document-tab-name">{baseName(tab)}{tab.dirty && <span className="titlebar-dirty">*</span>}</span>
            )}
            <button
              className="document-tab-close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onClose(tab.id)}
              data-tip={active ? "Remove the scene from the project `Ctrl+w`" : "Remove the scene from the project"}
              aria-label={`Remove ${tab.fileName}`}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        );
      })}
      {menu && createPortal(
        <ContextMenu
          position={{ left: menu.left, top: menu.top }}
          onClose={() => setMenu(null)}
          items={(() => {
            const tab = tabs.find((each) => each.id === menu.id);
            return [
              { label: tab?.path ? "Rename…" : "Rename… (save the project first)", icon: <PencilSimple size={14} />, disabled: !tab?.path || !onRename, run: () => tab && startRename(tab) },
              { label: "Remove Scene", icon: <Trash size={14} />, run: () => onClose(menu.id) }
            ];
          })()}
        />,
        document.body
      )}
    </div>
  );
}
