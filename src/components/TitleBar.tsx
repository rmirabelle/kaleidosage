import { isTauri } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DownloadSimple, Info } from "@phosphor-icons/react";
import { WindowControls } from "./WindowControls";

interface Props {
  updateAvailable: boolean;
  onAbout: () => void;
}

/** The window's title bar: the app name, the update button when an update is ready, and the window controls. */
export function TitleBar({ updateAvailable, onAbout }: Props) {
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
      {updateAvailable && (
        <button className="titlebar-update-button" onClick={onAbout} title="A new Kaleido Sage version is available">
          <DownloadSimple size={14} weight="bold" /> Update available
        </button>
      )}
      <div className="titlebar-spacer" data-tauri-drag-region />
      <div className="titlebar-end">
        <button className="titlebar-icon-button" onClick={onAbout} title="About Kaleido Sage" aria-label="About Kaleido Sage">
          <Info size={15} />
        </button>
      </div>
      <WindowControls />
    </header>
  );
}
