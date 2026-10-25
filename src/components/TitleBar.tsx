import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DownloadSimple } from "@phosphor-icons/react";
import { WindowControls } from "./WindowControls";
import { help } from "../help/topics";

interface Props {
  updateAvailable: boolean;
  onAbout: () => void;
  /** The open file's name, "Untitled" for a file that was never saved, or null when no file is open (the start screen). */
  fileName: string | null;
  /** True when the file has changes that are not saved; a red asterisk shows. */
  dirty: boolean;
  /** The selected scene's name, after the file's name. */
  sceneName: string | null;
}

/** The window's title bar: the app name, the open file and its scene, the update button when an update is ready, and the window controls. */
export function TitleBar({ updateAvailable, onAbout, fileName, dirty, sceneName }: Props) {
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
      {/* One centered group: the open file, with its asterisk, then the selected scene. */}
      {fileName !== null && (
        <div className="titlebar-file" data-tauri-drag-region>
          <span className="titlebar-part" data-tip={dirty ? "This file has changes that are not saved" : "The open file"} {...help("file")}>
            <span className="titlebar-file-name">{fileName}</span>
            {dirty && <span className="titlebar-dirty">*</span>}
          </span>
          {sceneName !== null && (
            <>
              <span className="titlebar-separator" aria-hidden="true">›</span>
              <span className="titlebar-part">
                <span className="titlebar-file-name">{sceneName}</span>
              </span>
            </>
          )}
        </div>
      )}
      {updateAvailable && (
        <button className="titlebar-update-button" onClick={onAbout} data-tip="A new Kaleido Sage version is available">
          <DownloadSimple size={14} weight="bold" /> Update available
        </button>
      )}
      <div className="titlebar-spacer" data-tauri-drag-region />
      <WindowControls />
    </header>
  );
}
