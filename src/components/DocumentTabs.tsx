import { X } from "@phosphor-icons/react";
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
}

/**
 * The open file's scenes as document tabs above the picture, each labeled
 * with the scene's name, and a red asterisk while the scene has unsaved changes. The title bar has the file's unsaved mark. More tabs than one row holds go on to more rows. A press
 * selects a tab; a drag moves it to another place (see useDragReorder). A
 * middle click takes the scene out of the file.
 */
export function DocumentTabs({ tabs, activeId, onSelect, onClose, onReorder }: Props) {
  const drag = useDragReorder(tabs.map((tab) => tab.id), onReorder, true);
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
          >
            <span className="document-tab-name">{tab.fileName.replace(/.ksage$/i, "")}{tab.dirty && <span className="titlebar-dirty">*</span>}</span>
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
    </div>
  );
}
