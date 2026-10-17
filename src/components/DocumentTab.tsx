import { X } from "@phosphor-icons/react";

interface Props {
  /** The scene file's name, or "Untitled Scene" for a scene that was never saved. */
  fileName: string;
  /** The scene file's full path, shown as the tab's tooltip; null for a scene that was never saved. */
  path: string | null;
  /** True when the scene has changes that are not saved; a red asterisk shows. */
  dirty: boolean;
  onClose: () => void;
}

/** The open scene as a document tab above the picture, labeled with the scene file name. */
export function DocumentTab({ fileName, path, dirty, onClose }: Props) {
  return (
    <div className="document-tabs" role="tablist">
      <div className="document-tab" role="tab" aria-selected title={path ?? undefined}>
        <span className="document-tab-name">{fileName}</span>
        {dirty && <span className="titlebar-dirty" title="This scene has changes that are not saved">*</span>}
        <button className="document-tab-close" onClick={onClose} title="Close the scene (Ctrl+W)" aria-label="Close the scene">
          <X size={13} weight="bold" />
        </button>
      </div>
    </div>
  );
}
