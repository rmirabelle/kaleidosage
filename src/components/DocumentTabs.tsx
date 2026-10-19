import { X } from "@phosphor-icons/react";
import { help } from "../help/topics";
import { HelpButton } from "./HelpButton";

export interface DocumentTabInfo {
  id: number;
  /** The scene file's name, or "Untitled Scene" (with a number after the first) for a scene that was never saved. */
  fileName: string;
  /** The scene file's full path, shown as the tab's tooltip; null for a scene that was never saved. */
  path: string | null;
  /** True when the scene has changes that are not saved; a red asterisk shows. */
  dirty: boolean;
}

interface Props {
  tabs: DocumentTabInfo[];
  activeId: number | null;
  onSelect: (id: number) => void;
  onClose: (id: number) => void;
}

/** The open scenes as document tabs above the picture, each labeled with its scene file name. A middle click closes a tab. */
export function DocumentTabs({ tabs, activeId, onSelect, onClose }: Props) {
  return (
    <div className="document-tabs" role="tablist" {...help("scene.tabs")}>
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <div
            key={tab.id}
            className={`document-tab ${active ? "active" : ""}`}
            role="tab"
            aria-selected={active}
            data-tip={tab.path ?? undefined}
            onPointerDown={(event) => { if (event.button === 0) onSelect(tab.id); }}
            onAuxClick={(event) => { if (event.button === 1) onClose(tab.id); }}
          >
            <span className="document-tab-name">{tab.fileName}</span>
            {tab.dirty && <span className="titlebar-dirty" data-tip="This scene has changes that are not saved">*</span>}
            <button
              className="document-tab-close"
              onPointerDown={(event) => event.stopPropagation()}
              onClick={() => onClose(tab.id)}
              data-tip={active ? "Close the scene (Ctrl+W)" : "Close the scene"}
              aria-label={`Close ${tab.fileName}`}
            >
              <X size={13} weight="bold" />
            </button>
          </div>
        );
      })}
      {/* The help button sits after the last tab. */}
      <HelpButton topic="scene.tabs" inline />
    </div>
  );
}
