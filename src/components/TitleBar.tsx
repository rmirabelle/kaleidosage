import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DownloadSimple } from "@phosphor-icons/react";
import { WindowControls } from "./WindowControls";
import { help } from "../help/topics";

interface Props {
  updateAvailable: boolean;
  onAbout: () => void;
  /** The scene file's name, "Untitled Scene" for a scene that was never saved, or null when no scene is open (the start screen). */
  fileName: string | null;
  /** True when the scene has changes that are not saved; a red asterisk shows. */
  dirty: boolean;
  /** The open playlist file's name, or null; it shows before the scene, with its own asterisk. */
  playlistName: string | null;
  playlistDirty: boolean;
}

/** The window's title bar: the app name, the scene file name, the update button when an update is ready, and the window controls. */
export function TitleBar({ updateAvailable, onAbout, fileName, dirty, playlistName, playlistDirty }: Props) {
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
      {/* One centered group: the open playlist (if any), then the scene, each with its own asterisk. */}
      {(playlistName !== null || fileName !== null) && (
        <div className="titlebar-file" data-tauri-drag-region>
          {playlistName !== null && (
            <span className="titlebar-part" data-tip={playlistDirty ? "This playlist has changes that are not saved" : "The open playlist"} {...help("playlist")}>
              <span className="titlebar-file-name">{playlistName}</span>
              {playlistDirty && <span className="titlebar-dirty">*</span>}
            </span>
          )}
          {playlistName !== null && fileName !== null && <span className="titlebar-separator" aria-hidden="true">›</span>}
          {fileName !== null && (
            <span className="titlebar-part" data-tip={dirty ? "This scene has changes that are not saved" : undefined}>
              <span className="titlebar-file-name">{fileName}</span>
              {dirty && <span className="titlebar-dirty">*</span>}
            </span>
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
