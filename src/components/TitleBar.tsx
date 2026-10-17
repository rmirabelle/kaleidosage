import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DownloadSimple } from "@phosphor-icons/react";
import { WindowControls } from "./WindowControls";

interface Props {
  updateAvailable: boolean;
  onAbout: () => void;
  /** The scene file's name, "Untitled Scene" for a scene that was never saved, or null when no scene is open (the start screen). */
  fileName: string | null;
  /** True when the scene has changes that are not saved; a red asterisk shows. */
  dirty: boolean;
}

/** The window's title bar: the app name, the scene file name, the update button when an update is ready, and the window controls. */
export function TitleBar({ updateAvailable, onAbout, fileName, dirty }: Props) {
  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onDoubleClick={() => isTauri() && getCurrentWindow().toggleMaximize()}
    >
      <div className="brand" data-tauri-drag-region>
        <img src="/icon.ico" alt="" />
        <span>Kaleido Sage</span>
      </div>
      {fileName !== null && (
        <div className="titlebar-file" data-tauri-drag-region title={dirty ? "This scene has changes that are not saved" : undefined}>
          <span className="titlebar-file-name">{fileName}</span>
          {dirty && <span className="titlebar-dirty">*</span>}
        </div>
      )}
      {updateAvailable && (
        <button className="titlebar-update-button" onClick={onAbout} title="A new Kaleido Sage version is available">
          <DownloadSimple size={14} weight="bold" /> Update available
        </button>
      )}
      <div className="titlebar-spacer" data-tauri-drag-region />
      <WindowControls />
    </header>
  );
}
